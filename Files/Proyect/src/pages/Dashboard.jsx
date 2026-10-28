import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFleet } from '../context/FleetContext';
import { calculateStatus } from '../data/mockData';
import { getReadingUnit } from '../utils/readingUnits.js';
import {
  Activity, AlertTriangle, CheckCircle, Truck, Clock,
  ArrowUpRight, ShieldAlert, Sparkles
} from 'lucide-react';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip,
  Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid
} from 'recharts';

const Dashboard = () => {
  const { fleet } = useFleet();
  const navigate = useNavigate();
  const [urgencyFilter, setUrgencyFilter] = useState('todos');

  const getEstado = (equipo) => calculateStatus(equipo.datosActuales?.hrsKm, equipo.proxMantenimiento?.hrsKm);

  const { operativos, preventivos, vencidos, atencion, disponibilidadPct, porSucursal } = useMemo(() => {
    const estado = (equipo) => calculateStatus(equipo.datosActuales?.hrsKm, equipo.proxMantenimiento?.hrsKm);
    const op = fleet.filter(f => estado(f) === 'verde').length;
    const prev = fleet.filter(f => estado(f) === 'amarillo').length;
    const venc = fleet.filter(f => estado(f) === 'rojo').length;
    const total = fleet.length;
    const disp = total > 0 ? Math.round(((op + prev) / total) * 100) : 100;

    const branchMap = new Map();
    fleet.forEach(eq => {
      const b = eq.sucursal || 'Sin Sucursal';
      if (!branchMap.has(b)) branchMap.set(b, { sucursal: b, Operativos: 0, Preventivos: 0, Críticos: 0 });
      const item = branchMap.get(b);
      const st = estado(eq);
      if (st === 'verde') item.Operativos += 1;
      else if (st === 'amarillo') item.Preventivos += 1;
      else item.Críticos += 1;
    });

    return {
      operativos: op,
      preventivos: prev,
      vencidos: venc,
      disponibilidadPct: disp,
      porSucursal: Array.from(branchMap.values()),
      atencion: fleet
        .filter(f => estado(f) !== 'verde')
        .sort((a, b) => (a.proxMantenimiento.hrsKm - a.datosActuales.hrsKm) - (b.proxMantenimiento.hrsKm - b.datosActuales.hrsKm))
    };
  }, [fleet]);

  const atencionFiltrada = useMemo(() => {
    if (urgencyFilter === 'todos') return atencion;
    return atencion.filter(eq => getEstado(eq) === urgencyFilter);
  }, [atencion, urgencyFilter]);

  const data = [
    { name: 'Operativos', value: operativos, color: 'var(--status-green)' },
    { name: 'Preventivos', value: preventivos, color: 'var(--status-yellow)' },
    { name: 'Críticos', value: vencidos, color: 'var(--status-red)' }
  ];

  const getCyclePercent = (equipo) => {
    const actual = Number(equipo.datosActuales?.hrsKm || 0);
    const prox = Number(equipo.proxMantenimiento?.hrsKm || 0);
    const ult = Number(equipo.ultimoMantenimiento?.hrsKm || 0);
    if (prox <= ult) return actual >= prox ? 100 : 50;
    const pct = ((actual - ult) / (prox - ult)) * 100;
    return Math.min(100, Math.max(8, Math.round(pct)));
  };

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1>Resumen ejecutivo de flota</h1>
          <p className="subtitle">Monitoreo en tiempo real del estado operativo, disponibilidad y alertas de mantenimiento</p>
        </div>
        <div className="page-actions">
          <button type="button" className="btn btn-secondary" onClick={() => navigate('/horometers')}>
            <Clock size={18} /> Registrar Lectura
          </button>
          <button type="button" className="btn btn-primary" onClick={() => navigate('/fleet')}>
            <Truck size={18} /> Gestionar Flota
          </button>
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="glass-panel stat-card" style={{ borderLeft: '4px solid var(--accent-primary)' }}>
          <div className="stat-header">
            <span>Equipos registrados</span>
            <Activity color="var(--accent-primary)" size={22} />
          </div>
          <div className="stat-value">{fleet.length}</div>
          <div className="kpi-sub-bar">
            <div className="kpi-sub-bar-fill" style={{ width: '100%', background: 'var(--accent-grad)' }} />
          </div>
          <div className="stat-note">Disponibilidad operativa: <strong>{disponibilidadPct}%</strong></div>
        </div>

        <div className="glass-panel stat-card" style={{ borderLeft: '4px solid var(--status-green)' }}>
          <div className="stat-header">
            <span>Equipos Operativos</span>
            <CheckCircle color="var(--status-green)" size={22} />
          </div>
          <div className="stat-value" style={{ color: 'var(--status-green)' }}>
            {operativos}
          </div>
          <div className="kpi-sub-bar">
            <div
              className="kpi-sub-bar-fill"
              style={{
                width: `${fleet.length ? Math.round((operativos / fleet.length) * 100) : 0}%`,
                background: 'var(--status-green)'
              }}
            />
          </div>
          <div className="stat-note">
            En condiciones óptimas ({fleet.length ? Math.round((operativos / fleet.length) * 100) : 0}% del total)
          </div>
        </div>

        <div className="glass-panel stat-card" style={{ borderLeft: '4px solid var(--status-yellow)' }}>
          <div className="stat-header">
            <span>Próximos a Mantención</span>
            <AlertTriangle color="var(--status-yellow)" size={22} />
          </div>
          <div className="stat-value" style={{ color: 'var(--status-yellow)' }}>
            {preventivos}
          </div>
          <div className="kpi-sub-bar">
            <div
              className="kpi-sub-bar-fill"
              style={{
                width: `${fleet.length ? Math.round((preventivos / fleet.length) * 100) : 0}%`,
                background: 'var(--status-yellow)'
              }}
            />
          </div>
          <div className="stat-note">
            Dentro del umbral preventivo (≤ 100 hrs/km)
          </div>
        </div>

        <div className="glass-panel stat-card" style={{ borderLeft: '4px solid var(--status-red)' }}>
          <div className="stat-header">
            <span>Mantención Vencida</span>
            <ShieldAlert color="var(--status-red)" size={22} />
          </div>
          <div className="stat-value" style={{ color: 'var(--status-red)' }}>
            {vencidos}
          </div>
          <div className="kpi-sub-bar">
            <div
              className="kpi-sub-bar-fill"
              style={{
                width: `${fleet.length ? Math.round((vencidos / fleet.length) * 100) : 0}%`,
                background: 'var(--status-red)'
              }}
            />
          </div>
          <div className="stat-note" style={{ fontWeight: 600 }}>
            Requieren intervención inmediata en taller
          </div>
        </div>
      </div>

      <div className="dashboard-details">
        <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <h2 style={{ margin: 0 }}>Distribución de Estado</h2>
            <span className="code-pill"><Sparkles size={13} /> Tiempo Real</span>
          </div>
          <div
            role="img"
            aria-label={`Distribución de estado: ${operativos} operativos, ${preventivos} preventivos, ${vencidos} críticos`}
            style={{ height: '300px', width: '100%' }}
          >
            {fleet.length === 0 ? (
              <p className="empty-state">Registra un equipo para ver la distribución de estados.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data}
                    cx="50%"
                    cy="50%"
                    innerRadius={76}
                    outerRadius={108}
                    paddingAngle={5}
                    dataKey="value"
                    stroke="none"
                  >
                    {data.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <RechartsTooltip
                    contentStyle={{
                      backgroundColor: '#ffffff',
                      border: '1px solid #e2e8f0',
                      borderRadius: '10px',
                      boxShadow: '0 10px 30px -12px rgba(15,23,42,0.3)'
                    }}
                    itemStyle={{ color: '#1e293b', fontWeight: 600 }}
                  />
                  <Legend verticalAlign="bottom" height={36} wrapperStyle={{ color: 'var(--text-muted)' }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <h2 style={{ margin: 0 }}>Equipos que requieren atención ({atencionFiltrada.length})</h2>
            <div className="status-chips" role="group" aria-label="Filtrar alertas por urgencia">
              {[
                ['todos', 'Todos', atencion.length],
                ['rojo', 'Vencidos', vencidos],
                ['amarillo', 'Preventivos', preventivos]
              ].map(([key, label, count]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setUrgencyFilter(key)}
                  className={`status-chip ${urgencyFilter === key ? 'active' : ''}`}
                  style={{ padding: '0.3rem 0.65rem', fontSize: '0.72rem' }}
                >
                  <span>{label}</span>
                  <span className="status-chip-count">{count}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="table-container" style={{ flex: 1, overflowY: 'auto', maxHeight: '310px' }}>
            <table className="fleet-table">
              <thead>
                <tr>
                  <th>Patente / Equipo</th>
                  <th>Faena / Sucursal</th>
                  <th>Desgaste de Ciclo</th>
                  <th>Restantes</th>
                  <th style={{ textAlign: 'right' }}>Acción</th>
                </tr>
              </thead>
              <tbody>
                {atencionFiltrada.map(equipo => {
                  const est = getEstado(equipo);
                  const unit = getReadingUnit(equipo);
                  const restante = equipo.proxMantenimiento.hrsKm - equipo.datosActuales.hrsKm;
                  const pct = getCyclePercent(equipo);
                  return (
                    <tr key={equipo.id}>
                      <td>
                        <div className="mono-code">{equipo.nInterno} · {equipo.ppu}</div>
                        <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>{equipo.tipo} — {equipo.marca} {equipo.modelo}</div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{equipo.faena}</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{equipo.sucursal}</div>
                      </td>
                      <td>
                        <div className="usage-bar-wrap" style={{ minWidth: '115px' }}>
                          <div className="usage-bar-labels">
                            <span>{equipo.datosActuales.hrsKm} {unit}</span>
                            <span>{equipo.proxMantenimiento.hrsKm} {unit}</span>
                          </div>
                          <div className="usage-bar-track">
                            <div className={`usage-bar-fill ${est}`} style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className={`status-badge ${est}`}>
                          {restante <= 0 ? `Vencido (${restante} ${unit})` : `${restante} ${unit}`}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          type="button"
                          className="btn btn-secondary btn-icon"
                          onClick={() => navigate(`/horometers/${equipo.id}`)}
                          title={`Ir a horómetro de ${equipo.nInterno}`}
                          aria-label={`Ir a horómetro de ${equipo.nInterno}`}
                        >
                          <ArrowUpRight size={15} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {atencionFiltrada.length === 0 && (
                  <tr>
                    <td colSpan="5" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                      No hay equipos con mantenimiento próximo o vencido en este filtro.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {porSucursal.length > 0 && (
        <div className="glass-panel" style={{ padding: '1.35rem 1.5rem', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div>
              <h2 style={{ margin: 0 }}>Panorama Operativo por Sucursal</h2>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                Comparativa de unidades operativas, en aviso preventivo y críticas según localidad asignada
              </p>
            </div>
            <button type="button" className="btn btn-secondary" onClick={() => navigate('/telemetry')}>
              Ver en Mapa Regional
            </button>
          </div>
          <div style={{ height: '220px', width: '100%' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={porSucursal} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.2)" />
                <XAxis dataKey="sucursal" stroke="#64748b" fontSize={12} />
                <YAxis allowDecimals={false} stroke="#64748b" fontSize={12} />
                <RechartsTooltip
                  contentStyle={{
                    backgroundColor: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '10px',
                    color: '#0f172a'
                  }}
                />
                <Legend />
                <Bar dataKey="Operativos" stackId="a" fill="var(--status-green)" radius={[0, 0, 0, 0]} />
                <Bar dataKey="Preventivos" stackId="a" fill="var(--status-yellow)" radius={[0, 0, 0, 0]} />
                <Bar dataKey="Críticos" stackId="a" fill="var(--status-red)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
