// Repositorio documental no relacional: textos libres independientes de SQLite.
// Cada informe es un .txt con un .json de metadatos, vinculados por equipmentId.
// No se expone ningún directorio por HTTP: acceso exclusivamente mediante API autenticada.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const UUID_JSON = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.json$/i;

export function createDocumentStore(rootPath) {
  const root = path.resolve(rootPath);
  const equipmentDir = equipmentId => {
    if (!Number.isSafeInteger(equipmentId) || equipmentId <= 0) throw new Error('ID de equipo inválido');
    return path.join(root, String(equipmentId));
  };

  function create({ equipmentId, title, content, actorId, actorName }) {
    const dir = equipmentDir(equipmentId);
    if (typeof title !== 'string' || !title.trim() || title.trim().length > 100 ||
        typeof content !== 'string' || !content.trim() || content.trim().length > 5000) {
      throw new Error('Informe documental inválido');
    }
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const id = crypto.randomUUID();
    const metadata = {
      id, equipmentId, title: title.trim(), actorId, actorName,
      createdAt: new Date().toISOString(), contentType: 'text/plain; charset=utf-8'
    };
    const txt = path.join(dir, `${id}.txt`);
    const json = path.join(dir, `${id}.json`);
    try {
      fs.writeFileSync(txt, content.trim() + '\n', { encoding: 'utf8', flag: 'wx', mode: 0o600 });
      fs.writeFileSync(json, JSON.stringify(metadata, null, 2) + '\n', { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    } catch (error) {
      for (const file of [txt, json]) { try { fs.unlinkSync(file); } catch { /* no existía */ } }
      throw error;
    }
    return { ...metadata, content: content.trim() };
  }

  function list(equipmentId) {
    const dir = equipmentDir(equipmentId);
    if (!fs.existsSync(dir)) return [];
    // Límite de respuesta para evitar cargar arbitrariamente miles de documentos en memoria.
    return fs.readdirSync(dir)
      .filter(filename => UUID_JSON.test(filename))
      .map(filename => {
        const metadata = JSON.parse(fs.readFileSync(path.join(dir, filename), 'utf8'));
        if (metadata.id + '.json' !== filename || metadata.equipmentId !== equipmentId) {
          throw new Error('Metadatos documentales inconsistentes');
        }
        return metadata;
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
      .slice(0, 100)
      .map(metadata => ({
        ...metadata,
        content: fs.readFileSync(path.join(dir, `${metadata.id}.txt`), 'utf8').trimEnd()
      }));
  }

  return { create, list };
}
