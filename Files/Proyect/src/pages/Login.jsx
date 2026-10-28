import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Wrench, LogIn, UserPlus, Eye, EyeOff } from 'lucide-react';
import Field from '../components/Field';
import PasswordStrengthChecklist from '../components/PasswordStrengthChecklist';
import { checkPasswordCriteria } from '../utils/passwordStrength';

const Login = () => {
  const { login, register } = useAuth();
  const [mode, setMode] = useState('login'); // 'login' | 'register'

  // Login states
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Register states
  const [regName, setRegName] = useState('');
  const [regUsername, setRegUsername] = useState('');
  const [regRole, setRegRole] = useState('mecanico');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [showRegConfirmPassword, setShowRegConfirmPassword] = useState(false);

  // Feedback states
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);

  const switchMode = (newMode) => {
    setMode(newMode);
    setError('');
    setSuccess('');
  };

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setBusy(true);
    try {
      await login(username, password);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    // Pre-validation of password criteria
    const { allMet, criteria } = checkPasswordCriteria(regPassword, regConfirmPassword);
    if (!criteria.minLength) {
      setError('La contraseña debe tener al menos 12 caracteres.');
      return;
    }
    if (!criteria.hasUpper || !criteria.hasLower || !criteria.hasNumber || !criteria.hasSpecial) {
      setError('La contraseña debe incluir mayúsculas, minúsculas, números y al menos un carácter especial.');
      return;
    }
    if (!criteria.matches) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    if (!allMet) {
      setError('Por favor cumpla con todos los requisitos de seguridad de la contraseña.');
      return;
    }

    setBusy(true);
    try {
      await register({
        username: regUsername.trim().toLowerCase(),
        name: regName.trim(),
        password: regPassword,
        role: regRole
      });
      // AuthProvider sets user on success and app redirects automatically
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <main className="login-screen">
      <div className={`glass-panel animate-fade-in login-card ${mode === 'register' ? 'register-mode' : ''}`}>

        <div className="login-brand">
          <div className="login-logo" aria-hidden="true">
            <Wrench color="white" size={32} />
          </div>
          <div>
            <h1 className="login-title">Vila's Motor</h1>
            <div className="login-since">
              <span className="login-since-line"></span>
              SINCE 1989
              <span className="login-since-line"></span>
            </div>
          </div>
        </div>

        {/* Auth mode switcher tabs */}
        <div className="auth-tabs" role="tablist" aria-label="Opciones de acceso">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'login'}
            className={`auth-tab ${mode === 'login' ? 'active' : ''}`}
            onClick={() => switchMode('login')}
          >
            <LogIn size={16} />
            <span>Iniciar Sesión</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'register'}
            className={`auth-tab ${mode === 'register' ? 'active' : ''}`}
            onClick={() => switchMode('register')}
          >
            <UserPlus size={16} />
            <span>Registrarse</span>
          </button>
        </div>

        <h2 className="login-heading">
          {mode === 'login' ? 'Acceso al Sistema' : 'Registro de Nuevo Usuario'}
        </h2>

        {error && <div role="alert" className="form-error">{error}</div>}
        {success && <div role="status" className="form-success" style={{ color: '#047857', background: '#ecfdf5', border: '1px solid #a7f3d0', padding: '0.6rem 0.85rem', borderRadius: 8, margin: '0.25rem 0 1rem', fontSize: '0.85rem', fontWeight: 600 }}>{success}</div>}

        {mode === 'login' ? (
          <form onSubmit={handleLoginSubmit} className="login-form">
            <Field label="Usuario">
              {id => (
                <input
                  id={id}
                  type="text"
                  className="form-input"
                  placeholder="Ej: admin"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                />
              )}
            </Field>

            <Field label="Contraseña" style={{ marginBottom: '1.5rem' }}>
              {id => (
                <div className="password-input-group">
                  <input
                    id={id}
                    type={showPassword ? 'text' : 'password'}
                    className="form-input"
                    placeholder="••••••••••••"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    className="password-toggle-btn"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              )}
            </Field>

            <button disabled={busy} type="submit" className="btn btn-primary login-submit">
              {busy ? 'Ingresando...' : 'Iniciar Sesión'}
            </button>

            <div className="auth-switch-prompt">
              ¿No tienes cuenta aún?{' '}
              <button type="button" className="auth-switch-btn" onClick={() => switchMode('register')}>
                Crear una nueva cuenta
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleRegisterSubmit} className="login-form">
            <Field label="Nombre Completo">
              {id => (
                <input
                  id={id}
                  type="text"
                  className="form-input"
                  placeholder="Ej: Juan Pérez"
                  autoComplete="name"
                  value={regName}
                  onChange={(e) => setRegName(e.target.value)}
                  minLength={2}
                  maxLength={100}
                  required
                />
              )}
            </Field>

            <Field label="Nombre de Usuario">
              {id => (
                <input
                  id={id}
                  type="text"
                  className="form-input"
                  placeholder="Ej: jperez (min. 3 caracteres)"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={regUsername}
                  onChange={(e) => setRegUsername(e.target.value)}
                  pattern="^[a-zA-Z0-9_.-]{3,80}$"
                  title="3 a 80 caracteres (letras, números, guiones o puntos)"
                  required
                />
              )}
            </Field>

            <Field label="Rol en el Sistema">
              {id => (
                <select
                  id={id}
                  className="form-input"
                  value={regRole}
                  onChange={(e) => setRegRole(e.target.value)}
                >
                  <option value="mecanico">Mecánico / Operador de terreno</option>
                  <option value="admin">Administrador</option>
                </select>
              )}
            </Field>

            <Field label="Contraseña (mínimo 12 caracteres)">
              {id => (
                <div className="password-input-group">
                  <input
                    id={id}
                    type={showRegPassword ? 'text' : 'password'}
                    className="form-input"
                    placeholder="Mínimo 12 caracteres con mayúsculas y símbolos"
                    autoComplete="new-password"
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    minLength={12}
                    maxLength={128}
                    required
                  />
                  <button
                    type="button"
                    className="password-toggle-btn"
                    onClick={() => setShowRegPassword(!showRegPassword)}
                    aria-label={showRegPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
                  >
                    {showRegPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              )}
            </Field>

            {/* Checklist interactivo de requisitos de contraseña */}
            <PasswordStrengthChecklist
              password={regPassword}
              confirmPassword={regConfirmPassword}
              showConfirmCheck={true}
            />

            <Field label="Confirmar Contraseña" style={{ marginBottom: '1.5rem' }}>
              {id => (
                <div className="password-input-group">
                  <input
                    id={id}
                    type={showRegConfirmPassword ? 'text' : 'password'}
                    className="form-input"
                    placeholder="Repita la contraseña"
                    autoComplete="new-password"
                    value={regConfirmPassword}
                    onChange={(e) => setRegConfirmPassword(e.target.value)}
                    minLength={12}
                    maxLength={128}
                    required
                  />
                  <button
                    type="button"
                    className="password-toggle-btn"
                    onClick={() => setShowRegConfirmPassword(!showRegConfirmPassword)}
                    aria-label={showRegConfirmPassword ? 'Ocultar confirmación' : 'Ver confirmación'}
                  >
                    {showRegConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              )}
            </Field>

            <button disabled={busy} type="submit" className="btn btn-primary login-submit">
              {busy ? 'Creando cuenta...' : 'Registrar Cuenta y Entrar'}
            </button>

            <div className="auth-switch-prompt">
              ¿Ya tienes cuenta?{' '}
              <button type="button" className="auth-switch-btn" onClick={() => switchMode('login')}>
                Iniciar sesión aquí
              </button>
            </div>
          </form>
        )}

        <div className="login-hint">
          {mode === 'login' ? (
            <>
              Las credenciales se generan al iniciar el servidor por primera vez.<br/>
              Consulte la terminal de PowerShell o regístrese como nuevo usuario.
            </>
          ) : (
            <>
              La contraseña debe contener al menos 12 caracteres, mayúsculas, minúsculas, números y símbolos por política de seguridad.
            </>
          )}
        </div>
      </div>
    </main>
  );
};

export default Login;
