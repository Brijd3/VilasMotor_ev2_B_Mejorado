import React, { useMemo, useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useFleet } from '../context/FleetContext';
import { useAuth } from '../context/AuthContext';
import { calculateStatus } from '../data/mockData';
import { getReadingUnit } from '../utils/readingUnits.js';
import {
  Search, Filter, Plus, Edit2, Trash2, QrCode, Download,
  LayoutGrid, List, Clock, MapPin, Building2, BookOpen
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import Modal from '../components/Modal';
import Field from '../components/Field';

const EQUIPMENT_TYPES = [
  ['CAMIONETA', 'CAMIONETA'], ['GRUA HORQUILLA', 'GRÚA HORQUILLA'], ['RETROEXCAVADORA', 'RETROEXCAVADORA'],
  ['CAMION PLUMA', 'CAMIÓN PLUMA'], ['EXCAVADORA', 'EXCAVADORA'], ['CARGADOR FRONTAL', 'CARGADOR FRONTAL'],
  ['MINICARGADOR', 'MINICARGADOR'], ['MOTONIVELADORA', 'MOTONIVELADORA'], ['RODILLO COMPACTADOR', 'RODILLO COMPACTADOR'],
  ['GRUPO ELECTROGENO', 'GRUPO ELECTRÓGENO'], ['TORRE DE ILUMINACION', 'TORRE DE ILUMINACIÓN']
];
const BRANCHES = ['Arica', 'Iquique', 'Antofagasta', 'Calama', 'Copiapó'];
const STATUS_LABEL = { verde: 'Operativo', amarillo: 'Preventivo', rojo: 'Vencido' };
const EMPTY_FORM = {
  nInterno: '', tipo: '', ppu: '', cliente: '', sucursal: '', faena: '',
  marca: '', modelo: '',
  ultimoHrsKm: 0, ultimoTipo: 'Sin registrar', ultimoFecha: '',
  actualHrsKm: '', proxHrsKm: ''
};

const normalizeText = (value) => String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const Fleet = () => {
  const { fleet, deleteEquipo, addEquipo, updateEquipo, getHistory } = useFleet();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [searchTerm, setSearchTerm] = useState(() => searchParams.get('search') || '');
  const [filterSucursal, setFilterSucursal] = useState('Todas');
  const [filterStatus, setFilterStatus] = useState(() => {
    const s = searchParams.get('status');
    return ['verde', 'amarillo', 'rojo', 'todos'].includes(s) ? s : 'todos';
  });
  const [viewMode, setViewMode] = useState('table');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isQRModalOpen, setIsQRModalOpen] = useState(false);
  const [isLogbookOpen, setIsLogbookOpen] = useState(false);
  const [currentEquipo, setCurrentEquipo] = useState(null);
  const [logbook, setLogbook] = useState({ readings: [], maintenances: [] });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [formData, setFormData] = useState(EMPTY_FORM);

  useEffect(() => {
    const s = searchParams.get('status');
    if (s && ['verde', 'amarillo', 'rojo', 'todos'].includes(s)) {
      setFilterStatus(s);
    }
    const q = searchParams.get('search');
    if (q !== null) {
      setSearchTerm(q);
    }
    if (searchParams.get('action') === 'new' && user?.role === 'admin') {
      setFormData(EMPTY_FORM);
      setCurrentEquipo(null);
      setIsModalOpen(true);
    }
  }, [searchParams, user]);

  const setField = (key) => (event) => setFormData(prev => ({ ...prev, [key]: event.target.value }));
  const getEstado = (equipo) => calculateStatus(equipo.datosActuales?.hrsKm || 0, equipo.proxMantenimiento?.hrsKm || 0);

  const statusCounts = useMemo(() => {
    const counts = { todos: fleet.length, verde: 0, amarillo: 0, rojo: 0 };
    fleet.forEach(eq => {
      const st = getEstado(eq);
      if (counts[st] !== undefined) counts[st] += 1;
    });
    return counts;
  }, [fleet]);

  const filteredFleet = useMemo(() => {
    const term = normalizeText(searchTerm.trim());
    return fleet.filter(equipo => {
      const matchesSearch = !term ||
        normalizeText(equipo.ppu).includes(term) ||
        normalizeText(equipo.nInterno).includes(term) ||
        normalizeText(equipo.marca).includes(term) ||
        normalizeText(equipo.modelo).includes(term) ||
        normalizeText(equipo.cliente).includes(term) ||
        normalizeText(equipo.faena).includes(term);
      const matchesSucursal = filterSucursal === 'Todas' || equipo.sucursal === filterSucursal;
      const matchesStatus = filterStatus === 'todos' || getEstado(equipo) === filterStatus;
      return matchesSearch && matchesSucursal && matchesStatus;
    });
  }, [fleet, searchTerm, filterSucursal, filterStatus]);

  const branchOptions = useMemo(() => [...new Set(fleet.map(eq => eq.sucursal).filter(Boolean))].sort(), [fleet]);
  const formBranches = formData.sucursal && !BRANCHES.includes(formData.sucursal) ? [...BRANCHES, formData.sucursal] : BRANCHES;

  const getCycleInfo = (equipo) => {
    const actual = Number(equipo.datosActuales?.hrsKm || 0);
    const prox = Number(equipo.proxMantenimiento?.hrsKm || 0);
    const ult = Number(equipo.ultimoMantenimiento?.hrsKm || 0);
    const restante = prox - actual;
    let pct = 50;
    if (prox > ult) {
      pct = Math.min(100, Math.max(6, Math.round(((actual - ult) / (prox - ult)) * 100)));
    } else if (actual >= prox) {
      pct = 100;
    }
    return { actual, prox, restante, pct };
  };

  const handleDelete = async (id) => {
    if (!window.confirm('¿Desactivar este equipo? Su historial quedará conservado.')) return;
    setError('');
    try { await deleteEquipo(id); }
    catch (err) { setError(err.message); }
  };

  const exportToExcel = async () => {
    if (filteredFleet.length === 0) {
      setError('No hay equipos para exportar con los filtros actuales.');
      return;
    }
    setError('');
    let XLSX;
    try {
      const module = await import('xlsx-js-style');
      XLSX = module.default ?? module;
    } catch {
      setError('No se pudo cargar el módulo de exportación. Intente nuevamente.');
      return;
    }
    const exportData = filteredFleet.map(eq => ({
      'N° Interno': eq.nInterno,
      'PPU': eq.ppu,
      'Tipo': eq.tipo,
      'Cliente': eq.cliente,
      'Sucursal': eq.sucursal,
      'Faena': eq.faena,
      'Marca': eq.marca,
      'Modelo': eq.modelo,
      'Horómetro Actual': eq.datosActuales.hrsKm,
      'Próxima Mantención': eq.proxMantenimiento.hrsKm,
      'Unidad': getReadingUnit(eq),
      'Restante': eq.proxMantenimiento.hrsKm - eq.datosActuales.hrsKm,
      'Fecha Dato': eq.datosActuales.fechaRegistro ? new Date(eq.datosActuales.fechaRegistro).toLocaleDateString('es-CL') : '',
      'Estado': getEstado(eq).toUpperCase()
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const range = worksheet['!ref'] ? XLSX.utils.decode_range(worksheet['!ref']) : { s: { c: 0, r: 0 }, e: { c: 0, r: 0 } };

    for (let C = range.s.c; C <= range.e.c; ++C) {
      const cellAddress = XLSX.utils.encode_cell({ r: 0, c: C });
      if (worksheet[cellAddress]) {
        worksheet[cellAddress].s = {
          font: { bold: true, color: { rgb: "FFFFFFFF" } },
          fill: { fgColor: { rgb: "FFFF0000" } },
          alignment: { horizontal: "center" }
        };
      }
    }

    const estadoColumn = Object.keys(exportData[0] || {}).indexOf('Estado');
    for (let R = 1; R <= range.e.r && estadoColumn >= 0; ++R) {
      const estadoCellAddress = XLSX.utils.encode_cell({ r: R, c: estadoColumn });
      const estadoCell = worksheet[estadoCellAddress];

      if (estadoCell && estadoCell.v) {
        let bgColor = "FFFFFFFF";
        let fontColor = "FF000000";

        if (estadoCell.v === 'ROJO') {
          bgColor = "FFFFCCCC";
          fontColor = "FF990000";
        } else if (estadoCell.v === 'AMARILLO') {
          bgColor = "FFFFE599";
          fontColor = "FFB45F06";
        } else if (estadoCell.v === 'VERDE') {
          bgColor = "FFD9EAD3";
          fontColor = "FF274E13";
        }

        for (let C = range.s.c; C <= range.e.c; ++C) {
          const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
          if (worksheet[cellAddress]) {
            worksheet[cellAddress].s = {
              fill: { fgColor: { rgb: bgColor } },
              font: { color: { rgb: fontColor } },
              border: {
                top: { style: "thin", color: { auto: 1 } },
                bottom: { style: "thin", color: { auto: 1 } },
                left: { style: "thin", color: { auto: 1 } },
                right: { style: "thin", color: { auto: 1 } }
              }
            };
          }
        }
      }
    }

    const headers = Object.keys(exportData[0]);
    worksheet['!cols'] = headers.map(key => ({
      wch: Math.min(34, Math.max(14, key.length + 3, ...exportData.map(row => String(row[key] ?? '').length + 2)))
    }));
    worksheet['!autofilter'] = { ref: worksheet['!ref'] || 'A1:M1' };

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Flota");
    XLSX.writeFile(workbook, "Reporte_Flota_Vilas.xlsx");
  };

  const openAddModal = () => {
    setFormData(EMPTY_FORM);
    setCurrentEquipo(null);
    setIsModalOpen(true);
  };

  const openEditModal = (equipo) => {
    setCurrentEquipo(equipo);
    setFormData({
      nInterno: equipo.nInterno, tipo: equipo.tipo, ppu: equipo.ppu,
      cliente: equipo.cliente, sucursal: equipo.sucursal, faena: equipo.faena,
      marca: equipo.marca, modelo: equipo.modelo,
      ultimoHrsKm: equipo.ultimoMantenimiento.hrsKm,
      ultimoTipo: equipo.ultimoMantenimiento.tipoMan,
      ultimoFecha: equipo.ultimoMantenimiento.fecha,
      actualHrsKm: equipo.datosActuales.hrsKm,
      proxHrsKm: equipo.proxMantenimiento.hrsKm
    });
    setIsModalOpen(true);
  };

  const openQR = (equipo) => {
    setCurrentEquipo(equipo);
    setIsQRModalOpen(true);
  };

  const openLogbook = async (equipo) => {
    setCurrentEquipo(equipo);
    setLogbook({ readings: [], maintenances: [] });
    setIsLogbookOpen(true);
    setError('');
    try { setLogbook(await getHistory(equipo.id)); }
    catch (err) { setError(err.message); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    const equipoData = {
      nInterno: formData.nInterno,
      tipo: formData.tipo,
      ppu: formData.ppu,
      estadoEquipo: currentEquipo?.estadoEquipo || 'INTERNO',
      cliente: formData.cliente,
      sucursal: formData.sucursal,
      faena: formData.faena,
      marca: formData.marca,
      modelo: formData.modelo,
      ultimoMantenimiento: {
        tipoMan: formData.ultimoTipo,
        hrsKm: parseInt(formData.ultimoHrsKm, 10),
        fecha: formData.ultimoFecha
      },
      datosActuales: {
        diasSinIngreso: 0,
        hrsKm: parseInt(formData.actualHrsKm, 10),
        fechaRegistro: new Date().toISOString()
      },
      proxMantenimiento: {
        hrsKm: parseInt(formData.proxHrsKm, 10),
        tipoMan: formData.ultimoTipo
      }
    };

    try {
      if (currentEquipo) await updateEquipo(currentEquipo.id, equipoData);
      else await addEquipo(equipoData);
      setIsModalOpen(false);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1>Flota de equipos</h1>
          <p className="subtitle">Consulta interactiva de unidades, barra de desgaste de horómetros y bitácoras históricas</p>
        </div>
        <div className="page-actions">
          <div className="view-toggle" role="group" aria-label="Modo de visualización">
            <button
              type="button"
              className={`view-toggle-btn ${viewMode === 'table' ? 'active' : ''}`}
              onClick={() => setViewMode('table')}
              title="Vista de Tabla"
            >
              <List size={16} /> Tabla
            </button>
            <button
              type="button"
              className={`view-toggle-btn ${viewMode === 'cards' ? 'active' : ''}`}
              onClick={() => setViewMode('cards')}
              title="Vista de Tarjetas"
            >
              <LayoutGrid size={16} /> Tarjetas
            </button>
          </div>

          <button className="btn btn-secondary" onClick={exportToExcel}>
            <Download size={18} /> Exportar Excel
          </button>
          {user.role === 'admin' && (
            <button className="btn btn-primary" onClick={openAddModal}>
              <Plus size={18} /> Agregar Equipo
            </button>
          )}
        </div>
      </div>

      {error && <p role="alert" className="form-error">{error}</p>}

      <div className="glass-panel filters-panel" style={{ flexDirection: 'column', gap: '0.85rem' }}>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', width: '100%' }}>
          <div className="filter-field filter-search">
            <Search size={18} className="filter-icon" aria-hidden="true" />
            <input
              type="search"
              className="form-input filter-input"
              placeholder="Buscar por N° Interno, PPU, marca, modelo, cliente o faena..."
              aria-label="Buscar equipos por N° Interno o PPU"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="filter-field filter-select">
            <Filter size={18} className="filter-icon" aria-hidden="true" />
            <select
              className="form-input filter-input"
              aria-label="Filtrar por sucursal"
              value={filterSucursal}
              onChange={(e) => setFilterSucursal(e.target.value)}
            >
              <option value="Todas">Todas las sucursales</option>
              {branchOptions.map(loc => <option key={loc} value={loc}>{loc}</option>)}
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div className="status-chips" role="group" aria-label="Filtrar por estado de mantenimiento">
            {[
              ['todos', 'Todos los equipos', statusCounts.todos],
              ['verde', 'Operativos', statusCounts.verde],
              ['amarillo', 'Preventivos (≤100)', statusCounts.amarillo],
              ['rojo', 'Vencidos / Críticos', statusCounts.rojo]
            ].map(([key, label, count]) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilterStatus(key)}
                className={`status-chip ${filterStatus === key ? 'active' : ''}`}
              >
                <span>{label}</span>
                <span className="status-chip-count">{count}</span>
              </button>
            ))}
          </div>

          <p className="result-count" role="status" style={{ margin: 0 }}>
            Mostrando <strong>{filteredFleet.length}</strong> de <strong>{fleet.length}</strong> equipos
          </p>
        </div>
      </div>

      {viewMode === 'table' ? (
        <div className="glass-panel table-container">
          <table className="fleet-table">
            <caption className="sr-only">Listado de equipos de la flota</caption>
            <thead>
              <tr>
                <th scope="col">N° Interno</th>
                <th scope="col">Tipo / Modelo</th>
                <th scope="col">PPU (Patente)</th>
                <th scope="col">Cliente / Faena</th>
                <th scope="col">Progreso Ciclo (Actual / Próx.)</th>
                <th scope="col">Estado</th>
                <th scope="col" style={{ textAlign: 'right' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredFleet.map(equipo => {
                const estado = getEstado(equipo);
                const unit = getReadingUnit(equipo);
                const { actual, prox, restante, pct } = getCycleInfo(equipo);
                return (
                  <tr key={equipo.id}>
                    <td>
                      <button
                        className="equipment-link mono-code"
                        type="button"
                        onClick={() => openLogbook(equipo)}
                        title="Ver bitácora histórica completa"
                      >
                        {equipo.nInterno}
                      </button>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{equipo.tipo}</div>
                      <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)' }}>{equipo.marca} {equipo.modelo}</div>
                    </td>
                    <td>
                      <span className="code-pill">{equipo.ppu || 'S/P'}</span>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{equipo.cliente}</div>
                      <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)' }}>{equipo.faena} ({equipo.sucursal})</div>
                    </td>
                    <td>
                      <div className="usage-bar-wrap">
                        <div className="usage-bar-labels">
                          <strong>{actual.toLocaleString('es-CL')} {unit}</strong>
                          <span>Meta: {prox.toLocaleString('es-CL')} {unit}</span>
                        </div>
                        <div className="usage-bar-track">
                          <div className={`usage-bar-fill ${estado}`} style={{ width: `${pct}%` }} />
                        </div>
                        <div style={{ fontSize: '0.7rem', color: restante <= 0 ? 'var(--status-red)' : 'var(--text-muted)', fontWeight: restante <= 0 ? 700 : 500 }}>
                          {restante > 0 ? `Restan ${restante.toLocaleString('es-CL')} ${unit}` : `Excedido por ${Math.abs(restante).toLocaleString('es-CL')} ${unit}`}
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={`status-badge ${estado}`}>{STATUS_LABEL[estado] || 'Vencido'}</span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div className="row-actions">
                        <button
                          className="btn btn-secondary btn-icon"
                          onClick={() => openLogbook(equipo)}
                          title="Bitácora histórica"
                          aria-label={`Bitácora de ${equipo.nInterno}`}
                        >
                          <BookOpen size={16} />
                        </button>
                        <button
                          className="btn btn-secondary btn-icon"
                          onClick={() => navigate(`/horometers/${equipo.id}`)}
                          title="Actualizar Horómetro"
                          aria-label={`Actualizar lectura de ${equipo.nInterno}`}
                        >
                          <Clock size={16} />
                        </button>
                        <button
                          className="btn btn-secondary btn-icon"
                          onClick={() => openQR(equipo)}
                          title="Generar QR"
                          aria-label={`Generar QR de ${equipo.nInterno}`}
                        >
                          <QrCode size={16} />
                        </button>
                        {user.role === 'admin' && (
                          <>
                            <button
                              className="btn btn-secondary btn-icon"
                              onClick={() => openEditModal(equipo)}
                              title="Editar"
                              aria-label={`Editar ${equipo.nInterno}`}
                            >
                              <Edit2 size={16} />
                            </button>
                            <button
                              className="btn btn-secondary btn-icon btn-danger"
                              onClick={() => handleDelete(equipo.id)}
                              title="Desactivar equipo"
                              aria-label={`Desactivar ${equipo.nInterno}`}
                            >
                              <Trash2 size={16} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredFleet.length === 0 && (
                <tr>
                  <td colSpan="7" className="table-empty">No se encontraron equipos con los criterios seleccionados.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="fleet-cards-grid">
          {filteredFleet.map(equipo => {
            const estado = getEstado(equipo);
            const unit = getReadingUnit(equipo);
            const { actual, prox, restante, pct } = getCycleInfo(equipo);
            return (
              <article key={equipo.id} className="glass-panel fleet-unit-card">
                <div className="fleet-unit-card-header">
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                      <button
                        type="button"
                        className="equipment-link mono-code"
                        style={{ fontSize: '1.05rem' }}
                        onClick={() => openLogbook(equipo)}
                      >
                        {equipo.nInterno}
                      </button>
                      <span className="code-pill">{equipo.ppu}</span>
                    </div>
                    <div style={{ fontWeight: 700, fontSize: '0.92rem' }}>{equipo.tipo}</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{equipo.marca} {equipo.modelo}</div>
                  </div>
                  <span className={`status-badge ${estado}`}>{STATUS_LABEL[estado]}</span>
                </div>

                <div className="fleet-unit-meta">
                  <div>
                    <span style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      <Building2 size={13} /> Cliente
                    </span>
                    <strong style={{ display: 'block', marginTop: '0.1rem' }}>{equipo.cliente}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      <MapPin size={13} /> Faena / Sucursal
                    </span>
                    <strong style={{ display: 'block', marginTop: '0.1rem' }}>{equipo.faena} ({equipo.sucursal})</strong>
                  </div>
                </div>

                <div className="usage-bar-wrap">
                  <div className="usage-bar-labels">
                    <span>Actual: <strong>{actual.toLocaleString('es-CL')} {unit}</strong></span>
                    <span>Próx: <strong>{prox.toLocaleString('es-CL')} {unit}</strong></span>
                  </div>
                  <div className="usage-bar-track">
                    <div className={`usage-bar-fill ${estado}`} style={{ width: `${pct}%` }} />
                  </div>
                  <div style={{ fontSize: '0.74rem', color: restante <= 0 ? 'var(--status-red)' : 'var(--text-muted)', fontWeight: 600 }}>
                    {restante > 0
                      ? `Disponibles: ${restante.toLocaleString('es-CL')} ${unit} antes de servicio`
                      : `Mantenimiento vencido por ${Math.abs(restante).toLocaleString('es-CL')} ${unit}`}
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto', paddingTop: '0.5rem', borderTop: '1px solid var(--border-color)' }}>
                  <button type="button" className="btn btn-secondary" style={{ padding: '0.4rem 0.75rem', fontSize: '0.78rem' }} onClick={() => openLogbook(equipo)}>
                    <BookOpen size={15} /> Bitácora
                  </button>
                  <div className="row-actions">
                    <button className="btn btn-secondary btn-icon" onClick={() => navigate(`/horometers/${equipo.id}`)} title="Registrar lectura">
                      <Clock size={15} />
                    </button>
                    <button className="btn btn-secondary btn-icon" onClick={() => openQR(equipo)} title="Generar QR">
                      <QrCode size={15} />
                    </button>
                    {user.role === 'admin' && (
                      <>
                        <button className="btn btn-secondary btn-icon" onClick={() => openEditModal(equipo)} title="Editar">
                          <Edit2 size={15} />
                        </button>
                        <button className="btn btn-secondary btn-icon btn-danger" onClick={() => handleDelete(equipo.id)} title="Desactivar">
                          <Trash2 size={15} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
          {filteredFleet.length === 0 && (
            <div className="glass-panel table-empty" style={{ gridColumn: '1 / -1' }}>
              No se encontraron equipos con los filtros seleccionados.
            </div>
          )}
        </div>
      )}

      {isModalOpen && (
        <Modal title={currentEquipo ? 'Editar Equipo' : 'Agregar Nuevo Equipo'} onClose={() => setIsModalOpen(false)}>
          <form onSubmit={handleSubmit}>
            <div className="equipment-form-grid">
              <Field label="N° Interno">{id => <input id={id} required className="form-input" value={formData.nInterno} onChange={setField('nInterno')} />}</Field>
              <Field label="PPU (Patente)">{id => <input id={id} required className="form-input" value={formData.ppu} onChange={setField('ppu')} />}</Field>
              <Field label="Tipo">
                {id => (
                  <select id={id} required className="form-input" value={formData.tipo} onChange={setField('tipo')}>
                    <option value="">Seleccione un tipo...</option>
                    {EQUIPMENT_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                )}
              </Field>
              <Field label="Cliente">{id => <input id={id} required className="form-input" value={formData.cliente} onChange={setField('cliente')} />}</Field>
              <Field label="Sucursal / Localidad">
                {id => (
                  <select id={id} required className="form-input" value={formData.sucursal} onChange={setField('sucursal')}>
                    <option value="">Seleccione localidad...</option>
                    {formBranches.map(branch => <option key={branch} value={branch}>{branch}</option>)}
                  </select>
                )}
              </Field>
              <Field label="Faena">{id => <input id={id} required className="form-input" value={formData.faena} onChange={setField('faena')} />}</Field>
              <Field label="Marca">{id => <input id={id} required className="form-input" value={formData.marca} onChange={setField('marca')} />}</Field>
              <Field label="Modelo">{id => <input id={id} required className="form-input" value={formData.modelo} onChange={setField('modelo')} />}</Field>

              <h3 className="form-section-title">Datos de Mantenimiento</h3>

              <Field label="Hrs/Km Actuales">{id => <input id={id} type="number" step="1" min="0" required className="form-input" value={formData.actualHrsKm} onChange={setField('actualHrsKm')} />}</Field>
              <Field label="Próxima Mantención (Hrs/Km)">{id => <input id={id} type="number" step="1" min="0" required className="form-input" value={formData.proxHrsKm} onChange={setField('proxHrsKm')} />}</Field>
            </div>
            {error && <p role="alert" className="form-error">{error}</p>}
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>Cancelar</button>
              <button type="submit" disabled={busy} className="btn btn-primary">{busy ? 'Guardando...' : 'Guardar'}</button>
            </div>
          </form>
        </Modal>
      )}

      {isQRModalOpen && currentEquipo && (
        <Modal title="Código QR en Terreno" size="sm" align="center" onClose={() => setIsQRModalOpen(false)}>
          <div className="qr-modal-body">
            <p className="qr-modal-text">Escanea para registrar horómetro del equipo <strong>{currentEquipo.nInterno}</strong>. Para acceder desde otro dispositivo, abre el servidor desde una dirección de red accesible.</p>
            <div className="qr-box">
              <QRCodeSVG value={`${window.location.origin}/horometers/${currentEquipo.id}`} size={200} />
            </div>
            <div className="qr-modal-print">
              <button className="btn btn-primary" onClick={() => window.print()}>Imprimir QR</button>
            </div>
          </div>
        </Modal>
      )}

      {isLogbookOpen && currentEquipo && (
        <Modal title={`Bitácora Histórica: ${currentEquipo.nInterno}`} onClose={() => setIsLogbookOpen(false)}>
          <div className="logbook-summary">
            <div><strong>Marca/Modelo:</strong> {currentEquipo.marca} {currentEquipo.modelo}</div>
            <div><strong>Patente:</strong> {currentEquipo.ppu}</div>
            <div><strong>Cliente:</strong> {currentEquipo.cliente}</div>
            <div><strong>Faena:</strong> {currentEquipo.faena}</div>
          </div>

          <h3>Lecturas de horómetro</h3>
          <div className="table-container">
            <table className="fleet-table">
              <thead><tr><th scope="col">Fecha</th><th scope="col">Lectura</th><th scope="col">Usuario</th></tr></thead>
              <tbody>
                {logbook.readings.map(row => <tr key={row.id}><td>{new Date(row.recorded_at).toLocaleString('es-CL')}</td><td className="mono-code">{row.value}</td><td>{row.user_name || 'Inicial'}</td></tr>)}
                {!logbook.readings.length && <tr><td colSpan="3">Sin lecturas registradas</td></tr>}
              </tbody>
            </table>
          </div>
          <h3 className="logbook-title">Mantenimientos realizados</h3>
          {logbook.maintenances.map(row => (
            <div key={row.id} className="logbook-item">
              <strong>{row.type}</strong> · {row.performed_at}
              <div>Orden: {row.work_order || 'No informada'}</div>
              <div>Lectura: {row.value} · Próximo: {row.next_value}</div>
              {row.supplies && <div>Insumos: {row.supplies}</div>}
              {row.notes && <div>Observaciones: {row.notes}</div>}
            </div>
          ))}
          {!logbook.maintenances.length && <p>Sin mantenimientos registrados en este sistema.</p>}
        </Modal>
      )}
    </div>
  );
};

export default Fleet;
