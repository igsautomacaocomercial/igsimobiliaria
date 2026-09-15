async function recordContractEvent(db, { contratoId, tipo, descricao, before = null, after = null, usuarioId = null }) {
  await db.query(
    `INSERT INTO contrato_eventos (contrato_id, tipo, descricao, dados_anteriores, dados_novos, usuario_id)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [contratoId, tipo, descricao || null, before, after, usuarioId]
  );
}

module.exports = { recordContractEvent };
