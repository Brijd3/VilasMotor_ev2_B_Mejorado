import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateStatus, predictMaintenanceDate } from '../shared/status.mjs';

test('Estado verde cuando hay margen suficiente', () => assert.equal(calculateStatus(700, 1000), 'verde'));
test('Estado amarillo dentro de 100 horas', () => assert.equal(calculateStatus(950, 1000), 'amarillo'));
test('En el límite exacto ya está vencido', () => assert.equal(calculateStatus(1000, 1000), 'rojo'));
test('Lectura superior al mantenimiento es crítica', () => assert.equal(calculateStatus(1001, 1000), 'rojo'));
test('Si el próximo mantenimiento no está definido, se señala riesgo', () => assert.equal(calculateStatus(1000, null), 'rojo'));
test('Proyección 80 horas con supuesto 8 horas/día', () => assert.equal(predictMaintenanceDate(920, 1000, '2026-10-01T00:00:00Z'), '11-10-2026'));
test('Sin proyección cuando el plazo ha vencido', () => assert.equal(predictMaintenanceDate(1010, 1000, '2026-10-01'), 'Vencido'));
