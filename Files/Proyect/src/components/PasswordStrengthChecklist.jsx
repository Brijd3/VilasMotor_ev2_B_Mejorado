import React from 'react';
import { Check, X } from 'lucide-react';
import { checkPasswordCriteria } from '../utils/passwordStrength.js';

export default function PasswordStrengthChecklist({ password = '', confirmPassword, showConfirmCheck = false }) {
  const { criteria, score, strengthLabel, strengthColor } = checkPasswordCriteria(password, showConfirmCheck ? confirmPassword : undefined);
  const percent = Math.min(100, Math.round((score / 5) * 100));

  const items = [
    { key: 'minLength', label: `Mínimo 12 caracteres (${password.length}/12)`, met: criteria.minLength },
    { key: 'hasUpper', label: 'Al menos una letra mayúscula (A-Z)', met: criteria.hasUpper },
    { key: 'hasLower', label: 'Al menos una letra minúscula (a-z)', met: criteria.hasLower },
    { key: 'hasNumber', label: 'Al menos un número (0-9)', met: criteria.hasNumber },
    { key: 'hasSpecial', label: 'Al menos un carácter especial (ej: !@#$%)', met: criteria.hasSpecial }
  ];

  if (showConfirmCheck && confirmPassword !== undefined) {
    items.push({
      key: 'matches',
      label: 'Las contraseñas coinciden',
      met: criteria.matches && Boolean(confirmPassword)
    });
  }

  return (
    <div className="password-criteria-box" aria-live="polite">
      <div className="password-criteria-header">
        <span className="password-criteria-title">Seguridad de la contraseña</span>
        <span className="password-criteria-status" style={{ color: strengthColor }}>
          {password.length > 0 ? strengthLabel : 'Requerido'}
        </span>
      </div>

      <div className="password-meter" aria-hidden="true">
        <div
          className="password-meter-fill"
          style={{ width: `${password.length > 0 ? percent : 0}%`, backgroundColor: strengthColor }}
        />
      </div>

      <ul className="password-criteria-list" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {items.map(item => (
          <li key={item.key} className={`password-criteria-item ${item.met ? 'met' : 'unmet'}`}>
            <span className="password-criteria-icon" aria-hidden="true">
              {item.met ? <Check size={14} color="#059669" strokeWidth={3} /> : <X size={14} color="#94a3b8" strokeWidth={2} />}
            </span>
            <span>{item.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
