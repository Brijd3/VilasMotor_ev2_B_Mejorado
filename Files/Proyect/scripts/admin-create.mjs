import path from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline';
import { Writable } from 'node:stream';
import { createAdmin } from './admin-account.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dbPath = path.resolve(process.env.VILAS_DB_PATH || path.join(root, 'data', 'vilas-motor.sqlite'));
let privateAnswer = false;
const output = new Writable({
  write(chunk, encoding, callback) {
    if (!privateAnswer) process.stdout.write(chunk);
    callback();
  }
});
const interactive = Boolean(process.stdin.isTTY);
const rl = interactive ? readline.createInterface({ input: process.stdin, output, terminal: true }) : null;
// También permite entrada redirigida para pruebas sin revelar las contraseñas.
let queued = [];
if (!interactive) {
  let buffered = '';
  for await (const part of process.stdin) buffered += part.toString();
  queued = buffered.split(/\r?\n/);
}
const ask = (prompt, hidden = false) => {
  if (!interactive) {
    process.stdout.write(prompt + '\n');
    if (!queued.length) throw new Error('No se recibieron todos los datos solicitados.');
    return Promise.resolve(queued.shift());
  }
  return new Promise(resolve => {
    if (hidden) process.stdout.write(prompt);
    privateAnswer = hidden;
    rl.question(hidden ? '' : prompt, answer => {
      privateAnswer = false;
      if (hidden) process.stdout.write('\n');
      resolve(answer);
    });
  });
};
try {
  console.log('Vilas Motor | Crear administrador');
  const username = (await ask('Usuario [admin]: ')).trim() || 'admin';
  const name = (await ask('Nombre [Administrador Vilas]: ')).trim() || 'Administrador Vilas';
  const password = await ask('Nueva contraseña (mínimo 12 caracteres): ', true);
  const repeat = await ask('Confirmar contraseña: ', true);
  if (password !== repeat) throw new Error('Las contraseñas no coinciden.');
  const result = createAdmin(dbPath, { username, name, password });
  console.log(`Administrador creado: ${result.username}`);
  console.log('Puede iniciar Vilas Motor con npm run dev.');
} catch (error) {
  console.error(`No se pudo crear el administrador: ${error.message}`);
  process.exitCode = 1;
} finally {
  rl?.close();
}
