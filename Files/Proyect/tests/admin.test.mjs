import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { createAdmin } from '../scripts/admin-account.mjs';

test('Primer inicio: el administrador se crea con contraseña cifrada en SQLite', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'vilas-admin-'));
  try {
    const location = path.join(dir, 'data', 'vilas.sqlite');
    const password = crypto.randomBytes(24).toString('base64url');
    const created = createAdmin(location, { username: 'admin', name: 'Administrador', password });
    assert.equal(created.username, 'admin');
    const db = new DatabaseSync(location);
    try {
      const user = db.prepare('SELECT * FROM users WHERE username = ?').get('admin');
      assert.ok(user);
      assert.equal(user.role, 'admin');
      assert.notEqual(user.password_hash, password);
      assert.equal(user.password_hash, crypto.pbkdf2Sync(password, user.salt, 210_000, 32, 'sha256').toString('hex'));
    } finally { db.close(); }
    assert.throws(() => createAdmin(location, { password }), /Ya existe un administrador/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('No se permite crear un administrador con contraseña corta', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'vilas-admin-'));
  try {
    assert.throws(() => createAdmin(path.join(dir, 'test.sqlite'), { password: 'corta' }), /entre 12 y 128/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
