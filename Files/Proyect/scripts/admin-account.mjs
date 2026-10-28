import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ITERATIONS = 210_000;
export function createAdmin(dbPath, { username = 'admin', name = 'Administrador Vilas', password }) {
  const cleanUsername = String(username).trim().toLowerCase();
  const cleanName = String(name).trim();
  if (!/^[a-z0-9_.-]{3,80}$/.test(cleanUsername)) throw new Error('Usuario inválido (3 a 80 caracteres).');
  if (!cleanName || cleanName.length > 100) throw new Error('Nombre inválido.');
  if (typeof password !== 'string' || password.length < 12 || password.length > 128) {
    throw new Error('La contraseña debe tener entre 12 y 128 caracteres.');
  }
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin','mecanico')),
      salt TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1
    )`);
    const admin = db.prepare("SELECT COUNT(*) AS total FROM users WHERE role = 'admin'").get();
    if (admin.total) throw new Error('Ya existe un administrador. Use Configuración para gestionar cuentas.');
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, ITERATIONS, 32, 'sha256').toString('hex');
    const result = db.prepare('INSERT INTO users (username,name,role,salt,password_hash) VALUES (?,?,?,?,?)')
      .run(cleanUsername, cleanName, 'admin', salt, hash);
    return { id: Number(result.lastInsertRowid), username: cleanUsername };
  } finally {
    db.close();
  }
}
