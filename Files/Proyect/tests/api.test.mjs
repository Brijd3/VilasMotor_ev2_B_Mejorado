import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAdmin } from '../scripts/admin-account.mjs';
import crypto from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('API: permisos, persistencia, historial y mantenimiento', async t => {
  const workdir = await mkdtemp(path.join(tmpdir(), 'vilas-api-test-'));
  const port = 32000 + Math.floor(Math.random() * 1000);
  const base = `http://127.0.0.1:${port}`;
  const adminPassword = crypto.randomBytes(24).toString('base64url');
  const mechanicPassword = crypto.randomBytes(24).toString('base64url');
  const testDbPath = path.join(workdir, 'test.sqlite');
  createAdmin(testDbPath, { password: adminPassword });
  const subprocess = spawn(process.execPath, ['server.js'], {
    cwd: root,
    env: { ...process.env, PORT: String(port), VILAS_DB_PATH: testDbPath, NODE_ENV: 'test' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  subprocess.stdout.on('data', data => { output += data.toString(); });
  subprocess.stderr.on('data', data => { output += data.toString(); });
  t.after(async () => {
    subprocess.kill();
    await new Promise(resolve => { if (subprocess.exitCode !== null) resolve(); else subprocess.once('exit', resolve); });
    await rm(workdir, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 });
  });

  let healthy = false;
  for (let i = 0; i < 60; i++) {
    if (subprocess.exitCode !== null) throw new Error(`Servidor terminó inesperadamente:\n${output}`);
    try { if ((await fetch(`${base}/api/health`)).ok) { healthy = true; break; } } catch { /* arranque */ }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  assert.ok(healthy, `Servidor no inició:\n${output}`);

  const api = async (pathName, options = {}) => {
    const res = await fetch(base + pathName, options);
    return { status: res.status, json: await res.json(), cookie: res.headers.get('set-cookie') };
  };
  const credentials = async (username, password) => {
    const r = await api('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }) });
    assert.equal(r.status, 200);
    return { cookie: r.cookie.split(';')[0], csrf: r.json.csrfToken };
  };
  const session = await credentials('admin', adminPassword);
  const createdMechanic = await api('/api/users', { method: 'POST', headers: { Cookie: session.cookie.split(';')[0], 'X-CSRF-Token': session.csrf, 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'mecanico', name: 'Mecánico de Prueba', role: 'mecanico', password: mechanicPassword }) });
  assert.equal(createdMechanic.status, 201, JSON.stringify(createdMechanic.json));
  const mechanic = await credentials('mecanico', mechanicPassword);
  const authApi = (sessionObj, method, pathName, body, withCsrf = true) => api(pathName, {
    method, headers: { Cookie: sessionObj.cookie, ...(withCsrf ? { 'X-CSRF-Token': sessionObj.csrf } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });

  await t.test('Sin sesión se deniega lectura de flota', async () => {
    assert.equal((await api('/api/fleet')).status, 401);
  });
  await t.test('Historial privado: sin sesión se deniega acceso', async () => {
    assert.equal((await api('/api/fleet/1/history')).status, 401);
  });
  await t.test('No se permite iniciar sesión con credenciales falsas', async () => {
    assert.equal((await api('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'clave-equivocada' }) })).status, 401);
  });
  await t.test('Acceso por rol: un mecánico no administra usuarios', async () => {
    assert.equal((await authApi(mechanic, 'GET', '/api/users')).status, 403);
    assert.equal((await authApi(mechanic, 'POST', '/api/users', {
      username: 'intruso', name: 'Intruso', role: 'admin', password: 'NoDebeCrearse2026!'
    })).status, 403);
  });
  await t.test('Se rechaza una mutación desde un origen no permitido', async () => {
    const response = await api('/api/fleet', { method: 'POST',
      headers: { Cookie: session.cookie, 'X-CSRF-Token': session.csrf,
        Origin: 'http://sitio-ajeno.invalid', 'Content-Type': 'application/json' },
      body: JSON.stringify({}) });
    assert.equal(response.status, 403);
  });
  await t.test('El mecánico no puede crear equipos', async () => {
    assert.equal((await authApi(mechanic, 'POST', '/api/fleet', {})).status, 403);
  });
  await t.test('No se pueden cambiar datos sin token CSRF', async () => {
    assert.equal((await authApi(session, 'POST', '/api/fleet', {}, false)).status, 403);
  });

  const equipment = {
    nInterno: 'V168', tipo: 'GRUA HORQUILLA', ppu: 'SIN PPU', estadoEquipo: 'INTERNO', cliente: 'Vilas Motor',
    sucursal: 'Iquique', faena: 'Taller', marca: 'DEMO', modelo: 'Caso de prueba',
    ultimoMantenimiento: { tipoMan: '500 HRS', hrsKm: 2500, fecha: '2026-09-01' },
    datosActuales: { hrsKm: 3157, fechaRegistro: '2026-10-01T15:00:00Z' },
    proxMantenimiento: { tipoMan: '500 HRS', hrsKm: 3500 }
  };
  const added = await authApi(session, 'POST', '/api/fleet', equipment);
  assert.equal(added.status, 201, JSON.stringify(added.json));
  const id = added.json.id;

  await t.test('Equipo persistido en SQLite', async () => {
    const list = await authApi(session, 'GET', '/api/fleet');
    assert.equal(list.status, 200);
    assert.ok(list.json.some(eq => eq.id === id));
  });
  await t.test('Validación impide retroceder lectura', async () => {
    const result = await authApi(mechanic, 'POST', `/api/fleet/${id}/readings`, { value: 3000 });
    assert.equal(result.status, 400);
  });
  await t.test('No admite lecturas fraccionarias', async () => {
    const result = await authApi(mechanic, 'POST', `/api/fleet/${id}/readings`, { value: 3157.5 });
    assert.equal(result.status, 400);
  });
  await t.test('No admite una lectura duplicada', async () => {
    const result = await authApi(mechanic, 'POST', `/api/fleet/${id}/readings`, { value: 3157 });
    assert.equal(result.status, 400);
  });
  await t.test('Mecánico registra lectura y se conserva historial', async () => {
    const result = await authApi(mechanic, 'POST', `/api/fleet/${id}/readings`, { value: 3200, source: 'migracion' });
    assert.equal(result.status, 201, JSON.stringify(result.json));
    const history = await authApi(mechanic, 'GET', `/api/fleet/${id}/history`);
    assert.equal(history.json.readings.length, 2);
    assert.equal(history.json.readings[0].value, 3200);
    assert.equal(history.json.readings[0].source, 'manual');
  });
  await t.test('Solo el administrador puede registrar mantenimiento', async () => {
    const data = { performedAt: '2026-10-05', type: 'Preventivo', value: 3200, nextValue: 3700,
      workOrder: 'OT-2026-001', notes: 'Cambio de filtros', supplies: 'Aceite y filtro' };
    assert.equal((await authApi(mechanic, 'POST', `/api/fleet/${id}/maintenances`, data)).status, 403);
    const saved = await authApi(session, 'POST', `/api/fleet/${id}/maintenances`, data);
    assert.equal(saved.status, 201, JSON.stringify(saved.json));
    const history = await authApi(session, 'GET', `/api/fleet/${id}/history`);
    assert.equal(history.json.maintenances[0].work_order, 'OT-2026-001');
    const fleet = await authApi(session, 'GET', '/api/fleet');
    assert.equal(fleet.json[0].proxMantenimiento.hrsKm, 3700);
  });
  await t.test('Documentos de terreno: acceso sin sesión denegado', async () => {
    assert.equal((await api(`/api/fleet/${id}/documents`)).status, 401);
  });
  await t.test('Documentos de terreno: escritura sin CSRF denegada', async () => {
    const result = await authApi(mechanic, 'POST', `/api/fleet/${id}/documents`,
      { title: 'Informe prueba', content: 'Observación técnica' }, false);
    assert.equal(result.status, 403);
  });
  await t.test('Documentos de terreno: campos vacíos o muy extensos denegados', async () => {
    assert.equal((await authApi(mechanic, 'POST', `/api/fleet/${id}/documents`,
      { title: '', content: 'Texto' })).status, 400);
    assert.equal((await authApi(mechanic, 'POST', `/api/fleet/${id}/documents`,
      { title: 'Informe', content: 'A'.repeat(5001) })).status, 400);
  });
  await t.test('Mecánico registra texto libre en repositorio separado de SQLite', async () => {
    const text = 'Se observó vibración leve.\nCondición de terreno: polvo y humedad.';
    const result = await authApi(mechanic, 'POST', `/api/fleet/${id}/documents`,
      { title: 'Inspección en terreno', content: text });
    assert.equal(result.status, 201, JSON.stringify(result.json));
    assert.equal(result.json.actorName, 'Mecánico de Prueba');
    const history = await authApi(session, 'GET', `/api/fleet/${id}/documents`);
    assert.equal(history.status, 200);
    assert.equal(history.json.length, 1);
    assert.equal(history.json[0].content, text);
    const { readFile } = await import('node:fs/promises');
    const txtPath = path.join(workdir, 'documentos-terreno', String(id), result.json.id + '.txt');
    assert.equal((await readFile(txtPath, 'utf8')).trimEnd(), text);
  });
  await t.test('Desactivación no borra historial', async () => {
    assert.equal((await authApi(session, 'DELETE', `/api/fleet/${id}`)).status, 200);
    const list = await authApi(session, 'GET', '/api/fleet');
    assert.ok(!list.json.some(eq => eq.id === id));
  });
  await t.test('Registro de usuario rechaza contraseñas con menos de 12 caracteres', async () => {
    const res = await api('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'nuevo_user', name: 'Nuevo', password: 'Corta1!' })
    });
    assert.equal(res.status, 400);
    assert.match(res.json.error, /12 y 128/);
  });
  await t.test('Registro de usuario exige mayúsculas, minúsculas, números y símbolos', async () => {
    const resNoUpper = await api('/api/auth/register', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'user1', name: 'User Uno', password: 'password1234!' })
    });
    assert.equal(resNoUpper.status, 400);
    assert.match(resNoUpper.json.error, /mayúscula/);

    const resNoSpecial = await api('/api/auth/register', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'user2', name: 'User Dos', password: 'Password12345' })
    });
    assert.equal(resNoSpecial.status, 400);
    assert.match(resNoSpecial.json.error, /especial/);
  });
  await t.test('Registro de usuario exitoso con contraseña de 12+ caracteres e inicio de sesión automático', async () => {
    const res = await api('/api/auth/register', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'mecanico_nuevo', name: 'Mecánico Registrado', password: 'PasswordSegura2026!' })
    });
    assert.equal(res.status, 201);
    assert.equal(res.json.user.username, 'mecanico_nuevo');
    assert.ok(res.json.csrfToken);
    assert.ok(res.cookie);

    // Duplicado debe ser rechazado
    const dup = await api('/api/auth/register', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'mecanico_nuevo', name: 'Otro', password: 'PasswordSegura2026!' })
    });
    assert.equal(dup.status, 409);
  });
  await t.test('Cierre de sesión revoca la sesión', async () => {
    assert.equal((await authApi(session, 'POST', '/api/auth/logout')).status, 200);
    assert.equal((await authApi(session, 'GET', '/api/fleet')).status, 401);
  });
});
