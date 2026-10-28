export function checkPasswordCriteria(password = '', confirmPassword) {
  const criteria = {
    minLength: password.length >= 12,
    hasUpper: /[A-Z]/.test(password),
    hasLower: /[a-z]/.test(password),
    hasNumber: /[0-9]/.test(password),
    hasSpecial: /[^A-Za-z0-9]/.test(password),
    matches: confirmPassword !== undefined ? (password.length > 0 && password === confirmPassword) : true
  };

  let score = 0;
  if (criteria.minLength) score += 1;
  if (criteria.hasUpper) score += 1;
  if (criteria.hasLower) score += 1;
  if (criteria.hasNumber) score += 1;
  if (criteria.hasSpecial) score += 1;

  let strengthLabel = 'Incompleta';
  let strengthColor = '#ef4444'; // red
  if (score === 5) {
    strengthLabel = 'Excelente';
    strengthColor = '#10b981'; // green
  } else if (score >= 4) {
    strengthLabel = 'Segura';
    strengthColor = '#10b981';
  } else if (score >= 3) {
    strengthLabel = 'Media';
    strengthColor = '#f59e0b'; // amber
  } else if (score >= 1) {
    strengthLabel = 'Débil';
    strengthColor = '#ef4444';
  }

  const allMet = criteria.minLength && criteria.hasUpper && criteria.hasLower &&
    criteria.hasNumber && criteria.hasSpecial && (confirmPassword === undefined || criteria.matches);

  return { criteria, score, strengthLabel, strengthColor, allMet };
}
