/** Estados de mantenimiento según horas/km pendientes. Umbral configurable por futuras políticas. */
export function calculateStatus(current, next, warningThreshold = 100) {
  const value = Number(current);
  const deadline = Number(next);
  if (!Number.isFinite(value) || !Number.isFinite(deadline) || deadline <= 0) return 'rojo';
  const remaining = deadline - value;
  if (remaining <= 0) return 'rojo';
  if (remaining <= warningThreshold) return 'amarillo';
  return 'verde';
}

/** Proyección orientativa (no IA ni telemetría): horas restantes / horas supuestas por día. */
export function predictMaintenanceDate(current, next, dateOfRecord, hoursPerDay = 8) {
  const remaining = Number(next) - Number(current);
  if (!Number.isFinite(remaining) || remaining <= 0) return 'Vencido';
  if (!Number.isFinite(hoursPerDay) || hoursPerDay <= 0) return 'Sin estimación';
  const date = new Date(dateOfRecord);
  if (Number.isNaN(date.getTime())) return 'Sin estimación';
  date.setUTCDate(date.getUTCDate() + Math.ceil(remaining / hoursPerDay));
  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${day}-${month}-${date.getUTCFullYear()}`;
}
