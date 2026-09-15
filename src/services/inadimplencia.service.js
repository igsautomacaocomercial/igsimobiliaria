function daysBetween(dateValue, referenceValue = new Date()) {
  const start = new Date(`${String(dateValue).slice(0, 10)}T00:00:00Z`);
  const end = new Date(`${new Date(referenceValue).toISOString().slice(0, 10)}T00:00:00Z`);
  return Math.max(Math.floor((end - start) / 86400000), 0);
}

function delinquencyBucket(days) {
  if (days <= 5) return '1 a 5 dias';
  if (days <= 15) return '6 a 15 dias';
  if (days <= 30) return '16 a 30 dias';
  if (days <= 60) return '31 a 60 dias';
  return 'acima de 60 dias';
}

function calculateLateFees(parcela, contrato = {}, configuracao = {}, dataReferencia = new Date()) {
  const totalOriginal = Number(parcela.valor || 0)
    + Number(parcela.iptu_valor || 0)
    + Number(parcela.condominio_valor || 0)
    - Number(parcela.desconto || 0);
  const diasAtraso = parcela.vencimento ? daysBetween(parcela.vencimento, dataReferencia) : 0;
  const cobrarMulta = contrato.cobrar_multa !== false;
  const cobrarJuros = contrato.cobrar_juros !== false;
  const multaPercentual = Number(configuracao.multa_percentual || 0);
  const jurosMensalPercentual = Number(configuracao.juros_mensal_percentual || 0);
  const multa = diasAtraso > 0 && cobrarMulta ? totalOriginal * (multaPercentual / 100) : 0;
  const juros = diasAtraso > 0 && cobrarJuros ? totalOriginal * ((jurosMensalPercentual / 100) / 30) * diasAtraso : 0;
  const saldoAtualizado = Math.max(totalOriginal + multa + juros - Number(parcela.valor_pago || 0), 0);
  return {
    dias_atraso: diasAtraso,
    multa: Math.round(multa * 100) / 100,
    juros: Math.round(juros * 100) / 100,
    saldo_atualizado: Math.round(saldoAtualizado * 100) / 100,
    situacao: delinquencyBucket(diasAtraso),
  };
}

function whatsappLink(phone, message) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return null;
  const withCountry = digits.startsWith('55') ? digits : `55${digits}`;
  return `https://wa.me/${withCountry}?text=${encodeURIComponent(message)}`;
}

function renderChargeMessage(template, data) {
  return String(template || '')
    .replaceAll('[NOME]', data.nome || '')
    .replaceAll('[CONTRATO]', data.contrato || '')
    .replaceAll('[IMOVEL]', data.imovel || '')
    .replaceAll('[DATA]', data.data || '')
    .replaceAll('[VALOR]', data.valor || '')
    .replaceAll('[NOME_IMOBILIARIA]', data.imobiliaria || '');
}

module.exports = {
  daysBetween,
  delinquencyBucket,
  calculateLateFees,
  whatsappLink,
  renderChargeMessage,
};
