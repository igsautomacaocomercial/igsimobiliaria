function calculateAdjustedRent(valorAtual, percentual) {
  const value = Number(valorAtual || 0) * (1 + Number(percentual || 0) / 100);
  return Math.round(value * 100) / 100;
}

function addMonthsIso(dateValue, months) {
  const base = new Date(`${String(dateValue).slice(0, 10)}T00:00:00Z`);
  base.setUTCMonth(base.getUTCMonth() + months);
  return base.toISOString().slice(0, 10);
}

module.exports = { calculateAdjustedRent, addMonthsIso };
