import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createDocumentStore } from '../shared/documentStore.mjs';

test('Repositorio documental separado: guarda y lee texto libre con metadatos', t => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'vilas-documentos-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const store = createDocumentStore(root);
  const created = store.create({ equipmentId: 12, title: 'Informe terreno',
    content: 'Se observó fuga.\nSe recomienda revisión.', actorId: 7, actorName: 'Mecánico' });
  const metadataFile = path.join(root, '12', created.id + '.json');
  const txtFile = path.join(root, '12', created.id + '.txt');
  assert.ok(existsSync(metadataFile));
  assert.ok(existsSync(txtFile));
  assert.match(readFileSync(txtFile, 'utf8'), /Se observó fuga/);
  assert.equal(JSON.parse(readFileSync(metadataFile, 'utf8')).actorId, 7);
  const reopened = createDocumentStore(root);
  assert.equal(reopened.list(12)[0].content, 'Se observó fuga.\nSe recomienda revisión.');
  assert.equal(reopened.list(13).length, 0);
});

test('Repositorio documental rechaza ID y entradas inválidas', t => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'vilas-documentos-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const store = createDocumentStore(root);
  assert.throws(() => store.list('../etc'));
  assert.throws(() => store.create({ equipmentId: 1, title: '', content: 'x' }));
  assert.throws(() => store.create({ equipmentId: 1, title: 'x', content: 'X'.repeat(5001) }));
});
