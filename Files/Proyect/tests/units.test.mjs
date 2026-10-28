import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getReadingUnit, getReadingLabel } from '../src/utils/readingUnits.js';

test('Camionetas: kilometraje y km', () => {
  assert.equal(getReadingUnit({ tipo: 'CAMIONETA' }), 'km');
  assert.equal(getReadingLabel({ tipo: 'camioneta' }), 'Kilometraje');
  assert.equal(getReadingUnit({ tipo: 'CAMIÓN PLUMA' }), 'km');
});
test('Maquinaria: horómetro y horas', () => {
  assert.equal(getReadingUnit({ tipo: 'GRUA HORQUILLA' }), 'h');
  assert.equal(getReadingUnit({ tipo: 'GRUPO ELECTROGENO' }), 'h');
  assert.equal(getReadingLabel({ tipo: 'GRUPO ELECTROGENO' }), 'Horómetro');
});
