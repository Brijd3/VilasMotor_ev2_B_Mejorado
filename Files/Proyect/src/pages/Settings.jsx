import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import Field from '../components/Field';
import PasswordStrengthChecklist from '../components/PasswordStrengthChecklist';

const SettingsPage = () => {
  const { user, request } = useAuth();
  const [users, setUsers] = useState([]);
  const [message, setMessage] = useState('');
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '' });
  const [form, setForm] = useState({ username: '', name: '', role: 'mecanico', password: '' });
  useEffect(() => { if (user.role === 'admin') request('/api/users').then(setUsers).catch(e => setMessage(e.message)); }, [user.role, request]);
  const changePassword = async e => {
    e.preventDefault(); setMessage('');
    try { await request('/api/auth/change-password', { method: 'POST', body: JSON.stringify(passwords) });
      setPasswords({ currentPassword: '', newPassword: '' }); setMessage('Contraseña actualizada.');
    } catch (err) { setMessage(err.message); }
  };
  const createUser = async e => {
    e.preventDefault(); setMessage('');
    try { await request('/api/users', { method: 'POST', body: JSON.stringify(form) });
      setUsers(await request('/api/users')); setForm({ username: '', name: '', role: 'mecanico', password: '' });
      setMessage('Usuario registrado.');
    } catch (err) { setMessage(err.message); }
  };
  return <div className="animate-fade-in">
    <h1>Configuración y seguridad</h1>
    <p className="subtitle">Cuenta activa: {user.name} · Rol: {user.role}</p>
    {message && <p role="status" style={{ margin: '1rem 0' }}>{message}</p>}
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: '1.5rem' }}>
      <div className="glass-panel" style={{ padding: '1.5rem' }}>
        <h2>Cambiar mi contraseña</h2>
        <form onSubmit={changePassword}>
          <Field label="Contraseña actual">{id => <input id={id} className="form-input" type="password" autoComplete="current-password" required value={passwords.currentPassword} onChange={e => setPasswords({ ...passwords, currentPassword: e.target.value })}/>}</Field>
          <Field label="Nueva contraseña (mínimo 12 caracteres)">{id => <input id={id} className="form-input" type="password" autoComplete="new-password" minLength={12} required value={passwords.newPassword} onChange={e => setPasswords({ ...passwords, newPassword: e.target.value })}/>}</Field>
          {passwords.newPassword && <PasswordStrengthChecklist password={passwords.newPassword} />}
          <button className="btn btn-primary" type="submit">Actualizar contraseña</button>
        </form>
      </div>
      {user.role === 'admin' && <div className="glass-panel" style={{ padding: '1.5rem' }}>
        <h2>Crear cuenta</h2>
        <form onSubmit={createUser}>
          {[['username','Usuario'],['name','Nombre'],['password','Contraseña (mínimo 12 caracteres)']].map(([key, label]) => <Field label={label} key={key}>
            {id => <input id={id} className="form-input" type={key === 'password' ? 'password' : 'text'} autoComplete={key === 'password' ? 'new-password' : 'off'} minLength={key === 'password' ? 12 : 3} required value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })}/>}</Field>)}
          {form.password && <PasswordStrengthChecklist password={form.password} />}
          <Field label="Rol">{id => <select id={id} className="form-input" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}><option value="mecanico">Mecánico / operador</option><option value="admin">Administrador</option></select>}</Field>
          <button type="submit" className="btn btn-primary">Agregar cuenta</button>
        </form>
        <h3 style={{ marginTop: '1.5rem' }}>Cuentas existentes</h3>
        {users.map(item => <div key={item.id} style={{ padding: '0.35rem 0' }}>{item.name} ({item.username}) — {item.role}</div>)}
      </div>}
    </div>
  </div>;
};
export default SettingsPage;
