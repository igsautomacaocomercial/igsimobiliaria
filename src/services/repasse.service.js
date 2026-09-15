function repasseItemTotals(row) {
  const recebido = Number(row.valor_pago || 0);
  const multa = row.repassar_multa ? Number(row.multa || 0) : 0;
  const juros = row.repassar_juros ? Number(row.juros || 0) : 0;
  const iptu = row.repassar_iptu ? Number(row.iptu_valor || 0) : 0;
  const taxaAdm = Math.max((Number(row.valor || 0) * Number(row.taxa_administracao || 0)) / 100, Number(row.taxa_minima || 0));
  const taxaIntermediacao = (Number(row.valor || 0) * Number(row.taxa_intermediacao || 0)) / 100;
  const bruto = recebido + multa + juros + iptu;
  const liquido = Math.max(bruto - taxaAdm - taxaIntermediacao, 0);
  return {
    recebido,
    multa,
    juros,
    iptu,
    taxa_administracao: Math.round(taxaAdm * 100) / 100,
    taxa_intermediacao: Math.round(taxaIntermediacao * 100) / 100,
    bruto: Math.round(bruto * 100) / 100,
    liquido: Math.round(liquido * 100) / 100,
  };
}

function summarizeRepasse(items, despesas = []) {
  const totals = items.reduce((acc, item) => {
    const t = repasseItemTotals(item);
    acc.recebido += t.recebido;
    acc.taxa += t.taxa_administracao + t.taxa_intermediacao;
    acc.bruto += t.bruto;
    acc.liquido += t.liquido;
    return acc;
  }, { recebido: 0, taxa: 0, bruto: 0, liquido: 0 });
  const despesasTotal = despesas.reduce((sum, despesa) => sum + Number(despesa.valor || 0), 0);
  return {
    recebido: Math.round(totals.recebido * 100) / 100,
    taxa: Math.round(totals.taxa * 100) / 100,
    despesas: Math.round(despesasTotal * 100) / 100,
    bruto: Math.round(totals.bruto * 100) / 100,
    liquido: Math.round(Math.max(totals.liquido - despesasTotal, 0) * 100) / 100,
  };
}

module.exports = { repasseItemTotals, summarizeRepasse };
