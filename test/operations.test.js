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

test('repasse aluguel puro', () => {
  const item = repasseItemTotals({ valor_pago: 1000, valor: 1000, taxa_administracao: 10, taxa_intermediacao: 0, taxa_minima: 0 });
  assert.equal(item.recebido, 1000);
  assert.equal(item.aluguel, 1000);
  assert.equal(item.taxa_administracao, 100);
  assert.equal(item.liquido, 900);
});

test('repasse aluguel com IPTU nao duplica valor pago', () => {
  const item = repasseItemTotals({ valor_pago: 1100, valor: 1000, iptu_valor: 100, repassar_iptu: true, taxa_administracao: 10 });
  assert.equal(item.recebido, 1100);
  assert.equal(item.iptu, 100);
  assert.equal(item.bruto, 1100);
  assert.equal(item.liquido, 1000);
});

test('repasse aluguel com multa e juros nao duplica componentes ja pagos', () => {
  const item = repasseItemTotals({ valor_pago: 1125, valor: 1000, iptu_valor: 100, multa: 20, juros: 5, repassar_iptu: true, repassar_multa: true, repassar_juros: true, taxa_administracao: 10 });
  assert.equal(item.recebido, 1125);
  assert.equal(item.bruto, 1125);
  assert.equal(item.liquido, 1025);
});

test('repasse pagamento parcial rateia componentes proporcionalmente', () => {
  const item = repasseItemTotals({ valor_pago: 550, valor: 1000, iptu_valor: 100, repassar_iptu: true, taxa_administracao: 10 });
  assert.equal(item.recebido, 550);
  assert.equal(item.aluguel, 500);
  assert.equal(item.iptu, 50);
  assert.equal(item.liquido, 500);
});

test('repasse pagamento total com desconto respeita recebido', () => {
  const item = repasseItemTotals({ valor_pago: 950, valor: 1000, desconto: 50, taxa_administracao: 10 });
  assert.equal(item.recebido, 950);
  assert.equal(item.desconto, 50);
  assert.equal(item.bruto, 950);
  assert.equal(item.liquido, 855);
});

test('repasse nao repassa multa quando flag e falsa', () => {
  const item = repasseItemTotals({ valor_pago: 1020, valor: 1000, multa: 20, repassar_multa: false, taxa_administracao: 0 });
  assert.equal(item.multa, 0);
  assert.equal(item.bruto, 1000);
});

test('repasse nao repassa juros quando flag e falsa', () => {
  const item = repasseItemTotals({ valor_pago: 1005, valor: 1000, juros: 5, repassar_juros: false, taxa_administracao: 0 });
  assert.equal(item.juros, 0);
  assert.equal(item.bruto, 1000);
});

test('repasse nao repassa IPTU quando flag e falsa', () => {
  const item = repasseItemTotals({ valor_pago: 1100, valor: 1000, iptu_valor: 100, repassar_iptu: false, taxa_administracao: 0 });
  assert.equal(item.iptu, 0);
  assert.equal(item.bruto, 1000);
});

test('repasse liquido nunca ultrapassa valor recebido', () => {
  const item = repasseItemTotals({ valor_pago: 1125, valor: 1000, iptu_valor: 100, multa: 20, juros: 5, repassar_iptu: true, repassar_multa: true, repassar_juros: true, taxa_administracao: 0 });
  assert.equal(item.liquido <= item.recebido, true);
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
