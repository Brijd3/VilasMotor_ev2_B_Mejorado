import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useFleet } from '../context/FleetContext';
import { useAuth } from '../context/AuthContext';
import { calculateStatus } from '../data/mockData';
import { getReadingUnit, getReadingLabel } from '../utils/readingUnits.js';
import { Wrench, FileText, ClipboardList } from 'lucide-react';
import Field from '../components/Field';

const EMPTY = { performedAt: new Date().toISOString().slice(0, 10), type: 'Preventivo', value: '', nextValue: '', workOrder: '', notes: '', supplies: '' };

const Maintenance = () => {
  const { fleet, getHistory, registerMaintenance } = useFleet();
  const { user, request } = useAuth();
  const [searchParams] = useSearchParams();
  const [equipmentId, setEquipmentId] = useState(() => searchParams.get('id') || '');
  const [form, setForm] = useState(EMPTY);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [documents, setDocuments] = useState([]);
  const [docTitle, setDocTitle] = useState('');
  const [docText, setDocText] = useState('');
  const [docMessage, setDocMessage] = useState('');
  const [docSaving, setDocSaving] = useState(false);
  const selected = fleet.find(eq => String(eq.id) === equipmentId);
  const unit = getReadingUnit(selected);
  const estado = selected ? calculateStatus(selected.datosActuales?.hrsKm, selected.proxMantenimiento?.hrsKm) : 'verde';

  useEffect(() => {
    if (!equipmentId) return;
    let active = true;
    getHistory(equipmentId)
      .then(data => { if (active) setHistory(data.maintenances); })
      .catch(e => { if (active) setMessage(e.message); });
    return () => { active = false; };
  }, [equipmentId, getHistory]);

  useEffect(() => {
    if (!equipmentId) return;
    let active = true;
    request(`/api/fleet/${equipmentId}/documents`)
      .then(data => { if (active) setDocuments(data); })
      .catch(e => { if (active) setDocMessage(`Error: ${e.message}`); });
    return () => { active = false; };
  }, [equipmentId, request]);

  const saveDocument = async event => {
    event.preventDefault();
    setDocSaving(true);
    setDocMessage('');
    try {
      const saved = await request(`/api/fleet/${equipmentId}/documents`, {
        method: 'POST', body: JSON.stringify({ title: docTitle, content: docText })
      });
      setDocuments(previous => [saved, ...previous]);
      setDocTitle('');
      setDocText('');
      setDocMessage('Informe de terreno guardado correctamente.');
    } catch (e) { setDocMessage(`Error: ${e.message}`); }
    finally { setDocSaving(false); }
  };

  const selectEquipment = id => {
    setEquipmentId(id);
    setMessage('');
    setDocMessage('');
    setDocuments([]);
    setHistory([]);
    setDocTitle('');
    setDocText('');
    const eq = fleet.find(x => String(x.id) === id);
    setForm({
      ...EMPTY,
      performedAt: new Date().toISOString().slice(0, 10),
      value: eq?.datosActuales?.hrsKm ?? '',
      nextValue: eq?.proxMantenimiento?.hrsKm ?? ''
    });
  };

  useEffect(() => {
    const urlId = searchParams.get('id');
    if (urlId && fleet.some(x => String(x.id) === String(urlId))) {
      selectEquipment(String(urlId));
    }
  }, [searchParams, fleet]);

  const save = async event => {
    event.preventDefault();
    setLoading(true);
    setMessage('');
    try {
      await registerMaintenance(equipmentId, { ...form, value: Number(form.value), nextValue: Number(form.nextValue) });
      const data = await getHistory(equipmentId);
      setHistory(data.maintenances);
      setMessage('Mantenimiento registrado correctamente. Se actualizó la próxima mantención.');
      setForm(previous => ({ ...previous, workOrder: '', notes: '', supplies: '' }));
    } catch (e) { setMessage(`Error: ${e.message}`); }
    finally { setLoading(false); }
  };

  return (
    <div className="animate-fade-in">
      <h1>Control de Mantenimientos</h1>
      <p className="subtitle">Historial real de intervenciones, órdenes de trabajo, insumos y bitácora documental de terreno</p>

      <div className="glass-panel" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
        <Field label="Equipo">
          {id => (
            <select id={id} className="form-input" value={equipmentId} onChange={e => selectEquipment(e.target.value)}>
              <option value="">Seleccione un equipo...</option>
              {fleet.map(eq => (
                <option key={eq.id} value={eq.id}>
                  {eq.nInterno} — {eq.tipo} ({eq.marca} {eq.modelo}) · [{eq.ppu}]
                </option>
              ))}
            </select>
          )}
        </Field>
        {selected && (
          <div className="info-callout" style={{ marginTop: '0.85rem', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div>
              <strong className="mono-code" style={{ fontSize: '1rem' }}>{selected.nInterno} · {selected.ppu}</strong>
              <span style={{ marginLeft: '0.65rem', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                {selected.cliente} — {selected.faena} ({selected.sucursal})
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
              <span>
                {getReadingLabel(selected)} actual: <strong className="mono-code">{selected.datosActuales.hrsKm} {unit}</strong> · Próxima: <strong className="mono-code">{selected.proxMantenimiento.hrsKm} {unit}</strong>
              </span>
              <span className={`status-badge ${estado}`}>
                {estado === 'verde' ? 'Operativo' : estado === 'amarillo' ? 'Preventivo' : 'Vencido'}
              </span>
            </div>
          </div>
        )}
      </div>

      {selected && (
        <div className="maintenance-layout">
          {user.role === 'admin' && (
            <div className="glass-panel" style={{ padding: '1.5rem' }}>
              <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Wrench size={18} color="var(--accent-primary)" /> Registrar mantenimiento
              </h2>
              <form onSubmit={save}>
                {[
                  ['performedAt', 'Fecha de intervención', 'date'],
                  ['type', 'Tipo de mantenimiento', 'text'],
                  ['value', `${getReadingLabel(selected)} al intervenir (${unit})`, 'number'],
                  ['nextValue', `Próxima mantención (${unit})`, 'number'],
                  ['workOrder', 'Orden de trabajo', 'text']
                ].map(([key, label, type]) => (
                  <Field label={label} key={key}>
                    {id => (
                      <input
                        id={id}
                        className="form-input"
                        type={type}
                        required={key !== 'workOrder'}
                        min={type === 'number' ? 0 : undefined}
                        step={type === 'number' ? 1 : undefined}
                        value={form[key]}
                        onChange={e => setForm({ ...form, [key]: e.target.value })}
                      />
                    )}
                  </Field>
                ))}
                <Field label="Insumos utilizados">
                  {id => (
                    <textarea
                      id={id}
                      rows={3}
                      className="form-input"
                      value={form.supplies}
                      onChange={e => setForm({ ...form, supplies: e.target.value })}
                      placeholder="Ej. Aceite 15W40, filtro de aire, filtro combustible"
                    />
                  )}
                </Field>
                <Field label="Observaciones">
                  {id => (
                    <textarea
                      id={id}
                      rows={3}
                      className="form-input"
                      value={form.notes}
                      onChange={e => setForm({ ...form, notes: e.target.value })}
                    />
                  )}
                </Field>
                <button type="submit" disabled={loading} className="btn btn-primary">
                  {loading ? 'Guardando...' : 'Registrar mantenimiento'}
                </button>
              </form>
            </div>
          )}

          <div className={`glass-panel ${history.length === 0 ? 'history-empty-panel' : ''}`} style={{ padding: '1.5rem' }}>
            <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <ClipboardList size={18} color="var(--accent-primary)" /> Historial de intervenciones ({history.length})
            </h2>
            {message && (
              <p role="status" style={{ margin: '1rem 0', color: message.startsWith('Error:') ? 'var(--status-red)' : 'var(--status-green)', fontWeight: 600 }}>
                {message}
              </p>
            )}
            {!history.length && (
              <div className="history-empty">
                <p>Sin intervenciones registradas para este equipo.</p>
                <small>Los mantenimientos guardados aparecerán aquí con su fecha y responsable.</small>
              </div>
            )}
            <div className="timeline-list">
              {history.map(item => (
                <article key={item.id} className="timeline-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <strong>{item.type}</strong>
                    <span className="code-pill">{item.performed_at}</span>
                  </div>
                  <div style={{ marginTop: '0.35rem', fontSize: '0.84rem' }}>
                    Orden: <strong>{item.work_order || 'Sin orden'}</strong> · Lectura: <strong className="mono-code">{item.value} {unit}</strong> · Próximo servicio: <strong className="mono-code">{item.next_value} {unit}</strong>
                  </div>
                  {!!item.supplies && <div style={{ marginTop: '0.25rem', fontSize: '0.83rem' }}><strong>Insumos:</strong> {item.supplies}</div>}
                  {!!item.notes && <div style={{ marginTop: '0.25rem', fontSize: '0.83rem' }}><strong>Observaciones:</strong> {item.notes}</div>}
                  <small style={{ display: 'block', marginTop: '0.4rem', color: 'var(--text-muted)' }}>
                    Registrado por {item.user_name || 'Usuario anterior'}
                  </small>
                </article>
              ))}
            </div>
          </div>
        </div>
      )}

      {selected && (
        <section className="glass-panel" style={{ padding: '1.5rem', marginTop: '1.25rem' }}>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <FileText size={18} color="var(--accent-primary)" /> Bitácora documental de terreno
          </h2>
          <p className="subtitle">Registra observaciones libres de cada equipo. Se guardan como documentos de texto, separados de la base SQLite.</p>
          <form onSubmit={saveDocument} style={{ maxWidth: '920px' }}>
            <div className="form-group">
              <label className="form-label" htmlFor="document-title">Título del informe</label>
              <input
                id="document-title"
                className="form-input"
                required
                maxLength={100}
                placeholder="Ej.: Inspección visual en faena"
                value={docTitle}
                onChange={e => setDocTitle(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="document-text">Observaciones de terreno (texto libre)</label>
              <textarea
                id="document-text"
                className="form-input"
                required
                maxLength={5000}
                rows={3}
                placeholder="Describe lo observado, condiciones y recomendaciones..."
                value={docText}
                onChange={e => setDocText(e.target.value)}
              />
            </div>
            <button className="btn btn-primary" disabled={docSaving} type="submit">
              {docSaving ? 'Guardando...' : 'Guardar informe de terreno'}
            </button>
            {docMessage && (
              <p role="status" style={{ marginTop: '0.75rem', color: docMessage.startsWith('Error:') ? 'var(--status-red)' : 'var(--status-green)', fontWeight: 600 }}>
                {docMessage}
              </p>
            )}
          </form>
          <div style={{ marginTop: '1.5rem' }}>
            <h3>Documentos registrados ({documents.length})</h3>
            {documents.length === 0 && <p className="subtitle">Todavía no hay informes de terreno para este equipo.</p>}
            <div className="timeline-list">
              {documents.map(doc => (
                <article key={doc.id} className="timeline-card">
                  <strong>{doc.title}</strong>
                  <small style={{ display: 'block', margin: '0.25rem 0', color: 'var(--text-muted)' }}>
                    {new Date(doc.createdAt).toLocaleString('es-CL')} · {doc.actorName || 'Usuario anterior'}
                  </small>
                  <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', marginTop: '0.35rem' }}>{doc.content}</p>
                </article>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
};

export default Maintenance;
