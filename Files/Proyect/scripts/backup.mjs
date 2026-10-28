// Crea una copia consistente usando VACUUM INTO (incluye datos en modo WAL).
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.resolve(process.env.VILAS_DB_PATH || path.join(root, 'data', 'vilas-motor.sqlite'));
if (!fs.existsSync(source)) {
  console.error('No existe la base de datos en', source);
  process.exit(1);
}
const backupDir = path.resolve(process.env.VILAS_BACKUP_DIR || path.join(root, 'backups'));
fs.mkdirSync(backupDir, { recursive: true });
const date = new Date().toISOString().replace(/[:.]/g, '-');
const destination = path.join(backupDir, `VilasMotor-${date}.sqlite`);
const db = new DatabaseSync(source, { readOnly: true });
try {
  db.prepare('VACUUM INTO ?').run(destination);
  console.log('Respaldo SQLite generado:', destination);
  const documentDir = path.join(path.dirname(source), 'documentos-terreno');
  if (fs.existsSync(documentDir)) {
    const documentBackup = path.join(backupDir, `VilasMotor-${date}-documentos-terreno`);
    fs.cpSync(documentDir, documentBackup, { recursive: true, errorOnExist: true, force: false });
    console.log('Respaldo documental generado:', documentBackup);
  }
} finally { db.close(); }
