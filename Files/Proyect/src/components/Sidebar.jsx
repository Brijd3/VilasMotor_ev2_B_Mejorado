import React, { useState, useEffect, useMemo, useRef } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Truck, Clock, Settings, Wrench, Map, Bell,
  LogOut, ClipboardList, Sun, Moon, ShieldCheck, ChevronLeft,
  ChevronRight, Plus, Search, X, Menu
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useFleet } from '../context/FleetContext';
import { calculateStatus } from '../data/mockData';
import { getReadingUnit } from '../utils/readingUnits.js';

const Sidebar = () => {
  const { user, logout } = useAuth();
  const { fleet } = useFleet();
  const navigate = useNavigate();
  const location = useLocation();
  const searchInputRef = useRef(null);

  // Modo Colapsable (Rail Mode) con persistencia
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem('vilas_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });

  // Drawer para dispositivos móviles
  const [mobileOpen, setMobileOpen] = useState(false);

  // Buscador Rápido
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  // Menú flotante de Acción Rápida
  const [showQuickMenu, setShowQuickMenu] = useState(false);

  // Estado de conexión en vivo con la API backend
  const [apiOnline, setApiOnline] = useState(true);

  // Tema Claro / Oscuro
  const [darkMode, setDarkMode] = useState(() => {
    try {
      return localStorage.getItem('vilas_theme') === 'dark';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.setAttribute('data-theme', 'dark');
      try { localStorage.setItem('vilas_theme', 'dark'); } catch { /* ignore */ }
    } else {
      root.removeAttribute('data-theme');
      try { localStorage.setItem('vilas_theme', 'light'); } catch { /* ignore */ }
    }
  }, [darkMode]);

  // Actualizar clase en document.body para que el layout se ajuste
  useEffect(() => {
    if (collapsed) {
      document.body.classList.add('sidebar-collapsed');
      try { localStorage.setItem('vilas_sidebar_collapsed', 'true'); } catch { /* ignore */ }
    } else {
      document.body.classList.remove('sidebar-collapsed');
      try { localStorage.setItem('vilas_sidebar_collapsed', 'false'); } catch { /* ignore */ }
    }
  }, [collapsed]);

  // Cerrar menús al cambiar de ruta
  useEffect(() => {
    setMobileOpen(false);
    setShowQuickMenu(false);
    setSearchQuery('');
  }, [location.pathname]);

  // Atajo de teclado global (Ctrl + K o Cmd + K) para enfocar el buscador
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (collapsed) setCollapsed(false);
        setTimeout(() => searchInputRef.current?.focus(), 50);
      }
      if (e.key === 'Escape') {
        setShowQuickMenu(false);
        setSearchQuery('');
        searchInputRef.current?.blur();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [collapsed]);

  // Chequeo periódico de salud de la API
  useEffect(() => {
    let active = true;
    const checkApi = async () => {
      try {
        const res = await fetch('/api/health');
        if (res.ok && active) setApiOnline(true);
        else if (active) setApiOnline(false);
      } catch {
        if (active) setApiOnline(false);
      }
    };
    checkApi();
    const interval = setInterval(checkApi, 30000);
    return () => { active = false; clearInterval(interval); };
  }, []);

  // Alertas de mantenimiento
  const critical = useMemo(() => {
    return fleet.filter(eq => calculateStatus(eq.datosActuales?.hrsKm, eq.proxMantenimiento?.hrsKm) === 'rojo').length;
  }, [fleet]);

  const soon = useMemo(() => {
    return fleet.filter(eq => calculateStatus(eq.datosActuales?.hrsKm, eq.proxMantenimiento?.hrsKm) === 'amarillo').length;
  }, [fleet]);

  // Resultados del buscador rápido
  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return fleet.filter(eq => {
      return (
        String(eq.nInterno || '').toLowerCase().includes(q) ||
        String(eq.ppu || '').toLowerCase().includes(q) ||
        String(eq.marca || '').toLowerCase().includes(q) ||
        String(eq.modelo || '').toLowerCase().includes(q) ||
        String(eq.cliente || '').toLowerCase().includes(q) ||
        String(eq.faena || '').toLowerCase().includes(q)
      );
    }).slice(0, 5);
  }, [fleet, searchQuery]);

  // Secciones modulares de navegación
  const navSections = [
    {
      title: 'Operaciones',
      items: [
        { path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
        { path: '/horometers', icon: Clock, label: 'Horómetros' },
        { path: '/telemetry', icon: Map, label: 'Mapa y Faenas' }
      ]
    },
    {
      title: 'Gestión Técnica',
      items: [
        { path: '/fleet', icon: Truck, label: 'Flota Maquinaria', badge: fleet.length || null },
        {
          path: '/maintenance',
          icon: ClipboardList,
          label: 'Mantenimientos',
          badge: (critical + soon) || null,
          badgeAlert: critical > 0
        }
      ]
    },
    {
      title: 'Sistema',
      items: [
        { path: '/settings', icon: Settings, label: 'Configuración' }
      ]
    }
  ];

  const handleSelectQuickEquipment = (eq) => {
    setSearchQuery('');
    navigate(`/horometers/${eq.id}`);
  };

  // Iniciales del usuario para avatar
  const userInitials = useMemo(() => {
    if (!user?.name) return 'VM';
    const parts = user.name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }, [user]);

  return (
    <>
      {/* Botón flotante para dispositivos móviles */}
      <button
        type="button"
        className="mobile-sidebar-toggle"
        onClick={() => setMobileOpen(prev => !prev)}
        aria-label={mobileOpen ? 'Cerrar menú' : 'Abrir menú'}
      >
        {mobileOpen ? <X size={22} /> : <Menu size={22} />}
      </button>

      {/* Overlay oscuro para móvil */}
      {mobileOpen && (
        <div
          className="sidebar-mobile-backdrop"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside className={`sidebar ${collapsed ? 'is-collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}>
        {/* Cabecera / Marca y Botón de Colapso */}
        <div className="sidebar-header">
          <div className="brand" onClick={() => navigate('/dashboard')} style={{ cursor: 'pointer' }}>
            <div className="brand-icon-wrapper">
              <Wrench className="brand-icon" size={20} aria-hidden="true" />
            </div>
            {!collapsed && (
              <div className="brand-text">
                <span className="brand-title">Vila's Motor</span>
                <span className="brand-sub">SISTEMA DE FLOTA</span>
              </div>
            )}
          </div>

          <button
            type="button"
            className="sidebar-collapse-btn"
            onClick={() => setCollapsed(prev => !prev)}
            title={collapsed ? 'Expandir barra lateral' : 'Colapsar barra lateral'}
            aria-label={collapsed ? 'Expandir barra lateral' : 'Colapsar barra lateral'}
          >
            {collapsed ? <ChevronRight size={17} /> : <ChevronLeft size={17} />}
          </button>
        </div>

        {/* Botón de Acción Rápida "+ Operación" */}
        <div className="sidebar-quick-action-container">
          <button
            type="button"
            className="quick-action-btn"
            onClick={() => setShowQuickMenu(prev => !prev)}
            title="Registrar operación rápida"
          >
            <Plus size={18} className="quick-action-plus" />
            {!collapsed && <span>Nueva Operación</span>}
          </button>

          {/* Menú desplegable de acciones */}
          {showQuickMenu && (
            <div className="quick-action-dropdown animate-pop-in">
              <div className="quick-dropdown-header">Acceso Rápido</div>
              <button
                type="button"
                className="quick-dropdown-item"
                onClick={() => { setShowQuickMenu(false); navigate('/horometers'); }}
              >
                <Clock size={16} color="#38bdf8" />
                <div className="quick-dropdown-item-info">
                  <strong>Registrar Horómetro</strong>
                  <small>Actualizar kilometraje o lectura</small>
                </div>
              </button>
              <button
                type="button"
                className="quick-dropdown-item"
                onClick={() => { setShowQuickMenu(false); navigate('/maintenance'); }}
              >
                <Wrench size={16} color="#fbbf24" />
                <div className="quick-dropdown-item-info">
                  <strong>Registrar Mantenimiento</strong>
                  <small>Intervención y orden de trabajo</small>
                </div>
              </button>
              {user?.role === 'admin' && (
                <button
                  type="button"
                  className="quick-dropdown-item"
                  onClick={() => { setShowQuickMenu(false); navigate('/fleet?action=new'); }}
                >
                  <Truck size={16} color="#4ade80" />
                  <div className="quick-dropdown-item-info">
                    <strong>Alta de Maquinaria</strong>
                    <small>Registrar nuevo equipo a la flota</small>
                  </div>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Buscador Rápido de Equipos (Ctrl + K) */}
        {!collapsed ? (
          <div className="sidebar-search-box">
            <div className={`sidebar-search-input-wrapper ${isSearchFocused ? 'focused' : ''}`}>
              <Search size={16} className="search-icon-left" />
              <input
                ref={searchInputRef}
                id="sidebar-quick-search"
                type="text"
                placeholder="Buscar máquina (Ctrl+K)..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onFocus={() => setIsSearchFocused(true)}
                onBlur={() => setTimeout(() => setIsSearchFocused(false), 200)}
                aria-label="Buscar equipo o faena rápidamente"
              />
              {searchQuery ? (
                <button
                  type="button"
                  className="search-clear-btn"
                  onClick={() => setSearchQuery('')}
                  aria-label="Limpiar búsqueda"
                >
                  <X size={14} />
                </button>
              ) : (
                <kbd className="search-kbd">⌘K</kbd>
              )}
            </div>

            {/* Resultados flotantes de búsqueda */}
            {searchQuery.trim().length > 0 && (
              <div className="sidebar-search-results animate-pop-in">
                {searchResults.length > 0 ? (
                  searchResults.map(eq => {
                    const st = calculateStatus(eq.datosActuales?.hrsKm, eq.proxMantenimiento?.hrsKm);
                    const unit = getReadingUnit(eq);
                    return (
                      <div
                        key={eq.id}
                        className="search-result-item"
                        onClick={() => handleSelectQuickEquipment(eq)}
                      >
                        <div className="search-result-top">
                          <span className={`status-dot ${st}`} />
                          <strong className="search-result-code">{eq.nInterno}</strong>
                          <span className="search-result-ppu">{eq.ppu || 'S/P'}</span>
                        </div>
                        <div className="search-result-desc">
                          <span>{eq.marca} {eq.modelo}</span>
                          <span className="search-result-val">{eq.datosActuales?.hrsKm} {unit}</span>
                        </div>
                        <div className="search-result-sub">
                          {eq.cliente} · {eq.faena}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="search-result-empty">
                    No se encontró maquinaria para "{searchQuery}"
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="sidebar-collapsed-search-trigger">
            <button
              type="button"
              className="collapsed-icon-btn"
              onClick={() => { setCollapsed(false); setTimeout(() => searchInputRef.current?.focus(), 100); }}
              title="Buscar maquinaria (Ctrl + K)"
            >
              <Search size={18} />
            </button>
          </div>
        )}

        {/* Lista de Navegación Modular */}
        <nav className="nav-container" aria-label="Navegación principal">
          {navSections.map((section, idx) => (
            <div key={idx} className="nav-section">
              {!collapsed && <div className="nav-section-title">{section.title}</div>}
              {collapsed && idx > 0 && <div className="nav-section-divider" />}
              <div className="nav-section-items">
                {section.items.map(item => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      end
                      className={({ isActive }) => `nav-item ${isActive ? 'active' : ''} ${collapsed ? 'is-rail' : ''}`}
                      title={collapsed ? item.label : undefined}
                    >
                      <div className="nav-icon-box">
                        <Icon size={19} />
                        {item.badgeAlert && (
                          <span className="nav-icon-badge-dot" />
                        )}
                      </div>
                      {!collapsed && <span className="nav-text">{item.label}</span>}
                      {!collapsed && item.badge !== null && item.badge !== undefined && (
                        <span className={`nav-badge ${item.badgeAlert ? 'badge-alert' : ''}`}>
                          {item.badge}
                        </span>
                      )}
                    </NavLink>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Sección de Alertas Interactivas */}
        {!collapsed ? (
          <div className="sidebar-alerts-card">
            <div className="alerts-card-header">
              <div className="alerts-card-title">
                <Bell size={15} className={critical > 0 ? 'bell-shake' : ''} />
                <span>Alertas de Taller</span>
              </div>
              <span className="alerts-total-count">{critical + soon}</span>
            </div>

            <div className="alerts-action-chips">
              <button
                type="button"
                className={`alert-chip chip-red ${critical > 0 ? 'has-critical' : ''}`}
                onClick={() => navigate('/fleet?status=rojo')}
                title="Ver equipos con mantenimiento vencido"
              >
                <span className="chip-indicator red" />
                <span className="chip-label">Vencidos:</span>
                <strong>{critical}</strong>
              </button>

              <button
                type="button"
                className="alert-chip chip-yellow"
                onClick={() => navigate('/fleet?status=amarillo')}
                title="Ver equipos próximos a mantenimiento preventivo"
              >
                <span className="chip-indicator yellow" />
                <span className="chip-label">Próximos:</span>
                <strong>{soon}</strong>
              </button>
            </div>
          </div>
        ) : (
          <div className="sidebar-collapsed-alert-icon">
            <button
              type="button"
              className="collapsed-icon-btn alert-indicator"
              onClick={() => navigate('/fleet?status=rojo')}
              title={`${critical} vencidos y ${soon} preventivos`}
            >
              <Bell size={18} className={critical > 0 ? 'bell-shake' : ''} />
              {(critical + soon) > 0 && (
                <span className="collapsed-alert-badge">{critical + soon}</span>
              )}
            </button>
          </div>
        )}

        {/* Pie de la barra lateral (API status, Modo oscuro, Perfil) */}
        <div className="sidebar-footer">
          {/* Indicador de conectividad con la API */}
          {!collapsed ? (
            <div className={`api-status-banner ${apiOnline ? 'online' : 'offline'}`}>
              <span className="api-status-pulse" />
              <span className="api-status-text">
                {apiOnline ? 'API 3001 · En línea' : 'API Desconectada'}
              </span>
            </div>
          ) : (
            <div
              className={`api-status-dot-only ${apiOnline ? 'online' : 'offline'}`}
              title={apiOnline ? 'API Conectada en puerto 3001' : 'API Desconectada'}
            />
          )}

          {/* Selector de Tema */}
          <button
            type="button"
            className={`theme-toggle-modern ${collapsed ? 'rail-theme' : ''}`}
            onClick={() => setDarkMode(prev => !prev)}
            title={darkMode ? 'Cambiar a Modo Claro Corporativo' : 'Cambiar a Modo Oscuro Industrial'}
          >
            <div className="theme-toggle-left">
              {darkMode ? <Sun size={17} color="#fbbf24" /> : <Moon size={17} color="#94a3b8" />}
              {!collapsed && <span>{darkMode ? 'Modo Claro' : 'Modo Oscuro'}</span>}
            </div>
            {!collapsed && (
              <span className="theme-toggle-pill">{darkMode ? 'LIGHT' : 'DARK'}</span>
            )}
          </button>

          {/* Información del Usuario y Logout */}
          {user && (
            <div className={`sidebar-user-card ${collapsed ? 'rail-user' : ''}`}>
              <div
                className="user-avatar"
                title={`${user.name} (${user.role === 'admin' ? 'Administrador' : 'Mecánico'})`}
              >
                {userInitials}
              </div>

              {!collapsed && (
                <div className="user-details">
                  <span className="user-name" title={user.name}>{user.name}</span>
                  <span className={`user-role-badge ${user.role}`}>
                    <ShieldCheck size={11} />
                    <span>{user.role === 'admin' ? 'Administrador' : 'Mecánico'}</span>
                  </span>
                </div>
              )}

              <button
                type="button"
                className="sidebar-logout-modern"
                onClick={() => logout().catch(() => {})}
                title="Cerrar Sesión Segura"
                aria-label="Cerrar sesión"
              >
                <LogOut size={17} />
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  );
};

export default Sidebar;

