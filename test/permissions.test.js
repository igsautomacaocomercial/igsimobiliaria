const test = require('node:test');
const assert = require('node:assert/strict');
const { can, normalizeRole } = require('../src/middleware/permissions');

test('ADMIN has full access', () => {
  assert.equal(can({ perfil: 'ADMIN' }, 'parcelas.write'), true);
  assert.equal(can({ perfil: 'ADMIN' }, 'admin.write'), true);
});

test('CONSULTA cannot write financial records', () => {
  assert.equal(can({ perfil: 'CONSULTA' }, 'parcelas.write'), false);
  assert.equal(can({ perfil: 'CONSULTA' }, 'parcelas.read'), true);
});

test('FINANCEIRO can manage payments', () => {
  assert.equal(can({ perfil: 'FINANCEIRO' }, 'parcelas.write'), true);
  assert.equal(can({ perfil: 'FINANCEIRO' }, 'leads.write'), false);
});

test('roles are normalized to uppercase', () => {
  assert.equal(normalizeRole('financeiro'), 'FINANCEIRO');
  assert.equal(normalizeRole(null), 'CONSULTA');
});
