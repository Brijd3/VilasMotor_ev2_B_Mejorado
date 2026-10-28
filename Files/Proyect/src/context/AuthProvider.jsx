import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AuthContext } from './AuthContext.js';

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const csrfRef = useRef('');

  const request = useCallback(async (url, options = {}) => {
    const headers = { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers };
    if (options.method && !['GET', 'HEAD'].includes(options.method.toUpperCase())) {
      headers['X-CSRF-Token'] = csrfRef.current;
    }
    let response;
    try {
      response = await fetch(url, { ...options, headers, credentials: 'same-origin' });
    } catch {
      throw new Error('No se pudo conectar con el servidor. Verifique que esté encendido.');
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401) { setUser(null); csrfRef.current = ''; }
      throw new Error(data.error || `Error HTTP ${response.status}`);
    }
    return data;
  }, []);

  useEffect(() => {
    let active = true;
    fetch('/api/auth/me', { credentials: 'same-origin' })
      .then(response => response.json())
      .then(data => {
        if (!active) return;
        csrfRef.current = data.csrfToken || '';
        setUser(data.user || null);
      })
      .catch(() => { if (active) setUser(null); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const login = async (username, password) => {
    const response = await fetch('/api/auth/login', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password })
    }).catch(() => { throw new Error('No se puede conectar con el servidor.'); });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'No fue posible iniciar sesión.');
    csrfRef.current = data.csrfToken;
    setUser(data.user);
  };

  const register = async ({ username, name, password, role = 'mecanico' }) => {
    const response = await fetch('/api/auth/register', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, name, password, role })
    }).catch(() => { throw new Error('No se puede conectar con el servidor.'); });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'No fue posible registrar la cuenta.');
    csrfRef.current = data.csrfToken;
    setUser(data.user);
    return data.user;
  };

  const logout = async () => {
    try { await request('/api/auth/logout', { method: 'POST' }); }
    finally { csrfRef.current = ''; setUser(null); }
  };

  return <AuthContext.Provider value={{ user, loading, login, register, logout, request }}>{children}</AuthContext.Provider>;
};
