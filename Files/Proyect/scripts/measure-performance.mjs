// Prueba de rendimiento local no destructiva: instancia aislada, sin tocar la DB del usuario.
// Node.js 24 + npm dependencies requeridos.
import { spawn } from 'node:child_process';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { createAdmin } from './admin-account.mjs';
import crypto from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temp = await mkdtemp(path.join(os.tmpdir(), 'vilas-rendimiento-'));
const port = 34500 + Math.floor(Math.random() * 1000);
const origin = `http://127.0.0.1:${port}`;
const password = crypto.randomBytes(24).toString('base64url');
createAdmin(path.join(temp, 'prueba.sqlite'), { password });
const child = spawn(process.execPath, ['server.js'], {
  cwd: root,
  env: { ...process.env, PORT: String(port), VILAS_DB_PATH: path.join(temp, 'prueba.sqlite'),
    NODE_ENV: 'test' },
  stdio: ['ignore', 'pipe', 'pipe']
});
let log = '';
child.stdout.on('data', b => { log += String(b); });
child.stderr.on('data', b => { log += String(b); });
try {
  let online = false;
  for (let i = 0; i < 80; i++) {
    if (child.exitCode !== null) throw new Error('El servidor terminó: ' + log);
    try { if ((await fetch(origin + '/api/health')).ok) { online = true; break; } } catch { /* esperando */ }
    await new Promise(r => setTimeout(r, 150));
  }
  if (!online) throw new Error('El servidor no inició: ' + log);
  const auth = await fetch(origin + '/api/auth/login', { method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password }) });
  if (!auth.ok) throw new Error('No se pudo iniciar sesión: ' + auth.status);
  const cookie = auth.headers.get('set-cookie')?.split(';')[0];
  if (!cookie) throw new Error('El servidor no devolvió cookie de sesión');

  // Una petición de calentamiento y 50 secuenciales: medición orientativa en equipo local.
  const request = () => fetch(origin + '/api/fleet', { headers: { Cookie: cookie } });
  if (!(await request()).ok) throw new Error('No se pudo consultar la flota');
  const durations = [];
  for (let i = 0; i < 50; i++) {
    const begin = performance.now();
    const result = await request();
    const ms = performance.now() - begin;
    if (!result.ok) throw new Error(`Solicitud ${i + 1}: HTTP ${result.status}`);
    durations.push(ms);
  }
  durations.sort((a, b) => a - b);
  const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
  const p95 = durations[Math.ceil(durations.length * 0.95) - 1];
  console.log('Vilas Motor | prueba local de rendimiento (API /api/fleet)');
  console.log('50 solicitudes GET autenticadas, secuenciales, base temporal vacía');
  console.log(`Promedio: ${avg.toFixed(2)} ms | P95: ${p95.toFixed(2)} ms | Máximo: ${durations.at(-1).toFixed(2)} ms`);
  console.log('Medida orientativa de entorno local; NO equivale a prueba de carga empresarial.');
  const report = {
    sistema: 'Vilas Motor', tipo: 'Prueba local de rendimiento', fecha: new Date().toISOString(),
    node: process.version, endpoint: '/api/fleet', peticiones: durations.length,
    metodo: '50 GET autenticadas secuenciales, servidor aislado, SQLite temporal vacía',
    promedio_ms: Number(avg.toFixed(2)), p95_ms: Number(p95.toFixed(2)),
    maximo_ms: Number(durations.at(-1).toFixed(2)), errores_http: 0,
    limitacion: 'No representa concurrencia, volumen real de equipos ni rendimiento empresarial.'
  };
  const evidenceDir = path.join(root, 'tests', 'results');
  await mkdir(evidenceDir, { recursive: true });
  const reportPath = path.join(evidenceDir, 'rendimiento_local.json');
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
  console.log('Evidencia guardada en:', reportPath);

} finally {
  child.kill();
  await new Promise(resolve => { if (child.exitCode !== null) resolve(); else { child.once('exit', resolve); setTimeout(resolve, 2500).unref(); } });
  await rm(temp, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
}
