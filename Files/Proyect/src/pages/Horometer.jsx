import React, { useState, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useFleet } from '../context/FleetContext';
import { calculateStatus, predictMaintenanceDate } from '../data/mockData';
import { CheckCircle, AlertCircle, Calendar, TrendingUp } from 'lucide-react';
import { getReadingUnit, getReadingLabel } from '../utils/readingUnits.js';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import Field from '../components/Field';

const Horometer = () => {
  const { id } = useParams();
  const { fleet, registerReading, getHistory } = useFleet();
  const [selectedId, setSelectedId] = useState(() => {
    return id || sessionStorage.getItem('lastSelectedHorometer') || '';
  });
  const [prevId, setPrevId] = useState(id);
  if (id !== prevId) {
    setPrevId(id);
    if (id) {
      setSelectedId(id);
      sessionStorage.setItem('lastSelectedHorometer', id);
    }
  }
  const [newHorometer, setNewHorometer] = useState('');
  const [lastUpdate, setLastUpdate] = useState(null);
  const [history, setHistory] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSelectChange = (e) => {
    const val = e.target.value;
    setSelectedId(val);
    sessionStorage.setItem('lastSelectedHorometer', val);
    setLastUpdate(null);
    setNewHorometer('');
    setHistory([]);
  };

  const equipoSeleccionado = fleet.find(e => String(e.id) === String(selectedId));
  const unidad = getReadingUnit(equipoSeleccionado);
  const etiqueta = getReadingLabel(equipoSeleccionado);

  useEffect(() => {
    if (!selectedId) return;
    let active = true;
    getHistory(selectedId)
      .then(data => { if (active) setHistory(data.readings); })
      .catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [selectedId, getHistory]);

  const chartData = useMemo(() => {
    return [...history].reverse().map(r => ({
      fecha: new Date(r.recorded_at).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit' }),
      valor: Number(r.value)
    }));
  }, [history]);

  const applyQuickIncrement = (delta) => {
    if (!equipoSeleccionado) return;
    const base = Number(newHorometer) > Number(equipoSeleccionado.datosActuales.hrsKm)
      ? Number(newHorometer)
      : Number(equipoSeleccionado.datosActuales.hrsKm);
    setNewHorometer(String(base + delta));
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    if (!equipoSeleccionado || newHorometer === '') return;
    setError('');
    const horometroNuevo = Number(newHorometer);
    if (!Number.isSafeInteger(horometroNuevo) || horometroNuevo <= Number(equipoSeleccionado.datosActuales.hrsKm)) {
      setError(`La nueva lectura debe ser un número entero mayor al valor anterior de ${etiqueta.toLowerCase()}.`);
      return;
    }
    setBusy(true);
    try {
      const record = await registerReading(equipoSeleccionado.id, horometroNuevo);
      const nuevoEstado = calculateStatus(horometroNuevo, equipoSeleccionado.proxMantenimiento.hrsKm);
      const fechaEstimada = unidad === 'h' ? predictMaintenanceDate(horometroNuevo, equipoSeleccionado.proxMantenimiento.hrsKm, record.recorded_at) : null;
      setLastUpdate({
        ...equipoSeleccionado,
        horometro: horometroNuevo,
        estadoNuevo: nuevoEstado,
        fechaRegistro: record.recorded_at,
        fechaEstimada
      });
      setHistory((await getHistory(equipoSeleccionado.id)).readings);
      setNewHorometer('');
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="animate-fade-in">
      <h1>Registro de horómetros y kilometrajes</h1>
      <p className="subtitle">Ingresa nuevas lecturas validadas en terreno y consulta la curva histórica por unidad</p>

      <div className="horometer-layout">
        <div className="glass-panel section-panel">
          <h2>Nueva lectura del equipo</h2>
          <form onSubmit={handleUpdate}>
            <Field label="Seleccionar Equipo (N° Interno / PPU)">
              {fieldId => (
                <select
                  id={fieldId}
                  className="form-input"
                  value={selectedId}
                  onChange={handleSelectChange}
                  required
                >
                  <option value="">Seleccione equipo...</option>
                  {fleet.map(equipo => (
                    <option key={equipo.id} value={equipo.id}>
                      {equipo.nInterno} - {equipo.ppu} ({equipo.tipo})
                    </option>
                  ))}
                </select>
              )}
            </Field>

            {equipoSeleccionado && (
              <div className="info-callout" style={{ marginBottom: '1.1rem' }}>
                <div style={{ fontSize: '0.84rem', color: 'var(--text-muted)' }}>
                  Último Registro:{' '}
                  <strong style={{ color: 'var(--text-main)' }}>
                    {equipoSeleccionado.datosActuales?.fechaRegistro && !Number.isNaN(Date.parse(equipoSeleccionado.datosActuales.fechaRegistro))
                      ? format(new Date(equipoSeleccionado.datosActuales.fechaRegistro), 'dd MMM yyyy, HH:mm', { locale: es })
                      : 'Sin fecha'}
                  </strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <span style={{ fontSize: '0.84rem', color: 'var(--text-muted)' }}>
                    {etiqueta} actual: <strong className="mono-code" style={{ color: 'var(--text-main)', fontSize: '1.2rem' }}>{equipoSeleccionado.datosActuales.hrsKm}</strong> {unidad}
                  </span>
                  <span style={{ fontSize: '0.84rem', color: 'var(--text-muted)' }}>
                    Límite Mantención: <strong className="mono-code" style={{ color: 'var(--text-main)' }}>{equipoSeleccionado.proxMantenimiento.hrsKm}</strong> {unidad}
                  </span>
                </div>
              </div>
            )}

            <Field label={`Nueva lectura (${unidad})`}>
              {fieldId => (
                <input
                  id={fieldId}
                  type="number"
                  inputMode="numeric"
                  className="form-input mono-code"
                  placeholder="Ej. 14600"
                  value={newHorometer}
                  onChange={(e) => setNewHorometer(e.target.value)}
                  min={equipoSeleccionado ? Number(equipoSeleccionado.datosActuales.hrsKm) + 1 : 0}
                  step="1"
                  required
                />
              )}
            </Field>

            {equipoSeleccionado && (
              <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)', alignSelf: 'center', marginRight: '0.25rem' }}>
                  Suma rápida:
                </span>
                {(unidad === 'km' ? [50, 150, 300] : [8, 12, 24]).map(inc => (
                  <button
                    key={inc}
                    type="button"
                    className="status-chip"
                    style={{ padding: '0.25rem 0.6rem', fontSize: '0.74rem' }}
                    onClick={() => applyQuickIncrement(inc)}
                  >
                    +{inc} {unidad}
                  </button>
                ))}
              </div>
            )}

            {error && <p role="alert" className="form-error">{error}</p>}
            <button disabled={busy} type="submit" className="btn btn-primary" style={{ width: '100%' }}>
              {busy ? 'Guardando...' : 'Guardar lectura'}
            </button>
          </form>
        </div>

        {lastUpdate ? (
          <div className="glass-panel animate-fade-in" style={{ padding: '1.75rem', border: '2px solid var(--accent-primary)', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '4px', background: 'var(--accent-primary)' }} />
            <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <CheckCircle color="var(--status-green)" /> Registro Exitoso
            </h2>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
              Fecha y Hora de Emisión: <strong>{format(new Date(lastUpdate.fechaRegistro), 'dd/MM/yyyy HH:mm:ss')}</strong>
            </div>

            <div className="info-callout" style={{ flexDirection: 'row', alignItems: 'center', gap: '1rem' }}>
              {lastUpdate.estadoNuevo === 'rojo' ? (
                <AlertCircle size={32} color="var(--status-red)" />
              ) : lastUpdate.estadoNuevo === 'amarillo' ? (
                <AlertCircle size={32} color="var(--status-yellow)" />
              ) : (
                <CheckCircle size={32} color="var(--status-green)" />
              )}
              <div>
                <div style={{ fontSize: '0.98rem', fontWeight: 'bold' }}>
                  Estado de Flota:
                  <span className={`status-badge ${lastUpdate.estadoNuevo}`} style={{ marginLeft: '0.75rem' }}>
                    {lastUpdate.estadoNuevo === 'verde' ? 'Operativo' : lastUpdate.estadoNuevo === 'amarillo' ? 'Preventivo' : 'Crítico'}
                  </span>
                </div>
                <div style={{ color: 'var(--text-muted)', marginTop: '0.35rem' }}>
                  {getReadingUnit(lastUpdate) === 'km' ? 'Kilómetros' : 'Horas'} restantes:{' '}
                  <strong>{lastUpdate.proxMantenimiento.hrsKm - lastUpdate.horometro} {getReadingUnit(lastUpdate)}</strong>
                </div>
              </div>
            </div>

            {lastUpdate.estadoNuevo !== 'rojo' && lastUpdate.fechaEstimada && (
              <div style={{ marginTop: '1.25rem', padding: '1.2rem', background: 'rgba(249, 160, 27, 0.1)', borderRadius: '8px', border: '1px dashed var(--accent-primary)' }}>
                <h3 style={{ fontSize: '0.96rem', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
                  <Calendar size={18} color="var(--accent-primary)" />
                  Fecha estimada de mantenimiento
                </h3>
                <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                  Estimación orientativa calculada con un supuesto de 8 hrs diarias (proyección aritmética):
                </p>
                <div className="mono-code" style={{ fontSize: '1.45rem', fontWeight: '800', color: 'var(--accent-primary)', marginTop: '0.35rem' }}>
                  {lastUpdate.fechaEstimada}
                </div>
              </div>
            )}
          </div>
        ) : equipoSeleccionado && chartData.length > 1 ? (
          <div className="glass-panel section-panel" style={{ display: 'flex', flexDirection: 'column' }}>
            <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <TrendingUp size={19} color="var(--accent-primary)" /> Curva de Evolución · {equipoSeleccionado.nInterno}
            </h2>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
              Progresión histórica de lecturas registradas en SQLite ({unidad})
            </p>
            <div style={{ flex: 1, minHeight: '210px', width: '100%' }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 8, right: 12, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.2)" />
                  <XAxis dataKey="fecha" stroke="#64748b" fontSize={12} />
                  <YAxis stroke="#64748b" fontSize={12} domain={['auto', 'auto']} />
                  <Tooltip />
                  <Area type="monotone" dataKey="valor" stroke="var(--accent-primary)" fill="rgba(229, 9, 20, 0.16)" strokeWidth={2.5} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        ) : null}
      </div>

      {equipoSeleccionado && (
        <div className="glass-panel" style={{ padding: '1.5rem', marginTop: '1.25rem' }}>
          <h2>Historial de lecturas · {equipoSeleccionado.nInterno}</h2>
          <div className="table-container">
            <table className="fleet-table">
              <thead>
                <tr>
                  <th>Fecha / hora</th>
                  <th>Lectura ({unidad})</th>
                  <th>Registrado por</th>
                  <th>Origen</th>
                </tr>
              </thead>
              <tbody>
                {history.map(record => (
                  <tr key={record.id}>
                    <td>{new Date(record.recorded_at).toLocaleString('es-CL')}</td>
                    <td className="mono-code">{record.value}</td>
                    <td>{record.user_name || 'Carga inicial'}</td>
                    <td><span className="code-pill">{record.source}</span></td>
                  </tr>
                ))}
                {!history.length && (
                  <tr>
                    <td colSpan="4">Sin registros todavía.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default Horometer;
