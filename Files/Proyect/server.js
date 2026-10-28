import express from 'express';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createDocumentStore } from './shared/documentStore.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3001);
const DB_PATH = path.resolve(process.env.VILAS_DB_PATH || path.join(ROOT, 'data', 'vilas-motor.sqlite'));
const documentStore = createDocumentStore(path.join(path.dirname(DB_PATH), 'documentos-terreno'));
const COOKIE = 'vilas_session';
const SESSION_HOURS = 8;
const ITERATIONS = 210_000;
const allowedOrigins = new Set([
  `http://localhost:${PORT}`, `http://127.0.0.1:${PORT}`,
  'http://localhost:5173', 'http://127.0.0.1:5173',
  ...(process.env.VILAS_ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean)
]);

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);
const run = async (sql, params = []) => {
  const result = db.prepare(sql).run(...params);
  return { lastID: Number(result.lastInsertRowid ?? 0), changes: Number(result.changes ?? 0) };
};
const get = async (sql, params = []) => db.prepare(sql).get(...params);
const all = async (sql, params = []) => db.prepare(sql).all(...params);
// A single connection is shared by requests. Serialize multi-query transactions.
let writeQueue = Promise.resolve();
function lockedWrite(callback) {
  const next = writeQueue.catch(() => {}).then(callback);
  writeQueue = next.catch(() => {});
  return next;
}
async function transaction(callback) {
  return lockedWrite(async () => {
    await run('BEGIN IMMEDIATE');
    try {
      const result = await callback();
      await run('COMMIT');
      return result;
    } catch (error) {
      await run('ROLLBACK');
      throw error;
    }
  });
}

const now = () => new Date().toISOString();
const normalized = (value, max = 150) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const integer = (value, label) => {
  const num = Number(value);
  if (value === '' || value === null || value === undefined || !Number.isSafeInteger(num) || num < 0 || num > 999_999_999) {
    throw invalid(`${label} debe ser un número entero válido (0 a 999.999.999).`);
  }
  return num;
};
const invalid = (message, code = 400) => Object.assign(new Error(message), { status: code });
const passwordHash = (password, salt) => crypto.pbkdf2Sync(password, salt, ITERATIONS, 32, 'sha256').toString('hex');
const hashToken = token => crypto.createHash('sha256').update(token).digest('hex');
const secureRandom = () => crypto.randomBytes(24).toString('base64url');
const parseJSON = (value, fallback = {}) => {
  try { return JSON.parse(value) || fallback; } catch { return fallback; }
};

function validateEquipment(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw invalid('Equipo inválido.');
  const keys = ['nInterno', 'tipo', 'ppu', 'estadoEquipo', 'cliente', 'sucursal', 'faena', 'marca', 'modelo'];
  const result = {};
  for (const key of keys) result[key] = normalized(data[key] ?? (key === 'estadoEquipo' ? 'INTERNO' : ''));
  for (const key of ['nInterno', 'tipo', 'cliente', 'sucursal', 'faena', 'marca', 'modelo']) {
    if (!result[key]) throw invalid(`Campo obligatorio: ${key}.`);
  }
  result.ultimoMantenimiento = {
    tipoMan: normalized(data.ultimoMantenimiento?.tipoMan || 'Sin registrar'),
    hrsKm: integer(data.ultimoMantenimiento?.hrsKm ?? 0, 'Última mantención'),
    fecha: normalized(data.ultimoMantenimiento?.fecha || '', 40)
  };
  result.datosActuales = {
    hrsKm: integer(data.datosActuales?.hrsKm, 'Lectura actual'),
    fechaRegistro: normalized(data.datosActuales?.fechaRegistro || now(), 40)
  };
  result.proxMantenimiento = {
    tipoMan: normalized(data.proxMantenimiento?.tipoMan || 'Mantenimiento'),
    hrsKm: integer(data.proxMantenimiento?.hrsKm, 'Próxima mantención')
  };
  if (!Number.isFinite(Date.parse(result.datosActuales.fechaRegistro))) throw invalid('Fecha de registro inválida.');
  return result;
}
const fleetColumns = [
  'nInterno', 'tipo', 'ppu', 'estadoEquipo', 'cliente', 'sucursal', 'faena', 'marca', 'modelo',
  'ultimoMantenimiento', 'datosActuales', 'proxMantenimiento'
];
const storedValues = e => fleetColumns.map(k => typeof e[k] === 'object' ? JSON.stringify(e[k]) : e[k]);
const parseFleet = e => ({
  ...e,
  ultimoMantenimiento: parseJSON(e.ultimoMantenimiento),
  datosActuales: parseJSON(e.datosActuales),
  proxMantenimiento: parseJSON(e.proxMantenimiento)
});

async function audit(actorId, action, entity, entityId, detail = {}) {
  await run('INSERT INTO audit_log (actor_id, action, entity, entity_id, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [actorId ?? null, action, entity, entityId ?? null, JSON.stringify(detail), now()]);
}
async function addEquipment(item, actorId, source = 'manual') {
  const existing = await get('SELECT id FROM fleet WHERE LOWER(nInterno) = LOWER(?) AND active = 1', [item.nInterno]);
  if (existing) throw invalid('Ya existe un equipo activo con ese número interno.', 409);
  const result = await run(`INSERT INTO fleet (${fleetColumns.join(',')}) VALUES (${fleetColumns.map(() => '?').join(',')})`, storedValues(item));
  await run('INSERT INTO horometer_readings (equipment_id, value, recorded_at, recorded_by, source) VALUES (?, ?, ?, ?, ?)',
    [result.lastID, item.datosActuales.hrsKm, item.datosActuales.fechaRegistro, actorId, source]);
  await audit(actorId, 'equipo_creado', 'fleet', result.lastID, { nInterno: item.nInterno });
  return result.lastID;
}

async function setup() {
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA busy_timeout = 5000');
  await run(`CREATE TABLE IF NOT EXISTS fleet (
    id INTEGER PRIMARY KEY AUTOINCREMENT, nInterno TEXT, tipo TEXT, ppu TEXT, estadoEquipo TEXT,
    cliente TEXT, sucursal TEXT, faena TEXT, marca TEXT, modelo TEXT,
    ultimoMantenimiento TEXT, datosActuales TEXT, proxMantenimiento TEXT, active INTEGER NOT NULL DEFAULT 1
  )`);
  const oldColumns = await all('PRAGMA table_info(fleet)');
  if (!oldColumns.some(c => c.name === 'active')) await run('ALTER TABLE fleet ADD COLUMN active INTEGER NOT NULL DEFAULT 1');
  await run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('admin','mecanico')), salt TEXT NOT NULL,
    password_hash TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1
  )`);
  await run(`CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    csrf_token TEXT NOT NULL, expires_at TEXT NOT NULL
  )`);
  await run(`CREATE TABLE IF NOT EXISTS horometer_readings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    equipment_id INTEGER NOT NULL REFERENCES fleet(id), value INTEGER NOT NULL CHECK(value >= 0),
    recorded_at TEXT NOT NULL, recorded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    source TEXT NOT NULL DEFAULT 'manual'
  )`);
  await run('CREATE INDEX IF NOT EXISTS idx_readings_equipment ON horometer_readings(equipment_id, recorded_at DESC)');
  await run(`CREATE TABLE IF NOT EXISTS maintenance_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    equipment_id INTEGER NOT NULL REFERENCES fleet(id), performed_at TEXT NOT NULL,
    value INTEGER NOT NULL CHECK(value >= 0), next_value INTEGER NOT NULL CHECK(next_value > value),
    type TEXT NOT NULL, work_order TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '',
    supplies TEXT NOT NULL DEFAULT '', recorded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL
  )`);
  await run('CREATE INDEX IF NOT EXISTS idx_maintenance_equipment ON maintenance_records(equipment_id, performed_at DESC)');
  await run(`CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT, actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action TEXT NOT NULL, entity TEXT NOT NULL, entity_id INTEGER, detail TEXT NOT NULL, created_at TEXT NOT NULL
  )`);
  // Migración: conservar al menos la última lectura de bases anteriores.
  for (const row of await all('SELECT id, datosActuales FROM fleet WHERE NOT EXISTS (SELECT 1 FROM horometer_readings WHERE equipment_id = fleet.id)')) {
    const data = parseJSON(row.datosActuales);
    const value = Number(data.hrsKm);
    if (Number.isSafeInteger(value) && value >= 0) {
      await run('INSERT INTO horometer_readings (equipment_id,value,recorded_at,recorded_by,source) VALUES (?,?,?,?,?)',
        [row.id, value, Number.isFinite(Date.parse(data.fechaRegistro)) ? data.fechaRegistro : now(), null, 'migracion']);
    }
  }
  // Los usuarios se crean mediante npm run admin:create o desde la interfaz del administrador.

}

const app = express();
app.disable('x-powered-by');
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cache-Control', 'no-store');
  next();
});
app.use(express.json({ limit: '64kb' }));
app.use((req, _res, next) => {
  const origin = req.get('Origin');
  if (origin && !allowedOrigins.has(origin) && !['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next(invalid('Origen no permitido.', 403));
  next();
});

function sessionCookie(token, res) {
  const secure = process.env.VILAS_HTTPS === '1' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=${SESSION_HOURS * 3600}${secure}`);
}
const cookieValue = header => (header || '').split(';').map(v => v.trim()).find(v => v.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
async function auth(req, _res, next) {
  try {
    const token = cookieValue(req.headers.cookie);
    if (token && /^[a-zA-Z0-9_-]{20,128}$/.test(token)) {
      const row = await get(`SELECT s.csrf_token, s.token_hash, u.id, u.username, u.name, u.role FROM sessions s
        JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ? AND u.active = 1`, [hashToken(token), now()]);
      if (row) req.auth = row;
    }
    next();
  } catch (e) { next(e); }
}
const authRequired = (req, _res, next) => req.auth ? next() : next(invalid('Debe iniciar sesión.', 401));
const adminOnly = (req, _res, next) => req.auth.role === 'admin' ? next() : next(invalid('No tiene permisos para esta acción.', 403));
const csrf = (req, _res, next) => {
  const sent = req.get('X-CSRF-Token') || '';
  const expected = req.auth.csrf_token;
  if (sent.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sent), Buffer.from(expected))) {
    return next(invalid('Token de seguridad inválido.', 403));
  }
  next();
};
const handler = fn => (req, res, next) => Promise.resolve().then(() => fn(req, res)).catch(next);
const idParam = req => {
  const n = Number(req.params.id);
  if (!Number.isSafeInteger(n) || n <= 0) throw invalid('Identificador inválido.');
  return n;
};

app.get('/api/health', (_req, res) => res.json({ status: 'ok', app: 'Vilas Motor' }));
app.post('/api/auth/login', handler(async (req, res) => {
  const username = normalized(req.body?.username, 80).toLowerCase();
  const password = req.body?.password;
  if (!username || typeof password !== 'string' || password.length > 300) throw invalid('Credenciales inválidas.', 401);
  const key = `${req.ip}:${username}`;
  const entry = failures.get(key);
  if (entry?.until > Date.now()) throw invalid('Demasiados intentos. Espere 10 minutos.', 429);
  const user = await get('SELECT * FROM users WHERE username = ? AND active = 1', [username]);
  const dummySalt = '00000000000000000000000000000000';
  const trial = passwordHash(password, user?.salt || dummySalt);
  const correct = user && crypto.timingSafeEqual(Buffer.from(trial), Buffer.from(user.password_hash));
  if (!correct) {
    const tries = (entry?.tries || 0) + 1;
    failures.set(key, { tries, until: tries >= 5 ? Date.now() + 10 * 60 * 1000 : 0 });
    throw invalid('Usuario o contraseña incorrectos.', 401);
  }
  failures.delete(key);
  const token = secureRandom();
  const csrfToken = secureRandom();
  await run('DELETE FROM sessions WHERE expires_at <= ?', [now()]);
  await run('INSERT INTO sessions (token_hash,user_id,csrf_token,expires_at) VALUES (?,?,?,?)',
    [hashToken(token), user.id, csrfToken, new Date(Date.now() + SESSION_HOURS * 3_600_000).toISOString()]);
  sessionCookie(token, res);
  await audit(user.id, 'inicio_sesion', 'user', user.id);
  res.json({ user: { id: user.id, username: user.username, name: user.name, role: user.role }, csrfToken });
}));
function validatePasswordStrength(password) {
  if (typeof password !== 'string') throw invalid('Contraseña requerida.');
  if (password.length < 12 || password.length > 128) {
    throw invalid('La contraseña debe tener entre 12 y 128 caracteres.');
  }
  if (!/[A-Z]/.test(password)) {
    throw invalid('La contraseña debe incluir al menos una letra mayúscula.');
  }
  if (!/[a-z]/.test(password)) {
    throw invalid('La contraseña debe incluir al menos una letra minúscula.');
  }
  if (!/[0-9]/.test(password)) {
    throw invalid('La contraseña debe incluir al menos un número.');
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    throw invalid('La contraseña debe incluir al menos un carácter especial (ej: !@#$%^&*).');
  }
}

app.post('/api/auth/register', handler(async (req, res) => {
  const username = normalized(req.body?.username, 80).toLowerCase();
  const name = normalized(req.body?.name, 100);
  const password = req.body?.password;
  const requestedRole = req.body?.role;
  const role = ['admin', 'mecanico'].includes(requestedRole) ? requestedRole : 'mecanico';

  if (!username || !/^[a-z0-9_.-]{3,80}$/.test(username)) {
    throw invalid('El nombre de usuario debe tener entre 3 y 80 caracteres (letras, números, puntos o guiones).');
  }
  if (!name || name.length < 2) {
    throw invalid('Ingrese un nombre completo válido (mínimo 2 caracteres).');
  }
  validatePasswordStrength(password);

  const existing = await get('SELECT id FROM users WHERE username = ?', [username]);
  if (existing) throw invalid('El nombre de usuario ya se encuentra registrado.', 409);

  const salt = crypto.randomBytes(16).toString('hex');
  const hash = passwordHash(password, salt);
  const result = await transaction(async () => {
    const added = await run('INSERT INTO users (username, name, role, salt, password_hash) VALUES (?, ?, ?, ?, ?)',
      [username, name, role, salt, hash]);
    await audit(added.lastID, 'usuario_registrado', 'user', added.lastID, { username, role });
    return added;
  });

  const token = secureRandom();
  const csrfToken = secureRandom();
  await run('DELETE FROM sessions WHERE expires_at <= ?', [now()]);
  await run('INSERT INTO sessions (token_hash, user_id, csrf_token, expires_at) VALUES (?, ?, ?, ?)',
    [hashToken(token), result.lastID, csrfToken, new Date(Date.now() + SESSION_HOURS * 3_600_000).toISOString()]);
  sessionCookie(token, res);

  res.status(201).json({
    user: { id: result.lastID, username, name, role },
    csrfToken
  });
}));

const failures = new Map();
app.use('/api', auth);
app.get('/api/auth/me', (req, res) => res.json(req.auth ? {
  user: { id: req.auth.id, username: req.auth.username, name: req.auth.name, role: req.auth.role },
  csrfToken: req.auth.csrf_token
} : { user: null }));
app.post('/api/auth/logout', authRequired, csrf, handler(async (req, res) => {
  await run('DELETE FROM sessions WHERE token_hash = ?', [req.auth.token_hash]);
  sessionCookie('', res);
  res.json({ success: true });
}));
app.post('/api/auth/change-password', authRequired, csrf, handler(async (req, res) => {
  const old = req.body?.currentPassword;
  const fresh = req.body?.newPassword;
  if (typeof old !== 'string' || typeof fresh !== 'string' || fresh.length < 12 || fresh.length > 128) {
    throw invalid('La nueva contraseña debe tener entre 12 y 128 caracteres.');
  }
  const user = await get('SELECT * FROM users WHERE id = ?', [req.auth.id]);
  const trial = passwordHash(old, user.salt);
  if (!crypto.timingSafeEqual(Buffer.from(trial), Buffer.from(user.password_hash))) throw invalid('Contraseña actual incorrecta.', 401);
  const salt = crypto.randomBytes(16).toString('hex');
  await transaction(async () => {
    await run('UPDATE users SET salt = ?, password_hash = ? WHERE id = ?', [salt, passwordHash(fresh, salt), user.id]);
    await run('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?', [user.id, req.auth.token_hash]);
    await audit(user.id, 'contrasena_cambiada', 'user', user.id);
  });
  res.json({ success: true });
}));
app.use('/api', authRequired);
app.get('/api/fleet', handler(async (_req, res) => {
  const data = await all('SELECT * FROM fleet WHERE active = 1 ORDER BY nInterno ASC');
  res.json(data.map(parseFleet));
}));
app.post('/api/fleet', adminOnly, csrf, handler(async (req, res) => {
  const item = validateEquipment(req.body);
  const id = await transaction(() => addEquipment(item, req.auth.id));
  const row = await get('SELECT * FROM fleet WHERE id = ?', [id]);
  res.status(201).json(parseFleet(row));
}));
app.put('/api/fleet/:id', adminOnly, csrf, handler(async (req, res) => {
  const id = idParam(req);
  const item = validateEquipment(req.body);
  await transaction(async () => {
    const previous = await get('SELECT * FROM fleet WHERE id = ? AND active = 1', [id]);
    if (!previous) throw invalid('Equipo no encontrado.', 404);
    const other = await get('SELECT id FROM fleet WHERE LOWER(nInterno) = LOWER(?) AND id != ? AND active = 1', [item.nInterno, id]);
    if (other) throw invalid('Ya existe un equipo con ese número interno.', 409);
    const old = parseFleet(previous);
    if (item.datosActuales.hrsKm < Number(old.datosActuales.hrsKm)) throw invalid('El horómetro no puede retroceder.');
    const changedReading = item.datosActuales.hrsKm !== Number(old.datosActuales.hrsKm);
    item.datosActuales.fechaRegistro = changedReading ? now() : old.datosActuales.fechaRegistro;
    await run(`UPDATE fleet SET ${fleetColumns.map(c => `${c} = ?`).join(', ')} WHERE id = ?`, [...storedValues(item), id]);
    if (changedReading) {
      await run('INSERT INTO horometer_readings (equipment_id,value,recorded_at,recorded_by,source) VALUES (?,?,?,?,?)',
        [id, item.datosActuales.hrsKm, item.datosActuales.fechaRegistro, req.auth.id, 'edicion_equipo']);
    }
    await audit(req.auth.id, 'equipo_editado', 'fleet', id);
  });
  res.json(parseFleet(await get('SELECT * FROM fleet WHERE id = ?', [id])));
}));
app.delete('/api/fleet/:id', adminOnly, csrf, handler(async (req, res) => {
  const id = idParam(req);
  const changes = await transaction(async () => {
    const out = await run('UPDATE fleet SET active = 0 WHERE id = ? AND active = 1', [id]);
    if (out.changes) await audit(req.auth.id, 'equipo_desactivado', 'fleet', id);
    return out.changes;
  });
  if (!changes) throw invalid('Equipo no encontrado.', 404);
  res.json({ success: true });
}));
app.post('/api/fleet/:id/readings', csrf, handler(async (req, res) => {
  const id = idParam(req);
  const value = integer(req.body?.value, 'Lectura');
  // El origen de registros enviados desde la interfaz es siempre manual.
  // No permitir que un usuario suplante registros de demo/migración.
  const source = 'manual';
  const record = await transaction(async () => {
    const row = await get('SELECT * FROM fleet WHERE id = ? AND active = 1', [id]);
    if (!row) throw invalid('Equipo no encontrado.', 404);
    const item = parseFleet(row);
    if (value < Number(item.datosActuales.hrsKm)) throw invalid('El horómetro no puede ser menor a la lectura anterior.');
    if (value === Number(item.datosActuales.hrsKm)) throw invalid('La lectura coincide con la actual.');
    const date = now();
    await run('UPDATE fleet SET datosActuales = ? WHERE id = ?', [JSON.stringify({ hrsKm: value, fechaRegistro: date }), id]);
    const result = await run('INSERT INTO horometer_readings (equipment_id,value,recorded_at,recorded_by,source) VALUES (?,?,?,?,?)',
      [id, value, date, req.auth.id, source]);
    await audit(req.auth.id, 'lectura_registrada', 'fleet', id, { value });
    return { id: result.lastID, value, recorded_at: date };
  });
  res.status(201).json(record);
}));
// Informes de terreno: documentos .txt no estructurados vinculados a equipos SQLite.
// Pueden registrarlos tanto administrador como mecánico, sin permitir alterar mantenimientos.
app.get('/api/fleet/:id/documents', handler(async (req, res) => {
  const id = idParam(req);
  const equipment = await get('SELECT id FROM fleet WHERE id = ? AND active = 1', [id]);
  if (!equipment) throw invalid('Equipo no encontrado.', 404);
  res.json(documentStore.list(id));
}));
app.post('/api/fleet/:id/documents', csrf, handler(async (req, res) => {
  const id = idParam(req);
  const title = req.body?.title;
  const content = req.body?.content;
  if (typeof title !== 'string' || !title.trim() || title.trim().length > 100 ||
      typeof content !== 'string' || !content.trim() || content.trim().length > 5000) {
    throw invalid('Título (1-100) y descripción libre (1-5000 caracteres) obligatorios.');
  }
  const equipment = await get('SELECT id FROM fleet WHERE id = ? AND active = 1', [id]);
  if (!equipment) throw invalid('Equipo no encontrado.', 404);
  // Los nombres de archivo se generan en el servidor; no se aceptan rutas del usuario.
  const report = await lockedWrite(async () => {
    const created = documentStore.create({ equipmentId: id, title, content,
      actorId: req.auth.id, actorName: req.auth.name });
    await audit(req.auth.id, 'informe_terreno_registrado', 'fleet', id, { documentId: created.id });
    return created;
  });
  res.status(201).json(report);
}));

app.get('/api/fleet/:id/history', handler(async (req, res) => {
  const id = idParam(req);
  const equipment = await get('SELECT id FROM fleet WHERE id = ? AND active = 1', [id]);
  if (!equipment) throw invalid('Equipo no encontrado.', 404);
  const readings = await all(`SELECT r.id,r.value,r.recorded_at,r.source,u.name AS user_name
    FROM horometer_readings r LEFT JOIN users u ON u.id = r.recorded_by
    WHERE r.equipment_id = ? ORDER BY r.recorded_at DESC, r.id DESC LIMIT 300`, [id]);
  const maintenances = await all(`SELECT m.*,u.name AS user_name
    FROM maintenance_records m LEFT JOIN users u ON u.id = m.recorded_by
    WHERE m.equipment_id = ? ORDER BY m.performed_at DESC,m.id DESC LIMIT 300`, [id]);
  res.json({ readings, maintenances });
}));
app.post('/api/fleet/:id/maintenances', adminOnly, csrf, handler(async (req, res) => {
  const id = idParam(req);
  const type = normalized(req.body?.type, 100);
  const workOrder = normalized(req.body?.workOrder, 100);
  const notes = normalized(req.body?.notes, 3000);
  const supplies = normalized(req.body?.supplies, 3000);
  const value = integer(req.body?.value, 'Horómetro del mantenimiento');
  const nextValue = integer(req.body?.nextValue, 'Próximo mantenimiento');
  const performedAt = normalized(req.body?.performedAt || new Date().toISOString().slice(0, 10), 40);
  if (!type || !Number.isFinite(Date.parse(performedAt)) || nextValue <= value) throw invalid('Tipo, fecha o próxima mantención no válidos.');
  const record = await transaction(async () => {
    const row = await get('SELECT * FROM fleet WHERE id = ? AND active = 1', [id]);
    if (!row) throw invalid('Equipo no encontrado.', 404);
    const eq = parseFleet(row);
    if (value > Number(eq.datosActuales.hrsKm)) throw invalid('El horómetro del mantenimiento no puede superar la lectura actual.');
    if (nextValue <= Number(eq.datosActuales.hrsKm)) throw invalid('La próxima mantención debe ser posterior al horómetro actual.');
    const result = await run(`INSERT INTO maintenance_records (equipment_id,performed_at,value,next_value,type,work_order,notes,supplies,recorded_by,created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`, [id, performedAt, value, nextValue, type, workOrder, notes, supplies, req.auth.id, now()]);
    await run('UPDATE fleet SET ultimoMantenimiento = ?, proxMantenimiento = ? WHERE id = ?', [
      JSON.stringify({ tipoMan: type, hrsKm: value, fecha: performedAt }),
      JSON.stringify({ tipoMan: type, hrsKm: nextValue }), id]);
    await audit(req.auth.id, 'mantenimiento_registrado', 'fleet', id, { maintenanceId: result.lastID, workOrder });
    return { id: result.lastID };
  });
  res.status(201).json(record);
}));
app.get('/api/users', adminOnly, handler(async (_req, res) => {
  res.json(await all('SELECT id,username,name,role,active FROM users ORDER BY username'));
}));
app.post('/api/users', adminOnly, csrf, handler(async (req, res) => {
  const username = normalized(req.body?.username, 80).toLowerCase();
  const name = normalized(req.body?.name, 100);
  const password = req.body?.password;
  const role = req.body?.role;
  if (!/^[a-z0-9_.-]{3,80}$/.test(username) || !name || !['admin','mecanico'].includes(role) ||
      typeof password !== 'string' || password.length < 12 || password.length > 128) throw invalid('Ingrese usuario válido, nombre, rol y contraseña (12 a 128 caracteres).');
  const salt = crypto.randomBytes(16).toString('hex');
  try {
    const result = await transaction(async () => {
      const added = await run('INSERT INTO users (username,name,role,salt,password_hash) VALUES (?,?,?,?,?)', [username, name, role, salt, passwordHash(password, salt)]);
      await audit(req.auth.id, 'usuario_creado', 'user', added.lastID, { username, role });
      return added;
    });
    res.status(201).json({ id: result.lastID, username, name, role });
  } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT') throw invalid('El nombre de usuario ya existe.', 409);
    throw e;
  }
}));

app.use('/api', (_req, _res, next) => next(invalid('Ruta API no encontrada.', 404)));
// In production the same server serves both frontend and API: no CORS is necessary.
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(ROOT, 'dist'), { index: false }));
  app.get('/{*path}', (_req, res) => res.sendFile(path.join(ROOT, 'dist', 'index.html')));
}
app.use((error, _req, res, _next) => {
  const status = error.status || (error.type === 'entity.too.large' ? 413 : 500);
  if (status >= 500) console.error('Error de servidor:', error);
  res.status(status).json({ error: status >= 500 ? 'Error interno del servidor.' : error.message });
});

await setup();
if (!(await get("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND active = 1")).n) {
  console.error('No hay un administrador. Ejecute npm run admin:create desde PowerShell o CMD.');
  db.close();
  process.exit(1);
}
const server = app.listen(PORT, '127.0.0.1', () => {
  console.log(`Vilas Motor disponible: http://localhost:${PORT} | SQLite: ${DB_PATH}`);
  if (process.env.NODE_ENV !== 'production') console.log('Frontend Vite: http://localhost:5173');
});
process.on('SIGINT', () => server.close(() => { db.close(); process.exit(0); }));
process.on('SIGTERM', () => server.close(() => { db.close(); process.exit(0); }));
