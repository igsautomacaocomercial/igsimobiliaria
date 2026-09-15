function repasseItemTotals(row) {
  const aluguelFatura = Number(row.valor || 0);
  const iptuFatura = Number(row.iptu_valor || 0);
  const condominioFatura = Number(row.condominio_valor || 0);
  const multaFatura = Number(row.multa || 0);
  const jurosFatura = Number(row.juros || 0);
  const descontoFatura = Number(row.desconto || 0);
  const totalFatura = Math.max(aluguelFatura + iptuFatura + condominioFatura + multaFatura + jurosFatura - descontoFatura, 0);
  const recebido = Math.min(Number(row.valor_pago || 0), totalFatura || Number(row.valor_pago || 0));
  const ratio = totalFatura > 0 ? recebido / totalFatura : 0;

  const aluguelRecebido = aluguelFatura * ratio;
  const iptuRecebido = iptuFatura * ratio;
  const condominioRecebido = condominioFatura * ratio;
  const multaRecebida = multaFatura * ratio;
  const jurosRecebido = jurosFatura * ratio;
  const descontoRateado = descontoFatura * ratio;

  const aluguelBase = Math.max(aluguelRecebido - descontoRateado, 0);
  const iptu = row.repassar_iptu ? iptuRecebido : 0;
  const multa = row.repassar_multa ? multaRecebida : 0;
  const juros = row.repassar_juros ? jurosRecebido : 0;
  const condominio = condominioRecebido;
  const repassavelAntesTaxas = Math.min(aluguelBase + iptu + condominio + multa + juros, recebido);

  const taxaBase = Math.min(aluguelBase, recebido);
  const taxaAdmCalculada = (taxaBase * Number(row.taxa_administracao || 0)) / 100;
  const taxaAdm = taxaBase > 0 ? Math.min(Math.max(taxaAdmCalculada, Number(row.taxa_minima || 0)), taxaBase) : 0;
  const taxaIntermediacao = Math.min((taxaBase * Number(row.taxa_intermediacao || 0)) / 100, Math.max(taxaBase - taxaAdm, 0));
  const bruto = repassavelAntesTaxas;
  const liquido = Math.min(Math.max(bruto - taxaAdm - taxaIntermediacao, 0), recebido);
  return {
    recebido: round(recebido),
    aluguel: round(aluguelBase),
    multa,
    juros,
    iptu,
    condominio: round(condominio),
    desconto: round(descontoRateado),
    taxa_administracao: round(taxaAdm),
    taxa_intermediacao: round(taxaIntermediacao),
    bruto: round(bruto),
    liquido: round(liquido),
  };
}

function round(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function summarizeRepasse(items, despesas = []) {
  const totals = items.reduce((acc, item) => {
    const t = repasseItemTotals(item);
    acc.recebido += t.recebido;
    acc.aluguel += t.aluguel;
    acc.iptu += t.iptu;
    acc.condominio += t.condominio;
    acc.multa += t.multa;
    acc.juros += t.juros;
    acc.desconto += t.desconto;
    acc.taxa += t.taxa_administracao + t.taxa_intermediacao;
    acc.bruto += t.bruto;
    acc.liquido += t.liquido;
    return acc;
  }, { recebido: 0, aluguel: 0, iptu: 0, condominio: 0, multa: 0, juros: 0, desconto: 0, taxa: 0, bruto: 0, liquido: 0 });
  const despesasTotal = despesas.reduce((sum, despesa) => sum + Number(despesa.valor || 0), 0);
  const liquido = Math.max(totals.liquido - despesasTotal, 0);
  return {
    recebido: round(totals.recebido),
    aluguel: round(totals.aluguel),
    iptu: round(totals.iptu),
    condominio: round(totals.condominio),
    multa: round(totals.multa),
    juros: round(totals.juros),
    desconto: round(totals.desconto),
    taxa: round(totals.taxa),
    despesas: round(despesasTotal),
    bruto: round(totals.bruto),
    liquido: round(Math.min(liquido, totals.recebido)),
  };
}

module.exports = { repasseItemTotals, summarizeRepasse };
