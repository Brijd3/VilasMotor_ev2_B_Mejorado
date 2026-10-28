// Unidad visual orientativa según los tipos de equipo registrados.
// No modifica el valor ni el cálculo del mantenimiento.
export const getReadingUnit = (equipment) => {
  const type = String(equipment?.tipo || '').trim().toUpperCase();
  return ['CAMIONETA', 'CAMION PLUMA', 'CAMIÓN PLUMA', 'CAMION', 'CAMIÓN'].includes(type) ? 'km' : 'h';
};

export const getReadingLabel = (equipment) => getReadingUnit(equipment) === 'km' ? 'Kilometraje' : 'Horómetro';
