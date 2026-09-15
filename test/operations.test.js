const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateLateFees } = require('../src/services/inadimplencia.service');
const { repasseItemTotals, summarizeRepasse } = require('../src/services/repasse.service');
const { calculateAdjustedRent } = require('../src/services/reajuste.service');

test('calcula dias de atraso, multa e juros proporcionais', () => {
  const result = calculateLateFees(
    { valor: 1000, vencimento: '2026-09-01', valor_pago: 0 },
    { cobrar_multa: true, cobrar_juros: true },
    { multa_percentual: 2, juros_mensal_percentual: 1 },
    '2026-09-16'
  );
  assert.equal(result.dias_atraso, 15);
  assert.equal(result.multa, 20);
  assert.equal(result.juros, 5);
  assert.equal(result.saldo_atualizado, 1025);
});

test('parcela parcialmente paga calcula saldo atualizado restante', () => {
  const result = calculateLateFees(
    { valor: 1000, vencimento: '2026-09-01', valor_pago: 400 },
    { cobrar_multa: true, cobrar_juros: false },
    { multa_percentual: 2, juros_mensal_percentual: 1 },
    '2026-09-06'
  );
  assert.equal(result.saldo_atualizado, 620);
});

test('calcula item de repasse respeitando taxas contratuais', () => {
  const item = repasseItemTotals({ valor_pago: 1000, valor: 1000, taxa_administracao: 10, taxa_intermediacao: 0, taxa_minima: 0 });
  assert.equal(item.recebido, 1000);
  assert.equal(item.taxa_administracao, 100);
  assert.equal(item.liquido, 900);
});

test('sumariza repasse com despesas descontadas uma vez', () => {
  const total = summarizeRepasse(
    [{ valor_pago: 1000, valor: 1000, taxa_administracao: 10 }],
    [{ valor: 120 }]
  );
  assert.equal(total.recebido, 1000);
  assert.equal(total.despesas, 120);
  assert.equal(total.liquido, 780);
});

test('reajuste calcula novo aluguel', () => {
  assert.equal(calculateAdjustedRent(1500, 4.82), 1572.3);
});
