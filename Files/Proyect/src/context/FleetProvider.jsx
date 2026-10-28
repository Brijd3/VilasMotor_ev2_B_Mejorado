import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext.js';
import { FleetContext } from './FleetContext.js';

export const FleetProvider = ({ children }) => {
  const { user, request } = useAuth();
  const [fleet, setFleet] = useState([]);
  const [error, setError] = useState('');
  const refreshFleet = useCallback(async () => {
    try {
      const data = await request('/api/fleet');
      setFleet(data);
      setError('');
      return data;
    } catch (e) {
      setError(e.message);
      throw e;
    }
  }, [request]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    request('/api/fleet')
      .then(data => {
        if (!active) return;
        setFleet(data);
        setError('');
      })
      .catch(e => {
        if (!active) return;
        setError(e.message);
      });
    return () => { active = false; };
  }, [user, request]);

  const addEquipo = async equipo => {
    const item = await request('/api/fleet', { method: 'POST', body: JSON.stringify(equipo) });
    await refreshFleet();
    return item;
  };
  const updateEquipo = async (id, equipo) => {
    const item = await request(`/api/fleet/${id}`, { method: 'PUT', body: JSON.stringify(equipo) });
    await refreshFleet();
    return item;
  };
  const deleteEquipo = async id => {
    await request(`/api/fleet/${id}`, { method: 'DELETE' });
    await refreshFleet();
  };
  const registerReading = async (id, value) => {
    const item = await request(`/api/fleet/${id}/readings`, { method: 'POST', body: JSON.stringify({ value }) });
    await refreshFleet();
    return item;
  };
  const registerMaintenance = async (id, record) => {
    const item = await request(`/api/fleet/${id}/maintenances`, { method: 'POST', body: JSON.stringify(record) });
    await refreshFleet();
    return item;
  };
  const getHistory = useCallback(id => request(`/api/fleet/${id}/history`), [request]);
  const getEquipo = id => fleet.find(eq => String(eq.id) === String(id));

  return <FleetContext.Provider value={{ fleet, error, refreshFleet, addEquipo, updateEquipo,
    deleteEquipo, registerReading, registerMaintenance, getHistory, getEquipo }}>{children}</FleetContext.Provider>;
};
