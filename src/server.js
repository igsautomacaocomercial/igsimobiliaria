require('dotenv').config();

const path = require('path');
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const compression = require('compression');
const bcrypt = require('bcryptjs');
const { initDatabase, query, pool } = require('./db');

const app = express();
const port = Number(process.env.PORT || 3000);

app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(express.json({ limit: '2mb' }));
app.use(
  session({
    name: 'igs.sid',
    secret: process.env.SESSION_SECRET || 'igs-imob-pro-dev-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      maxAge: 1000 * 60 * 60 * 8,
    },
  })
);

app.use(express.static(path.join(__dirname, '..', 'public')));

function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Sessao expirada. Faca login novamente.' });
  }
  next();
}

function pick(body, fields) {
  return Object.fromEntries(fields.map((field) => [field, body[field] ?? null]));
}

function checkbox(value) {
  return value === true || value === 'true' || value === 'on' || value === '1';
}

function compactAddress(data) {
  return [data.logradouro || data.endereco, data.numero, data.complemento, data.bairro, data.cidade, data.uf]
    .filter(Boolean)
    .join(', ');
}

function normalizeEmpty(data) {
  for (const key of Object.keys(data)) {
    if (data[key] === '') data[key] = null;
  }
  return data;
}

function addMonthsIso(dateValue, months) {
  const base = new Date(`${dateValue}T00:00:00Z`);
  base.setUTCMonth(base.getUTCMonth() + months);
  return base.toISOString().slice(0, 10);
}

async function fillContractRentFromProperty(data) {
  const needsRent = data.imovel_id && (data.valor_aluguel === null || data.valor_aluguel === undefined);
  if (!needsRent) return data;

  const result = await query('SELECT valor_aluguel FROM imoveis WHERE id = $1', [data.imovel_id]);
  const imovel = result.rows[0];
  if (!imovel || imovel.valor_aluguel === null || imovel.valor_aluguel === undefined) {
    throw new Error('Imovel selecionado nao possui valor de aluguel cadastrado.');
  }

  data.valor_aluguel = imovel.valor_aluguel;
  return data;
}

async function syncImovelStatusFromContracts(imovelId) {
  if (!imovelId) return;

  const imovelResult = await query('SELECT status FROM imoveis WHERE id = $1', [imovelId]);
  const imovel = imovelResult.rows[0];
  if (!imovel) return;

  const activeContracts = await query(
    "SELECT COUNT(*)::int total FROM contratos_locacao WHERE imovel_id = $1 AND status = 'ativo'",
    [imovelId]
  );

  if (activeContracts.rows[0].total > 0) {
    if (imovel.status !== 'alugado') {
      await query("UPDATE imoveis SET status = 'alugado' WHERE id = $1", [imovelId]);
    }
    return;
  }

  if (imovel.status === 'alugado') {
    await query("UPDATE imoveis SET status = 'disponivel' WHERE id = $1", [imovelId]);
  }
}

async function syncAllImovelStatuses() {
  await query(`
    UPDATE imoveis i
    SET status = 'alugado'
    WHERE EXISTS (
      SELECT 1 FROM contratos_locacao c
      WHERE c.imovel_id = i.id AND c.status = 'ativo'
    )
  `);

  await query(`
    UPDATE imoveis i
    SET status = 'disponivel'
    WHERE i.status = 'alugado'
      AND NOT EXISTS (
        SELECT 1 FROM contratos_locacao c
        WHERE c.imovel_id = i.id AND c.status = 'ativo'
      )
  `);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  }[char]));
}

function brl(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function invoiceTotal(row) {
  return Number(row.valor || 0)
    + Number(row.iptu_valor || 0)
    + Number(row.condominio_valor || 0)
    + Number(row.multa || 0)
    + Number(row.juros || 0)
    - Number(row.desconto || 0);
}

function invoiceBalance(row) {
  return Math.max(invoiceTotal(row) - Number(row.valor_pago || 0), 0);
}

const paymentMethods = {
  dinheiro: 'Dinheiro',
  pix: 'Pix',
  cartao: 'Cartao',
  deposito: 'Deposito',
  cheque: 'Cheque',
};

function paymentMethod(value) {
  return paymentMethods[value] ? value : 'dinheiro';
}

function paymentLabel(value) {
  return paymentMethods[value] || paymentMethods.dinheiro;
}

function brDate(value) {
  if (!value) return '';
  return new Date(value).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}

async function recordParcelPayment(req, parcelaId, valor, formaPagamento, pagoEm, observacao) {
  if (!Number.isFinite(Number(valor)) || Number(valor) <= 0) return;
  await query(
    `INSERT INTO pagamentos_parcela (parcela_id, valor, forma_pagamento, pago_em, observacao, usuario_id)
     VALUES ($1, $2, $3, COALESCE($4::date, CURRENT_DATE), $5, $6)`,
    [parcelaId, valor, paymentMethod(formaPagamento), pagoEm || null, observacao || null, req.session.user?.id || null]
  );
}

const codeConfig = {
  pessoas: { table: 'pessoas', sequence: 'pessoa_codigo_seq' },
  imoveis: { table: 'imoveis', sequence: 'imovel_codigo_seq' },
  contratos: { table: 'contratos_locacao', sequence: 'contrato_codigo_seq' },
};

async function nextSequentialCode(resourceName) {
  const config = codeConfig[resourceName];
  if (!config) return null;
  const result = await query(`
    WITH atual AS (
      SELECT COALESCE(MAX(NULLIF(regexp_replace(codigo, '\\D', '', 'g'), '')::int), 0) maior
      FROM ${config.table}
    ), proximo AS (
      SELECT nextval('${config.sequence}')::int valor
    )
    SELECT LPAD((GREATEST(atual.maior + 1, proximo.valor))::text, 6, '0') codigo
    FROM atual, proximo
  `);
  return result.rows[0].codigo;
}

async function logAction(req, acao, entidade, entidadeId, detalhes = {}) {
  if (!req.session.user) return;
  await query(
    'INSERT INTO logs_sistema (usuario_id, acao, entidade, entidade_id, detalhes) VALUES ($1, $2, $3, $4, $5)',
    [req.session.user.id, acao, entidade, entidadeId || null, detalhes]
  );
}

app.post('/api/auth/login', async (req, res) => {
  const { email, senha } = req.body;
  const result = await query('SELECT * FROM usuarios WHERE email = $1 AND ativo = TRUE', [email]);
  const user = result.rows[0];

  if (!user || !(await bcrypt.compare(senha || '', user.senha_hash))) {
    return res.status(401).json({ error: 'E-mail ou senha invalidos.' });
  }

  req.session.user = {
    id: user.id,
    nome: user.nome,
    email: user.email,
    perfil: user.perfil,
  };
  await logAction(req, 'login', 'usuarios', user.id);
  res.json({ user: req.session.user });
});

app.post('/api/auth/logout', requireAuth, async (req, res) => {
  const userId = req.session.user.id;
  await logAction(req, 'logout', 'usuarios', userId);
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/auth/me', (req, res) => {
  res.json({ user: req.session.user || null });
});

app.get('/api/dashboard', requireAuth, async (_req, res) => {
  const [
    imoveis,
    contratosVencendo,
    alugueisAtraso,
    alugueisVencendoHoje,
    alugueisVencendo7,
    contasPagar,
    contasPagarAtraso,
    contasReceber,
    contasReceberAtraso,
    mensal,
    funil,
    alertas,
    imoveisSemProprietario,
    imoveisSemValor,
    chavesAbertas,
  ] = await Promise.all([
    query("SELECT status, COUNT(*)::int total FROM imoveis GROUP BY status"),
    query("SELECT COUNT(*)::int total FROM contratos_locacao WHERE status = 'ativo' AND fim BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '60 days'"),
    query("SELECT COUNT(*)::int total, COALESCE(SUM(valor + COALESCE(iptu_valor,0) + COALESCE(condominio_valor,0) + multa + juros - desconto - COALESCE(valor_pago,0)), 0)::numeric total_valor FROM parcelas_aluguel WHERE status <> 'paga' AND vencimento < CURRENT_DATE"),
    query("SELECT COUNT(*)::int total, COALESCE(SUM(valor + COALESCE(iptu_valor,0) + COALESCE(condominio_valor,0) + multa + juros - desconto - COALESCE(valor_pago,0)), 0)::numeric total_valor FROM parcelas_aluguel WHERE status <> 'paga' AND vencimento = CURRENT_DATE"),
    query("SELECT COUNT(*)::int total, COALESCE(SUM(valor + COALESCE(iptu_valor,0) + COALESCE(condominio_valor,0) + multa + juros - desconto - COALESCE(valor_pago,0)), 0)::numeric total_valor FROM parcelas_aluguel WHERE status <> 'paga' AND vencimento BETWEEN CURRENT_DATE + INTERVAL '1 day' AND CURRENT_DATE + INTERVAL '7 days'"),
    query("SELECT COUNT(*)::int total, COALESCE(SUM(valor), 0)::numeric total_valor FROM contas_pagar WHERE status <> 'paga'"),
    query("SELECT COUNT(*)::int total, COALESCE(SUM(valor), 0)::numeric total_valor FROM contas_pagar WHERE status <> 'paga' AND vencimento < CURRENT_DATE"),
    query("SELECT COUNT(*)::int total, COALESCE(SUM(valor), 0)::numeric total_valor FROM contas_receber WHERE status <> 'recebida'"),
    query("SELECT COUNT(*)::int total, COALESCE(SUM(valor), 0)::numeric total_valor FROM contas_receber WHERE status <> 'recebida' AND vencimento < CURRENT_DATE"),
    query(`
      SELECT to_char(mes, 'YYYY-MM') mes,
        COALESCE(recebimentos, 0)::numeric recebimentos,
        COALESCE(despesas, 0)::numeric despesas
      FROM generate_series(date_trunc('month', CURRENT_DATE) - INTERVAL '5 months', date_trunc('month', CURRENT_DATE), INTERVAL '1 month') mes
      LEFT JOIN (
        SELECT date_trunc('month', COALESCE(recebido_em, vencimento)) mes_ref, SUM(valor) recebimentos
        FROM contas_receber GROUP BY 1
      ) cr ON cr.mes_ref = mes
      LEFT JOIN (
        SELECT date_trunc('month', COALESCE(pago_em, vencimento)) mes_ref, SUM(valor) despesas
        FROM contas_pagar GROUP BY 1
      ) cp ON cp.mes_ref = mes
      ORDER BY mes
    `),
    query('SELECT etapa, COUNT(*)::int total FROM leads GROUP BY etapa'),
    query(`
      SELECT prioridade, tipo, titulo, vencimento, valor, status FROM (
        SELECT
          CASE
            WHEN p.vencimento < CURRENT_DATE THEN 1
            WHEN p.vencimento = CURRENT_DATE THEN 2
            ELSE 3
          END prioridade,
          'Fatura' tipo,
          COALESCE(c.codigo, '-') || ' - ' || COALESCE(locatario.nome, 'Sem locatario') titulo,
          p.vencimento,
          GREATEST((p.valor + COALESCE(p.iptu_valor,0) + COALESCE(p.condominio_valor,0) + p.multa + p.juros - p.desconto) - COALESCE(p.valor_pago,0), 0)::numeric valor,
          p.status
        FROM parcelas_aluguel p
        JOIN contratos_locacao c ON c.id = p.contrato_id
        LEFT JOIN pessoas locatario ON locatario.id = c.locatario_id
        WHERE p.status <> 'paga' AND p.vencimento <= CURRENT_DATE + INTERVAL '7 days'
        UNION ALL
        SELECT
          CASE
            WHEN cp.vencimento < CURRENT_DATE THEN 1
            WHEN cp.vencimento = CURRENT_DATE THEN 2
            ELSE 3
          END prioridade,
          'Conta a pagar' tipo,
          COALESCE(cp.descricao, 'Conta a pagar') titulo,
          cp.vencimento,
          cp.valor::numeric valor,
          cp.status
        FROM contas_pagar cp
        WHERE cp.status <> 'paga' AND cp.vencimento <= CURRENT_DATE + INTERVAL '7 days'
        UNION ALL
        SELECT
          CASE
            WHEN cr.vencimento < CURRENT_DATE THEN 1
            WHEN cr.vencimento = CURRENT_DATE THEN 2
            ELSE 3
          END prioridade,
          'Conta a receber' tipo,
          COALESCE(cr.descricao, 'Conta a receber') titulo,
          cr.vencimento,
          cr.valor::numeric valor,
          cr.status
        FROM contas_receber cr
        WHERE cr.status <> 'recebida' AND cr.vencimento <= CURRENT_DATE + INTERVAL '7 days'
      ) alertas
      ORDER BY prioridade ASC, vencimento ASC, tipo ASC
      LIMIT 8
    `),
    query('SELECT COUNT(*)::int total FROM imoveis WHERE proprietario_id IS NULL'),
    query("SELECT COUNT(*)::int total FROM imoveis WHERE status IN ('disponivel','analisando','reservado') AND COALESCE(valor_aluguel, 0) = 0 AND COALESCE(valor_venda, 0) = 0"),
    query('SELECT COUNT(*)::int total FROM emprestimos_chaves WHERE devolvida_em IS NULL'),
  ]);

  res.json({
    imoveis: Object.fromEntries(imoveis.rows.map((row) => [row.status, row.total])),
    contratosVencendo: contratosVencendo.rows[0].total,
    alugueisAtraso: alugueisAtraso.rows[0],
    alugueisVencendoHoje: alugueisVencendoHoje.rows[0],
    alugueisVencendo7: alugueisVencendo7.rows[0],
    contasPagar: contasPagar.rows[0],
    contasPagarAtraso: contasPagarAtraso.rows[0],
    contasReceber: contasReceber.rows[0],
    contasReceberAtraso: contasReceberAtraso.rows[0],
    mensal: mensal.rows,
    funil: funil.rows,
    alertas: alertas.rows,
    auditoriaCarteira: {
      imoveisSemProprietario: imoveisSemProprietario.rows[0].total,
      imoveisSemValor: imoveisSemValor.rows[0].total,
      chavesAbertas: chavesAbertas.rows[0].total,
    },
  });
});

app.get('/api/cep/:cep', requireAuth, async (req, res) => {
  const cep = String(req.params.cep || '').replace(/\D/g, '');
  if (cep.length !== 8) return res.status(400).json({ error: 'CEP invalido.' });

  const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
  const data = await response.json();
  if (!response.ok || data.erro) return res.status(404).json({ error: 'CEP nao encontrado.' });

  res.json({
    cep: data.cep,
    logradouro: data.logradouro,
    bairro: data.bairro,
    cidade: data.localidade,
    uf: data.uf,
    complemento: data.complemento,
  });
});

const resources = {
  pessoas: {
    table: 'pessoas',
    fields: ['codigo', 'nome', 'tipo', 'cep', 'pf_pj', 'cpf_cnpj', 'rg_ie', 'email', 'telefone', 'whatsapp', 'endereco', 'nascimento', 'naturalidade', 'nacionalidade', 'estado_civil', 'profissao', 'cargo', 'renda', 'origem_cliente', 'filiacao', 'referencias', 'endereco_correspondencia', 'conjuge_nome', 'conjuge_cpf', 'conjuge_rg', 'conjuge_telefone', 'conjuge_endereco', 'conjuge_nascimento', 'conjuge_nacionalidade', 'conjuge_estado_civil', 'conjuge_profissao', 'observacoes'],
    order: 'criado_em DESC',
  },
  imoveis: {
    table: 'imoveis',
    fields: ['codigo', 'titulo', 'tipo', 'finalidade', 'status', 'proprietario_id', 'cep', 'regiao', 'logradouro', 'endereco', 'numero', 'complemento', 'bairro', 'cidade', 'uf', 'edificio', 'construtora', 'unidade', 'valor_aluguel', 'valor_venda', 'condominio', 'iptu', 'quartos', 'suites', 'salas', 'banheiros', 'vagas', 'elevadores', 'unidades_andar', 'pavimentos', 'idade', 'area_m2', 'area_terreno_m2', 'posicao', 'agua_instalacao', 'energia_instalacao', 'telefone_instalacao', 'iptu_indice', 'chaves_local', 'detalhes', 'proximidades', 'outras_infos', 'captador_id', 'sindico_id', 'administradora_id', 'disponivel_whatsapp', 'observacoes'],
    order: 'codigo ASC',
  },
  contratos: {
    table: 'contratos_locacao',
    fields: ['codigo', 'imovel_id', 'locador_id', 'locatario_id', 'fiador_id', 'inicio', 'fim', 'prazo_indeterminado', 'valor_aluguel', 'vencimento_dia', 'dia_repasse', 'indice_reajuste', 'proximo_reajuste', 'data_aditivo', 'proximo_aditivo', 'data_rescisao', 'taxa_administracao', 'taxa_intermediacao', 'taxa_minima', 'aluguel_garantido', 'cobrar_multa', 'repassar_multa', 'cobrar_juros', 'repassar_juros', 'cobrar_iptu', 'repassar_iptu', 'descontar_irrf', 'cobranca_eletronica', 'destino', 'responsavel', 'garantia', 'status', 'observacoes'],
    order: 'criado_em DESC',
  },
  contas_receber: {
    table: 'contas_receber',
    fields: ['descricao', 'categoria', 'pessoa_id', 'imovel_id', 'vencimento', 'valor', 'recebido_em', 'status'],
    order: 'vencimento ASC',
  },
  contas_pagar: {
    table: 'contas_pagar',
    fields: ['descricao', 'categoria', 'imovel_id', 'fornecedor_id', 'vencimento', 'valor', 'pago_em', 'status'],
    order: 'vencimento ASC',
  },
  leads: {
    table: 'leads',
    fields: ['nome', 'telefone', 'email', 'interesse', 'etapa', 'origem', 'imovel_id', 'corretor_id', 'observacoes'],
    order: 'criado_em DESC',
  },
  chaves: {
    table: 'emprestimos_chaves',
    fields: ['interessado_nome', 'contato', 'documento', 'imovel_id', 'hora_retirada', 'previsao_devolucao', 'devolvida_em', 'observacoes'],
    order: 'criado_em DESC',
  },
};

for (const [name, config] of Object.entries(resources)) {
  app.get(`/api/${name}`, requireAuth, async (_req, res) => {
    const sql = name === 'pessoas'
      ? `SELECT p.*,
          COALESCE(string_agg(f.nome, ', ' ORDER BY f.nome) FILTER (WHERE f.id IS NOT NULL), '') fiadores_nomes
         FROM pessoas p
         LEFT JOIN pessoa_fiadores pf ON pf.locatario_id = p.id
         LEFT JOIN pessoas f ON f.id = pf.fiador_id
         GROUP BY p.id
         ORDER BY p.${config.order}`
      : `SELECT * FROM ${config.table} ORDER BY ${config.order}`;
    const result = await query(sql);
    res.json(result.rows);
  });

  app.post(`/api/${name}`, requireAuth, async (req, res) => {
    const data = normalizeEmpty(pick(req.body, config.fields));
    if (codeConfig[name]) data.codigo = await nextSequentialCode(name);
    try {
      if (config.table === 'contratos_locacao') await fillContractRentFromProperty(data);
      for (const field of ['disponivel_whatsapp', 'prazo_indeterminado', 'aluguel_garantido', 'cobrar_multa', 'repassar_multa', 'cobrar_juros', 'repassar_juros', 'cobrar_iptu', 'repassar_iptu', 'descontar_irrf', 'cobranca_eletronica']) {
        if (field in data) data[field] = checkbox(data[field]);
      }
      if (config.table === 'imoveis' && !data.endereco) data.endereco = compactAddress(data) || data.titulo || 'Endereco nao informado';
      const fields = Object.keys(data);
      const values = Object.values(data);
      const placeholders = fields.map((_, index) => `$${index + 1}`).join(', ');
      const result = await query(
        `INSERT INTO ${config.table} (${fields.join(', ')}) VALUES (${placeholders}) RETURNING *`,
        values
      );
      if (config.table === 'contratos_locacao') await syncImovelStatusFromContracts(result.rows[0].imovel_id);
      await logAction(req, 'criar', config.table, result.rows[0].id, result.rows[0]);
      res.status(201).json(result.rows[0]);
    } catch (error) {
      console.error(error);
      res.status(400).json({ error: error.detail || error.message || 'Erro ao salvar registro.' });
    }
  });

  app.put(`/api/${name}/:id`, requireAuth, async (req, res) => {
    const data = normalizeEmpty(pick(req.body, config.fields));
    const previous = config.table === 'contratos_locacao'
      ? await query('SELECT imovel_id FROM contratos_locacao WHERE id = $1', [req.params.id])
      : null;
    let result;
    try {
      if (config.table === 'contratos_locacao') await fillContractRentFromProperty(data);
      for (const field of ['disponivel_whatsapp', 'prazo_indeterminado', 'aluguel_garantido', 'cobrar_multa', 'repassar_multa', 'cobrar_juros', 'repassar_juros', 'cobrar_iptu', 'repassar_iptu', 'descontar_irrf', 'cobranca_eletronica']) {
        if (field in data) data[field] = checkbox(data[field]);
      }
      if (config.table === 'imoveis' && !data.endereco) data.endereco = compactAddress(data) || data.titulo || 'Endereco nao informado';
      const fields = Object.keys(data);
      const values = Object.values(data);
      const sets = fields.map((field, index) => `${field} = $${index + 1}`).join(', ');
      result = await query(
        `UPDATE ${config.table} SET ${sets} WHERE id = $${fields.length + 1} RETURNING *`,
        [...values, req.params.id]
      );
    } catch (error) {
      console.error(error);
      return res.status(400).json({ error: error.detail || error.message || 'Erro ao atualizar registro.' });
    }

    if (result.rowCount === 0) return res.status(404).json({ error: 'Registro nao encontrado.' });

    if (config.table === 'contratos_locacao') {
      const oldImovelId = previous?.rows?.[0]?.imovel_id;
      const newImovelId = result.rows[0].imovel_id;
      await syncImovelStatusFromContracts(newImovelId);
      if (oldImovelId && oldImovelId !== newImovelId) await syncImovelStatusFromContracts(oldImovelId);
    }

    await logAction(req, 'atualizar', config.table, result.rows[0].id, result.rows[0]);
    res.json(result.rows[0]);
  });

  app.delete(`/api/${name}/:id`, requireAuth, async (req, res) => {
    const previous = config.table === 'contratos_locacao'
      ? await query('SELECT imovel_id FROM contratos_locacao WHERE id = $1', [req.params.id])
      : null;
    const result = await query(`DELETE FROM ${config.table} WHERE id = $1 RETURNING id`, [req.params.id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Registro nao encontrado.' });
    if (config.table === 'contratos_locacao') await syncImovelStatusFromContracts(previous?.rows?.[0]?.imovel_id);
    await logAction(req, 'excluir', config.table, req.params.id);
    res.json({ ok: true });
  });
}

app.post('/api/pessoas/:id/fiadores', requireAuth, async (req, res) => {
  const locatario = await query('SELECT id, nome FROM pessoas WHERE id = $1', [req.params.id]);
  if (!locatario.rows[0]) return res.status(404).json({ error: 'Locatario nao encontrado.' });

  const data = normalizeEmpty(pick({ ...req.body, tipo: 'fiador' }, resources.pessoas.fields));
  data.tipo = 'fiador';
  data.codigo = await nextSequentialCode('pessoas');
  if (!data.nome) return res.status(400).json({ error: 'Informe o nome do fiador.' });

  try {
    const fields = Object.keys(data);
    const values = Object.values(data);
    const placeholders = fields.map((_, index) => `$${index + 1}`).join(', ');
    const fiador = await query(
      `INSERT INTO pessoas (${fields.join(', ')}) VALUES (${placeholders}) RETURNING *`,
      values
    );
    await query(
      'INSERT INTO pessoa_fiadores (locatario_id, fiador_id, observacoes) VALUES ($1, $2, $3) ON CONFLICT (locatario_id, fiador_id) DO NOTHING',
      [req.params.id, fiador.rows[0].id, req.body.vinculo_observacoes || null]
    );
    await logAction(req, 'vincular_fiador', 'pessoas', req.params.id, { fiador_id: fiador.rows[0].id });
    res.status(201).json(fiador.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(400).json({ error: error.detail || error.message || 'Erro ao cadastrar fiador.' });
  }
});

app.post('/api/contratos/:id/gerar-parcelas', requireAuth, async (req, res) => {
  const contratoResult = await query(`
    SELECT c.*, COALESCE(i.iptu, 0) imovel_iptu, COALESCE(i.condominio, 0) imovel_condominio
    FROM contratos_locacao c
    LEFT JOIN imoveis i ON i.id = c.imovel_id
    WHERE c.id = $1
  `, [req.params.id]);
  const contrato = contratoResult.rows[0];
  if (!contrato) return res.status(404).json({ error: 'Contrato nao encontrado.' });

  const inserted = await query(
    `
      WITH meses AS (
        SELECT generate_series(date_trunc('month', $1::date), date_trunc('month', $2::date), INTERVAL '1 month') competencia
      )
      INSERT INTO parcelas_aluguel (contrato_id, competencia, vencimento, repasse_vencimento, valor, valor_repasse, iptu_valor, condominio_valor, descricao, categoria, recibo_numero)
      SELECT $3,
        competencia::date,
        (competencia + (($4::int - 1) * INTERVAL '1 day'))::date,
        (competencia + (($6::int - 1) * INTERVAL '1 day'))::date,
        $5,
        GREATEST($5 - (($5 * COALESCE($7::numeric, 0)) / 100), 0),
        CASE WHEN $8::boolean THEN COALESCE($9::numeric, 0) ELSE 0 END,
        COALESCE($10::numeric, 0),
        'Aluguel Periodo ' || to_char(competencia, 'DD/MM/YYYY') || ' a ' || to_char(competencia + INTERVAL '1 month' - INTERVAL '1 day', 'DD/MM/YYYY'),
        'ALUGUEL',
        nextval('recibo_numero_seq')
      FROM meses
      WHERE NOT EXISTS (
        SELECT 1 FROM parcelas_aluguel p
        WHERE p.contrato_id = $3 AND p.competencia = meses.competencia::date
      )
      RETURNING *
    `,
    [
      contrato.inicio,
      contrato.fim,
      contrato.id,
      contrato.vencimento_dia,
      contrato.valor_aluguel,
      contrato.dia_repasse || contrato.vencimento_dia,
      contrato.taxa_administracao,
      contrato.cobrar_iptu,
      contrato.imovel_iptu,
      contrato.imovel_condominio,
    ]
  );

  const updated = await query(
    `
      UPDATE parcelas_aluguel p
      SET iptu_valor = CASE WHEN $2::boolean THEN COALESCE($3::numeric, 0) ELSE 0 END,
          condominio_valor = COALESCE($4::numeric, 0),
          valor_repasse = GREATEST(p.valor - ((p.valor * COALESCE($5::numeric, 0)) / 100), 0)
      WHERE p.contrato_id = $1
      RETURNING id
    `,
    [
      contrato.id,
      contrato.cobrar_iptu,
      contrato.imovel_iptu,
      contrato.imovel_condominio,
      contrato.taxa_administracao,
    ]
  );

  await logAction(req, 'gerar_parcelas', 'contratos_locacao', contrato.id, { total: inserted.rowCount, atualizadas: updated.rowCount });
  res.json({ total: inserted.rowCount, atualizadas: updated.rowCount, parcelas: inserted.rows });
});

app.get('/api/parcelas_aluguel', requireAuth, async (_req, res) => {
  const result = await query(`
    SELECT p.*, c.codigo contrato_codigo, i.titulo imovel_titulo, i.codigo imovel_codigo,
      locatario.nome locatario_nome, locador.nome locador_nome,
      (p.valor + COALESCE(p.iptu_valor,0) + COALESCE(p.condominio_valor,0) + p.multa + p.juros - p.desconto) total_fatura,
      GREATEST((p.valor + COALESCE(p.iptu_valor,0) + COALESCE(p.condominio_valor,0) + p.multa + p.juros - p.desconto) - COALESCE(p.valor_pago,0), 0) saldo
    FROM parcelas_aluguel p
    JOIN contratos_locacao c ON c.id = p.contrato_id
    LEFT JOIN imoveis i ON i.id = c.imovel_id
    LEFT JOIN pessoas locatario ON locatario.id = c.locatario_id
    LEFT JOIN pessoas locador ON locador.id = c.locador_id
    ORDER BY p.vencimento ASC
  `);
  res.json(result.rows);
});

app.put('/api/parcelas_aluguel/:id/baixar', requireAuth, async (req, res) => {
  const current = await query(
    `SELECT *,
      (valor + COALESCE(iptu_valor,0) + COALESCE(condominio_valor,0) + multa + juros - desconto) total_fatura,
      GREATEST((valor + COALESCE(iptu_valor,0) + COALESCE(condominio_valor,0) + multa + juros - desconto) - COALESCE(valor_pago,0), 0) saldo
     FROM parcelas_aluguel WHERE id = $1`,
    [req.params.id]
  );
  const parcela = current.rows[0];
  if (!parcela) return res.status(404).json({ error: 'Parcela nao encontrada.' });
  const valorRecebido = invoiceBalance(parcela);
  const forma = paymentMethod(req.body.forma_pagamento);
  const result = await query(
    `UPDATE parcelas_aluguel
     SET status = 'paga',
         pago_em = COALESCE($1::date, CURRENT_DATE),
         ultimo_pagamento_em = COALESCE($1::date, CURRENT_DATE),
         valor_pago = valor + COALESCE(iptu_valor,0) + COALESCE(condominio_valor,0) + multa + juros - desconto,
         recebido_de = COALESCE($2, recebido_de),
         forma_pagamento = $3
     WHERE id = $4 RETURNING *`,
    [req.body.pago_em || null, req.body.recebido_de || null, forma, req.params.id]
  );
  await recordParcelPayment(req, req.params.id, valorRecebido, forma, req.body.pago_em, req.body.observacao);
  await logAction(req, 'baixar_pagamento', 'parcelas_aluguel', req.params.id, { valor: valorRecebido, forma_pagamento: forma });
  res.json(result.rows[0]);
});

app.put('/api/parcelas_aluguel/:id/estornar', requireAuth, async (req, res) => {
  const result = await query(
    "UPDATE parcelas_aluguel SET status = 'aberta', pago_em = NULL, valor_pago = 0, ultimo_pagamento_em = NULL, forma_pagamento = NULL, estornado_em = CURRENT_DATE WHERE id = $1 RETURNING *",
    [req.params.id]
  );
  if (result.rowCount === 0) return res.status(404).json({ error: 'Parcela nao encontrada.' });
  await query('DELETE FROM pagamentos_parcela WHERE parcela_id = $1', [req.params.id]);
  await logAction(req, 'estornar_pagamento', 'parcelas_aluguel', req.params.id);
  res.json(result.rows[0]);
});

app.post('/api/parcelas_aluguel/:id/pagamento-parcial', requireAuth, async (req, res) => {
  const valor = Number(req.body.valor || 0);
  if (!Number.isFinite(valor) || valor <= 0) return res.status(400).json({ error: 'Informe um valor parcial maior que zero.' });
  const current = await query(
    `SELECT *,
      (valor + COALESCE(iptu_valor,0) + COALESCE(condominio_valor,0) + multa + juros - desconto) total_fatura,
      GREATEST((valor + COALESCE(iptu_valor,0) + COALESCE(condominio_valor,0) + multa + juros - desconto) - COALESCE(valor_pago,0), 0) saldo
     FROM parcelas_aluguel WHERE id = $1`,
    [req.params.id]
  );
  const parcela = current.rows[0];
  if (!parcela) return res.status(404).json({ error: 'Parcela nao encontrada.' });
  const aplicado = Math.min(valor, invoiceBalance(parcela));
  if (aplicado <= 0) return res.status(400).json({ error: 'Esta fatura ja esta quitada.' });
  const forma = paymentMethod(req.body.forma_pagamento);

  const result = await query(
    `
      UPDATE parcelas_aluguel
      SET valor_pago = LEAST(
            valor + COALESCE(iptu_valor,0) + COALESCE(condominio_valor,0) + multa + juros - desconto,
            COALESCE(valor_pago,0) + $1::numeric
          ),
          ultimo_pagamento_em = COALESCE($2::date, CURRENT_DATE),
          pago_em = CASE
            WHEN LEAST(valor + COALESCE(iptu_valor,0) + COALESCE(condominio_valor,0) + multa + juros - desconto, COALESCE(valor_pago,0) + $1::numeric)
              >= valor + COALESCE(iptu_valor,0) + COALESCE(condominio_valor,0) + multa + juros - desconto
            THEN COALESCE($2::date, CURRENT_DATE)
            ELSE pago_em
          END,
          status = CASE
            WHEN LEAST(valor + COALESCE(iptu_valor,0) + COALESCE(condominio_valor,0) + multa + juros - desconto, COALESCE(valor_pago,0) + $1::numeric)
              >= valor + COALESCE(iptu_valor,0) + COALESCE(condominio_valor,0) + multa + juros - desconto
            THEN 'paga'
            ELSE 'parcial'
          END,
          forma_pagamento = $5,
          acordo_observacao = COALESCE($3, acordo_observacao)
      WHERE id = $4
      RETURNING *,
        (valor + COALESCE(iptu_valor,0) + COALESCE(condominio_valor,0) + multa + juros - desconto) total_fatura,
        GREATEST((valor + COALESCE(iptu_valor,0) + COALESCE(condominio_valor,0) + multa + juros - desconto) - COALESCE(valor_pago,0), 0) saldo
    `,
    [aplicado, req.body.pago_em || null, req.body.observacao || null, req.params.id, forma]
  );
  await recordParcelPayment(req, req.params.id, aplicado, forma, req.body.pago_em, req.body.observacao);
  await logAction(req, 'pagamento_parcial', 'parcelas_aluguel', req.params.id, { valor: aplicado, forma_pagamento: forma, observacao: req.body.observacao || null });
  res.json(result.rows[0]);
});

app.post('/api/contratos/:id/pagamento-parcial', requireAuth, async (req, res) => {
  let restante = Number(req.body.valor || 0);
  if (!Number.isFinite(restante) || restante <= 0) return res.status(400).json({ error: 'Informe um valor parcial maior que zero.' });
  const forma = paymentMethod(req.body.forma_pagamento);

  const parcelas = await query(
    `
      SELECT *,
        (valor + COALESCE(iptu_valor,0) + COALESCE(condominio_valor,0) + multa + juros - desconto) total_fatura,
        GREATEST((valor + COALESCE(iptu_valor,0) + COALESCE(condominio_valor,0) + multa + juros - desconto) - COALESCE(valor_pago,0), 0) saldo
      FROM parcelas_aluguel
      WHERE contrato_id = $1 AND status <> 'paga'
      ORDER BY vencimento ASC
    `,
    [req.params.id]
  );

  const aplicacoes = [];
  for (const parcela of parcelas.rows) {
    if (restante <= 0) break;
    const saldo = Number(parcela.saldo || 0);
    if (saldo <= 0) continue;
    const aplicado = Math.min(restante, saldo);
    const updated = await query(
      `
        UPDATE parcelas_aluguel
        SET valor_pago = COALESCE(valor_pago,0) + $1::numeric,
            ultimo_pagamento_em = COALESCE($2::date, CURRENT_DATE),
            pago_em = CASE WHEN COALESCE(valor_pago,0) + $1::numeric >= valor + COALESCE(iptu_valor,0) + COALESCE(condominio_valor,0) + multa + juros - desconto THEN COALESCE($2::date, CURRENT_DATE) ELSE pago_em END,
            status = CASE WHEN COALESCE(valor_pago,0) + $1::numeric >= valor + COALESCE(iptu_valor,0) + COALESCE(condominio_valor,0) + multa + juros - desconto THEN 'paga' ELSE 'parcial' END,
            forma_pagamento = $5,
            acordo_observacao = COALESCE($3, acordo_observacao)
        WHERE id = $4
        RETURNING id, valor_pago, status
      `,
      [aplicado, req.body.pago_em || null, req.body.observacao || null, parcela.id, forma]
    );
    await recordParcelPayment(req, parcela.id, aplicado, forma, req.body.pago_em, req.body.observacao);
    restante -= aplicado;
    aplicacoes.push({ parcela_id: parcela.id, aplicado, status: updated.rows[0].status });
  }

  await logAction(req, 'pagamento_parcial_contrato', 'contratos_locacao', req.params.id, { valor: Number(req.body.valor), forma_pagamento: forma, aplicacoes, sobra: restante });
  res.json({ aplicado: Number(req.body.valor) - restante, sobra: restante, aplicacoes });
});

app.post('/api/contratos/:id/fatura-avulsa', requireAuth, async (req, res) => {
  const valor = Number(req.body.valor || 0);
  if (!Number.isFinite(valor) || valor <= 0) return res.status(400).json({ error: 'Informe o valor da fatura avulsa.' });
  const parcelas = Math.max(1, Math.floor(Number(req.body.parcelas || 1)));
  if (!Number.isFinite(parcelas) || parcelas < 1) return res.status(400).json({ error: 'Informe um numero valido de parcelas.' });

  const contratoResult = await query('SELECT * FROM contratos_locacao WHERE id = $1', [req.params.id]);
  const contrato = contratoResult.rows[0];
  if (!contrato) return res.status(404).json({ error: 'Contrato nao encontrado.' });

  const competencia = req.body.competencia || req.body.vencimento || new Date().toISOString().slice(0, 10);
  const vencimento = req.body.vencimento || competencia;
  const categoria = req.body.categoria || 'ACORDO';
  const descricao = req.body.descricao || 'Fatura avulsa';
  const repasse = Number(req.body.valor_repasse || 0);
  const created = [];
  for (let index = 0; index < parcelas; index += 1) {
    const parcelaValor = categoria === 'IPTU'
      ? Math.round((valor / parcelas) * 100) / 100
      : valor;
    const ajusteFinal = categoria === 'IPTU' && index === parcelas - 1
      ? Math.round((valor - (Math.round((valor / parcelas) * 100) / 100) * (parcelas - 1)) * 100) / 100
      : parcelaValor;
    const result = await query(
      `
        INSERT INTO parcelas_aluguel
          (contrato_id, competencia, vencimento, repasse_vencimento, valor, valor_repasse, iptu_valor, condominio_valor, descricao, categoria, recibo_numero, origem, acordo_observacao)
        VALUES
          ($1, $2::date, $3::date, $4::date, $5, $6, $7, $8, $9, $10, nextval('recibo_numero_seq'), 'avulsa', $11)
        RETURNING *
      `,
      [
        contrato.id,
        addMonthsIso(competencia, index),
        addMonthsIso(vencimento, index),
        req.body.repasse_vencimento ? addMonthsIso(req.body.repasse_vencimento, index) : addMonthsIso(vencimento, index),
        categoria === 'IPTU' ? 0 : valor,
        repasse,
        categoria === 'IPTU' ? ajusteFinal : Number(req.body.iptu_valor || 0),
        Number(req.body.condominio_valor || 0),
        parcelas > 1 ? `${descricao} (${index + 1}/${parcelas})` : descricao,
        categoria,
        req.body.observacao || null,
      ]
    );
    created.push(result.rows[0]);
  }

  await logAction(req, 'fatura_avulsa', 'contratos_locacao', contrato.id, { total: created.length, categoria, parcelas });
  res.status(201).json({ total: created.length, parcelas: created });
});

app.put('/api/parcelas_aluguel/:id/repassar', requireAuth, async (req, res) => {
  const result = await query(
    "UPDATE parcelas_aluguel SET repassado_em = COALESCE($1::date, CURRENT_DATE) WHERE id = $2 RETURNING *",
    [req.body.repassado_em || null, req.params.id]
  );
  if (result.rowCount === 0) return res.status(404).json({ error: 'Parcela nao encontrada.' });
  await logAction(req, 'repassar_proprietario', 'parcelas_aluguel', req.params.id);
  res.json(result.rows[0]);
});

app.delete('/api/parcelas_aluguel/:id', requireAuth, async (req, res) => {
  const result = await query('DELETE FROM parcelas_aluguel WHERE id = $1 RETURNING id', [req.params.id]);
  if (result.rowCount === 0) return res.status(404).json({ error: 'Parcela nao encontrada.' });
  await logAction(req, 'excluir', 'parcelas_aluguel', req.params.id);
  res.json({ ok: true });
});

app.get('/api/pontualidade/:contratoId', requireAuth, async (req, res) => {
  const result = await query(`
    SELECT EXTRACT(YEAR FROM competencia)::int ano,
      EXTRACT(MONTH FROM competencia)::int mes,
      vencimento,
      pago_em,
      valor,
      status,
      CASE
        WHEN pago_em IS NULL THEN 'aberta'
        WHEN pago_em <= vencimento THEN 'pontual'
        ELSE 'atrasada'
      END resultado
    FROM parcelas_aluguel
    WHERE contrato_id = $1
    ORDER BY competencia DESC
  `, [req.params.contratoId]);
  res.json(result.rows);
});

function periodParams(req) {
  const hoje = new Date();
  const inicioPadrao = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().slice(0, 10);
  const fimPadrao = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).toISOString().slice(0, 10);
  return [req.query.inicio || inicioPadrao, req.query.fim || fimPadrao];
}

const reportSql = {
  faturas_atraso: {
    title: 'Faturas em atraso nao recebidas',
    sql: `
      SELECT c.codigo contrato, i.codigo imovel_codigo, i.titulo imovel, locatario.nome locatario,
        p.vencimento, p.categoria, p.descricao,
        (p.valor + COALESCE(p.iptu_valor,0) + COALESCE(p.condominio_valor,0) + p.multa + p.juros - p.desconto)::numeric total,
        COALESCE(p.valor_pago,0)::numeric pago,
        GREATEST((p.valor + COALESCE(p.iptu_valor,0) + COALESCE(p.condominio_valor,0) + p.multa + p.juros - p.desconto) - COALESCE(p.valor_pago,0), 0)::numeric saldo
      FROM parcelas_aluguel p
      JOIN contratos_locacao c ON c.id = p.contrato_id
      LEFT JOIN imoveis i ON i.id = c.imovel_id
      LEFT JOIN pessoas locatario ON locatario.id = c.locatario_id
      WHERE p.status <> 'paga' AND p.vencimento < CURRENT_DATE
      ORDER BY p.vencimento ASC
    `,
    params: false,
  },
  faturas_receber_periodo: {
    title: 'Faturas a receber no periodo',
    sql: `
      SELECT p.vencimento, c.codigo contrato, locatario.nome locatario, i.titulo imovel, p.categoria,
        (p.valor + COALESCE(p.iptu_valor,0) + COALESCE(p.condominio_valor,0) + p.multa + p.juros - p.desconto)::numeric total,
        COALESCE(p.valor_pago,0)::numeric pago,
        GREATEST((p.valor + COALESCE(p.iptu_valor,0) + COALESCE(p.condominio_valor,0) + p.multa + p.juros - p.desconto) - COALESCE(p.valor_pago,0), 0)::numeric saldo
      FROM parcelas_aluguel p
      JOIN contratos_locacao c ON c.id = p.contrato_id
      LEFT JOIN imoveis i ON i.id = c.imovel_id
      LEFT JOIN pessoas locatario ON locatario.id = c.locatario_id
      WHERE p.status <> 'paga' AND p.vencimento BETWEEN $1::date AND $2::date
      ORDER BY p.vencimento ASC
    `,
  },
  faturas_repassar_periodo: {
    title: 'Faturas a repassar no periodo',
    sql: `
      SELECT p.repasse_vencimento, c.codigo contrato, locador.nome locador, i.titulo imovel,
        p.valor_repasse::numeric valor_repasse, p.status, p.repassado_em
      FROM parcelas_aluguel p
      JOIN contratos_locacao c ON c.id = p.contrato_id
      LEFT JOIN imoveis i ON i.id = c.imovel_id
      LEFT JOIN pessoas locador ON locador.id = c.locador_id
      WHERE p.repasse_vencimento BETWEEN $1::date AND $2::date AND p.repassado_em IS NULL
      ORDER BY p.repasse_vencimento ASC
    `,
  },
  faturas_recebidas_periodo: {
    title: 'Faturas recebidas no periodo',
    sql: `
      SELECT p.pago_em, c.codigo contrato, locatario.nome locatario, i.titulo imovel, p.categoria,
        COALESCE(p.valor_pago,0)::numeric valor_pago, p.forma_pagamento
      FROM parcelas_aluguel p
      JOIN contratos_locacao c ON c.id = p.contrato_id
      LEFT JOIN imoveis i ON i.id = c.imovel_id
      LEFT JOIN pessoas locatario ON locatario.id = c.locatario_id
      WHERE p.pago_em BETWEEN $1::date AND $2::date
      ORDER BY p.pago_em ASC
    `,
  },
  faturas_repassadas_periodo: {
    title: 'Faturas repassadas no periodo',
    sql: `
      SELECT p.repassado_em, c.codigo contrato, locador.nome locador, i.titulo imovel,
        p.valor_repasse::numeric valor_repasse
      FROM parcelas_aluguel p
      JOIN contratos_locacao c ON c.id = p.contrato_id
      LEFT JOIN imoveis i ON i.id = c.imovel_id
      LEFT JOIN pessoas locador ON locador.id = c.locador_id
      WHERE p.repassado_em BETWEEN $1::date AND $2::date
      ORDER BY p.repassado_em ASC
    `,
  },
  recebidas_nao_repassadas: {
    title: 'Faturas recebidas e nao repassadas',
    sql: `
      SELECT p.pago_em, c.codigo contrato, locador.nome locador, locatario.nome locatario, i.titulo imovel,
        COALESCE(p.valor_pago,0)::numeric recebido, p.valor_repasse::numeric a_repassar
      FROM parcelas_aluguel p
      JOIN contratos_locacao c ON c.id = p.contrato_id
      LEFT JOIN imoveis i ON i.id = c.imovel_id
      LEFT JOIN pessoas locador ON locador.id = c.locador_id
      LEFT JOIN pessoas locatario ON locatario.id = c.locatario_id
      WHERE p.pago_em IS NOT NULL AND p.repassado_em IS NULL
      ORDER BY p.pago_em ASC
    `,
    params: false,
  },
  repassadas_nao_recebidas: {
    title: 'Faturas repassadas e nao recebidas',
    sql: `
      SELECT p.repassado_em, c.codigo contrato, locador.nome locador, locatario.nome locatario, i.titulo imovel,
        COALESCE(p.valor_pago,0)::numeric recebido, p.valor_repasse::numeric repassado
      FROM parcelas_aluguel p
      JOIN contratos_locacao c ON c.id = p.contrato_id
      LEFT JOIN imoveis i ON i.id = c.imovel_id
      LEFT JOIN pessoas locador ON locador.id = c.locador_id
      LEFT JOIN pessoas locatario ON locatario.id = c.locatario_id
      WHERE p.repassado_em IS NOT NULL AND p.pago_em IS NULL
      ORDER BY p.repassado_em ASC
    `,
    params: false,
  },
  recebimentos_repasses: {
    title: 'Relatorio de recebimentos e repasses',
    sql: `
      SELECT to_char(COALESCE(p.pago_em, p.repassado_em, p.vencimento), 'YYYY-MM') mes,
        SUM(COALESCE(p.valor_pago,0))::numeric recebido,
        SUM(CASE WHEN p.repassado_em IS NOT NULL THEN COALESCE(p.valor_repasse,0) ELSE 0 END)::numeric repassado,
        (SUM(COALESCE(p.valor_pago,0)) - SUM(CASE WHEN p.repassado_em IS NOT NULL THEN COALESCE(p.valor_repasse,0) ELSE 0 END))::numeric saldo_imobiliaria
      FROM parcelas_aluguel p
      WHERE COALESCE(p.pago_em, p.repassado_em, p.vencimento) BETWEEN $1::date AND $2::date
      GROUP BY 1
      ORDER BY 1
    `,
  },
  panorama: {
    title: 'Panorama da imobiliaria',
    sql: `
      SELECT 'Imoveis disponiveis' indicador, COUNT(*)::numeric valor FROM imoveis WHERE status = 'disponivel'
      UNION ALL SELECT 'Imoveis alugados', COUNT(*)::numeric FROM imoveis WHERE status = 'alugado'
      UNION ALL SELECT 'Contratos ativos', COUNT(*)::numeric FROM contratos_locacao WHERE status = 'ativo'
      UNION ALL SELECT 'Faturas abertas', COUNT(*)::numeric FROM parcelas_aluguel WHERE status <> 'paga'
      UNION ALL SELECT 'Saldo a receber', COALESCE(SUM(GREATEST((valor + COALESCE(iptu_valor,0) + COALESCE(condominio_valor,0) + multa + juros - desconto) - COALESCE(valor_pago,0), 0)),0)::numeric FROM parcelas_aluguel WHERE status <> 'paga'
      UNION ALL SELECT 'Saldo a repassar', COALESCE(SUM(valor_repasse),0)::numeric FROM parcelas_aluguel WHERE repassado_em IS NULL
    `,
    params: false,
  },
  locadores_imoveis: {
    title: 'Relacao de locadores e seus imoveis',
    sql: `
      SELECT p.codigo locador_codigo, p.nome locador, p.whatsapp, i.codigo imovel_codigo, i.titulo imovel, i.status,
        i.valor_aluguel::numeric aluguel, i.bairro, i.cidade
      FROM imoveis i
      LEFT JOIN pessoas p ON p.id = i.proprietario_id
      ORDER BY p.nome, i.codigo
    `,
    params: false,
  },
  carteira_por_bairro: {
    title: 'Carteira de imoveis por bairro',
    sql: `
      SELECT COALESCE(NULLIF(i.bairro, ''), 'Sem bairro') bairro,
        COUNT(*)::int quantidade,
        COUNT(*) FILTER (WHERE i.status = 'disponivel')::int disponiveis,
        COUNT(*) FILTER (WHERE i.status = 'alugado')::int alugados,
        COALESCE(SUM(i.valor_aluguel), 0)::numeric potencial_aluguel,
        COALESCE(AVG(NULLIF(i.valor_aluguel, 0)), 0)::numeric ticket_medio
      FROM imoveis i
      GROUP BY 1
      ORDER BY quantidade DESC, bairro ASC
    `,
    params: false,
  },
  imoveis_sem_proprietario: {
    title: 'Imoveis sem proprietario vinculado',
    sql: `
      SELECT i.codigo, i.titulo, i.tipo, i.status, i.bairro, i.cidade,
        i.valor_aluguel::numeric aluguel, i.valor_venda::numeric venda
      FROM imoveis i
      WHERE i.proprietario_id IS NULL
      ORDER BY i.codigo ASC
    `,
    params: false,
  },
  imoveis_dados_incompletos: {
    title: 'Imoveis com dados comerciais incompletos',
    sql: `
      SELECT i.codigo, i.titulo, i.status, i.bairro, i.cidade,
        i.valor_aluguel::numeric aluguel, i.valor_venda::numeric venda,
        CONCAT_WS(', ',
          CASE WHEN i.proprietario_id IS NULL THEN 'sem proprietario' END,
          CASE WHEN COALESCE(i.valor_aluguel, 0) = 0 AND COALESCE(i.valor_venda, 0) = 0 THEN 'sem valor' END,
          CASE WHEN COALESCE(NULLIF(i.bairro, ''), '') = '' THEN 'sem bairro' END,
          CASE WHEN COALESCE(NULLIF(i.cidade, ''), '') = '' THEN 'sem cidade' END,
          CASE WHEN COALESCE(NULLIF(i.chaves_local, ''), '') = '' THEN 'sem local das chaves' END
        ) pendencias
      FROM imoveis i
      WHERE i.proprietario_id IS NULL
        OR (COALESCE(i.valor_aluguel, 0) = 0 AND COALESCE(i.valor_venda, 0) = 0)
        OR COALESCE(NULLIF(i.bairro, ''), '') = ''
        OR COALESCE(NULLIF(i.cidade, ''), '') = ''
        OR COALESCE(NULLIF(i.chaves_local, ''), '') = ''
      ORDER BY i.codigo ASC
    `,
    params: false,
  },
  chaves_abertas: {
    title: 'Emprestimos de chaves em aberto',
    sql: `
      SELECT e.hora_retirada, e.previsao_devolucao, e.interessado_nome, e.contato,
        i.codigo imovel_codigo, i.titulo imovel,
        CASE
          WHEN e.previsao_devolucao < now() THEN 'atrasado'
          WHEN e.previsao_devolucao IS NULL THEN 'sem previsao'
          ELSE 'em aberto'
        END status
      FROM emprestimos_chaves e
      LEFT JOIN imoveis i ON i.id = e.imovel_id
      WHERE e.devolvida_em IS NULL
      ORDER BY e.previsao_devolucao NULLS LAST, e.hora_retirada ASC
    `,
    params: false,
  },
  locacoes_periodo: {
    title: 'Relatorio de locacoes no periodo',
    sql: `
      SELECT c.codigo contrato, c.inicio, c.fim, c.status, i.titulo imovel, locatario.nome locatario,
        locador.nome locador, c.valor_aluguel::numeric aluguel
      FROM contratos_locacao c
      LEFT JOIN imoveis i ON i.id = c.imovel_id
      LEFT JOIN pessoas locatario ON locatario.id = c.locatario_id
      LEFT JOIN pessoas locador ON locador.id = c.locador_id
      WHERE c.inicio BETWEEN $1::date AND $2::date
      ORDER BY c.inicio ASC
    `,
  },
  captacao_imoveis: {
    title: 'Relatorio de captacao de imoveis',
    sql: `
      SELECT i.cadastro_em, i.codigo, i.titulo, i.tipo, i.status, captador.nome captador, proprietario.nome proprietario,
        i.valor_aluguel::numeric aluguel, i.valor_venda::numeric venda
      FROM imoveis i
      LEFT JOIN pessoas captador ON captador.id = i.captador_id
      LEFT JOIN pessoas proprietario ON proprietario.id = i.proprietario_id
      WHERE i.cadastro_em BETWEEN $1::date AND $2::date
      ORDER BY i.cadastro_em ASC
    `,
  },
  rescisoes_periodo: {
    title: 'Relatorio de rescisoes no periodo',
    sql: `
      SELECT c.codigo contrato, c.data_rescisao, i.titulo imovel, locatario.nome locatario, locador.nome locador, c.status
      FROM contratos_locacao c
      LEFT JOIN imoveis i ON i.id = c.imovel_id
      LEFT JOIN pessoas locatario ON locatario.id = c.locatario_id
      LEFT JOIN pessoas locador ON locador.id = c.locador_id
      WHERE c.data_rescisao BETWEEN $1::date AND $2::date OR (c.status IN ('encerrado','distrato') AND c.fim BETWEEN $1::date AND $2::date)
      ORDER BY COALESCE(c.data_rescisao, c.fim) ASC
    `,
  },
  contratos_ativos_dia: {
    title: 'Contratos ativos por dia de cobranca',
    sql: `
      SELECT c.vencimento_dia dia_cobranca, COUNT(*)::int contratos, SUM(c.valor_aluguel)::numeric total_aluguel
      FROM contratos_locacao c
      WHERE c.status = 'ativo'
      GROUP BY c.vencimento_dia
      ORDER BY c.vencimento_dia
    `,
    params: false,
  },
  contratos_vencendo: {
    title: 'Contratos vencendo',
    sql: `
      SELECT c.codigo contrato, c.fim, i.titulo imovel, locatario.nome locatario, locador.nome locador, c.valor_aluguel::numeric aluguel
      FROM contratos_locacao c
      LEFT JOIN imoveis i ON i.id = c.imovel_id
      LEFT JOIN pessoas locatario ON locatario.id = c.locatario_id
      LEFT JOIN pessoas locador ON locador.id = c.locador_id
      WHERE c.status = 'ativo' AND c.fim BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '90 days'
      ORDER BY c.fim ASC
    `,
    params: false,
  },
  contratos_sem_faturas: {
    title: 'Contratos ativos sem faturas geradas',
    sql: `
      SELECT c.codigo contrato, c.inicio, c.fim, i.titulo imovel, locatario.nome locatario, c.valor_aluguel::numeric aluguel
      FROM contratos_locacao c
      LEFT JOIN imoveis i ON i.id = c.imovel_id
      LEFT JOIN pessoas locatario ON locatario.id = c.locatario_id
      WHERE c.status = 'ativo' AND NOT EXISTS (SELECT 1 FROM parcelas_aluguel p WHERE p.contrato_id = c.id)
      ORDER BY c.inicio ASC
    `,
    params: false,
  },
  manutencao_imovel: {
    title: 'Relatorio de manutencoes por imovel',
    sql: `
      SELECT cp.vencimento, i.codigo imovel_codigo, i.titulo imovel, cp.descricao, cp.categoria, cp.valor::numeric valor, cp.status
      FROM contas_pagar cp
      LEFT JOIN imoveis i ON i.id = cp.imovel_id
      WHERE cp.vencimento BETWEEN $1::date AND $2::date AND lower(COALESCE(cp.categoria, '')) LIKE '%manut%'
      ORDER BY cp.vencimento ASC
    `,
  },
  caixa_periodo: {
    title: 'Demonstrativo de caixa no periodo',
    sql: `
      SELECT data, tipo, descricao, categoria, valor::numeric valor FROM (
        SELECT COALESCE(cr.recebido_em, cr.vencimento) data, 'Entrada' tipo, cr.descricao, cr.categoria, cr.valor valor
        FROM contas_receber cr
        WHERE COALESCE(cr.recebido_em, cr.vencimento) BETWEEN $1::date AND $2::date
        UNION ALL
        SELECT COALESCE(cp.pago_em, cp.vencimento) data, 'Saida' tipo, cp.descricao, cp.categoria, -cp.valor valor
        FROM contas_pagar cp
        WHERE COALESCE(cp.pago_em, cp.vencimento) BETWEEN $1::date AND $2::date
      ) fluxo
      ORDER BY data ASC
    `,
  },
  saldos_locadores: {
    title: 'Saldos em contas de locadores diferente de zero',
    sql: `
      SELECT locador.nome locador, SUM(COALESCE(p.valor_repasse,0))::numeric a_repassar,
        SUM(CASE WHEN p.repassado_em IS NOT NULL THEN COALESCE(p.valor_repasse,0) ELSE 0 END)::numeric repassado,
        (SUM(COALESCE(p.valor_repasse,0)) - SUM(CASE WHEN p.repassado_em IS NOT NULL THEN COALESCE(p.valor_repasse,0) ELSE 0 END))::numeric saldo
      FROM parcelas_aluguel p
      JOIN contratos_locacao c ON c.id = p.contrato_id
      LEFT JOIN pessoas locador ON locador.id = c.locador_id
      GROUP BY locador.nome
      HAVING (SUM(COALESCE(p.valor_repasse,0)) - SUM(CASE WHEN p.repassado_em IS NOT NULL THEN COALESCE(p.valor_repasse,0) ELSE 0 END)) <> 0
      ORDER BY locador.nome
    `,
    params: false,
  },
  resumo_iptu: {
    title: 'Relatorio resumo de pagamento de IPTU',
    sql: `
      SELECT to_char(p.competencia, 'YYYY-MM') competencia, c.codigo contrato, i.titulo imovel,
        SUM(COALESCE(p.iptu_valor,0))::numeric iptu, SUM(COALESCE(p.valor_pago,0))::numeric pago
      FROM parcelas_aluguel p
      JOIN contratos_locacao c ON c.id = p.contrato_id
      LEFT JOIN imoveis i ON i.id = c.imovel_id
      WHERE p.competencia BETWEEN $1::date AND $2::date AND COALESCE(p.iptu_valor,0) > 0
      GROUP BY 1, c.codigo, i.titulo
      ORDER BY 1, c.codigo
    `,
  },
  resumo_condominio: {
    title: 'Relatorio resumo de pagamento de condominio',
    sql: `
      SELECT to_char(p.competencia, 'YYYY-MM') competencia, c.codigo contrato, i.titulo imovel,
        SUM(COALESCE(p.condominio_valor,0))::numeric condominio, SUM(COALESCE(p.valor_pago,0))::numeric pago
      FROM parcelas_aluguel p
      JOIN contratos_locacao c ON c.id = p.contrato_id
      LEFT JOIN imoveis i ON i.id = c.imovel_id
      WHERE p.competencia BETWEEN $1::date AND $2::date AND COALESCE(p.condominio_valor,0) > 0
      GROUP BY 1, c.codigo, i.titulo
      ORDER BY 1, c.codigo
    `,
  },
  contas_categoria: {
    title: 'Relatorio de contas por historico/categoria',
    sql: `
      SELECT categoria, tipo, COUNT(*)::int quantidade, SUM(valor)::numeric valor FROM (
        SELECT COALESCE(categoria,'Sem categoria') categoria, 'Receber' tipo, valor FROM contas_receber WHERE vencimento BETWEEN $1::date AND $2::date
        UNION ALL
        SELECT COALESCE(categoria,'Sem categoria') categoria, 'Pagar' tipo, valor FROM contas_pagar WHERE vencimento BETWEEN $1::date AND $2::date
      ) contas
      GROUP BY categoria, tipo
      ORDER BY categoria, tipo
    `,
  },
};

app.get('/api/relatorios/locacao', requireAuth, async (req, res) => {
  const tipo = req.query.tipo || 'panorama';
  const report = reportSql[tipo];
  if (!report) return res.status(404).json({ error: 'Relatorio nao encontrado.' });
  const params = report.params === false ? [] : periodParams(req);
  const result = await query(report.sql, params);
  res.json({ tipo, titulo: report.title, inicio: params[0] || null, fim: params[1] || null, rows: result.rows });
});

app.get('/api/recibo/:parcelaId', requireAuth, async (req, res) => {
  const result = await query(`
    SELECT p.*, c.codigo contrato_codigo, i.codigo imovel_codigo, i.titulo imovel_titulo, i.endereco imovel_endereco,
      locatario.nome locatario_nome, locatario.cpf_cnpj locatario_doc,
      locador.nome locador_nome, locador.cpf_cnpj locador_doc
    FROM parcelas_aluguel p
    JOIN contratos_locacao c ON c.id = p.contrato_id
    LEFT JOIN imoveis i ON i.id = c.imovel_id
    LEFT JOIN pessoas locatario ON locatario.id = c.locatario_id
    LEFT JOIN pessoas locador ON locador.id = c.locador_id
    WHERE p.id = $1
  `, [req.params.parcelaId]);
  const p = result.rows[0];
  if (!p) return res.status(404).send('Recibo nao encontrado.');
  const today = new Date().toLocaleDateString('pt-BR');
  const total = invoiceTotal(p);
  const saldo = invoiceBalance(p);
  const pagamentosResult = await query(
    'SELECT valor, forma_pagamento, pago_em, observacao FROM pagamentos_parcela WHERE parcela_id = $1 ORDER BY pago_em ASC, criado_em ASC',
    [p.id]
  );
  const pagamentos = pagamentosResult.rows.length
    ? pagamentosResult.rows
    : Number(p.valor_pago || 0) > 0
      ? [{ valor: p.valor_pago, forma_pagamento: p.forma_pagamento || 'dinheiro', pago_em: p.ultimo_pagamento_em || p.pago_em || new Date(), observacao: p.acordo_observacao }]
      : [];
  const totalPago = pagamentos.reduce((sum, pagamento) => sum + Number(pagamento.valor || 0), 0);
  const items = [
    ['Aluguel', p.valor],
    Number(p.iptu_valor || 0) > 0 ? ['IPTU', p.iptu_valor] : null,
    Number(p.condominio_valor || 0) > 0 ? ['Condominio', p.condominio_valor] : null,
    Number(p.multa || 0) > 0 ? ['Multa', p.multa] : null,
    Number(p.juros || 0) > 0 ? ['Juros', p.juros] : null,
    Number(p.desconto || 0) > 0 ? ['Desconto', -Number(p.desconto)] : null,
  ].filter(Boolean);

  const recibo80 = `
    <main class="ticket">
      <header>
        <strong>IGS IMOB PRO</strong>
        <span>RECIBO DE ALUGUEL</span>
        <small>No. ${p.recibo_numero || '-'}</small>
      </header>
      <section>
        <p><b>Contrato:</b> ${escapeHtml(p.contrato_codigo)}</p>
        <p><b>Imovel:</b> ${escapeHtml(p.imovel_codigo)} ${escapeHtml(p.imovel_titulo || p.imovel_endereco || '')}</p>
        <p><b>Locatario:</b> ${escapeHtml(p.locatario_nome || '')}</p>
        <p><b>Doc:</b> ${escapeHtml(p.locatario_doc || '')}</p>
        <p><b>Locador:</b> ${escapeHtml(p.locador_nome || '')}</p>
      </section>
      <hr>
      <section>
        ${items.map(([label, value]) => `<div class="line"><span>${escapeHtml(label)}</span><b>${brl(value)}</b></div>`).join('')}
      </section>
      <hr>
      <div class="line total"><span>TOTAL</span><b>${brl(total)}</b></div>
      <div class="line"><span>PAGO</span><b>${brl(totalPago)}</b></div>
      <div class="line"><span>SALDO</span><b>${brl(saldo)}</b></div>
      <section>
        <p><b>Venc.:</b> ${new Date(p.vencimento).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}</p>
        <p><b>Emissao:</b> ${today}</p>
      </section>
      <hr>
      <section>
        <p><b>Pagamentos:</b></p>
        ${pagamentos.length ? pagamentos.map((pagamento) => `
          <p>${brDate(pagamento.pago_em)} - ${brl(pagamento.valor)} - ${escapeHtml(paymentLabel(pagamento.forma_pagamento))}</p>
          ${pagamento.observacao ? `<small>${escapeHtml(pagamento.observacao)}</small>` : ''}
        `).join('') : '<p>Nenhum pagamento registrado.</p>'}
      </section>
      <small class="note">${saldo <= 0 ? 'Lancamento quitado. Nenhum valor pendente referente a esta fatura.' : `Pagamento parcial registrado. Falta pagar ${brl(saldo)} referente a esta fatura.`}</small>
      <small class="note">Este recibo nao quita debitos anteriores. Recebimento sujeito a compensacao quando aplicavel.</small>
      <footer>Obrigado.</footer>
    </main>`;

  res.send(`<!doctype html><html><head><meta charset="utf-8"><title>Recibo 80mm</title><style>
    @page{size:80mm auto;margin:3mm}
    *{box-sizing:border-box}
    body{margin:0;background:#eee;font-family:Arial,Helvetica,sans-serif;color:#111}
    .toolbar{padding:10px;text-align:center}
    button{border:0;border-radius:4px;background:#111;color:#fff;padding:8px 12px}
    .ticket{width:80mm;margin:0 auto;background:#fff;padding:4mm;font-size:11px;line-height:1.25}
    header{text-align:center;border-bottom:1px dashed #111;padding-bottom:6px;margin-bottom:6px}
    header strong{display:block;font-size:16px;letter-spacing:.5px}
    header span{display:block;font-weight:700;margin-top:2px}
    p{margin:2px 0;word-break:break-word}
    hr{border:0;border-top:1px dashed #111;margin:7px 0}
    .line{display:flex;justify-content:space-between;gap:8px;margin:3px 0}
    .line span{max-width:46mm}
    .line b{text-align:right;white-space:nowrap}
    .total{font-size:14px}
    .note{display:block;margin-top:8px;text-align:center}
    footer{text-align:center;margin-top:10px;font-weight:700}
    @media print{body{background:#fff}.toolbar{display:none}.ticket{margin:0;width:74mm;padding:0;font-size:11px}}
  </style></head><body><div class="toolbar"><button onclick="print()">Imprimir 80 mm</button></div>${recibo80}</body></html>`);
});

app.get('/api/contratos/:id/documento', requireAuth, async (req, res) => {
  const result = await query(`
    SELECT c.*, i.titulo imovel_titulo, i.endereco imovel_endereco, i.bairro, i.cidade, i.uf, i.cep, i.energia_instalacao cemig_unidade,
      locador.nome locador_nome, locador.cpf_cnpj locador_doc, locador.endereco locador_endereco,
      locatario.nome locatario_nome, locatario.cpf_cnpj locatario_doc, locatario.rg_ie locatario_rg_ie, locatario.endereco locatario_endereco,
      locatario.estado_civil locatario_estado_civil, locatario.profissao locatario_profissao,
      locatario.conjuge_nome locatario_conjuge_nome, locatario.conjuge_cpf locatario_conjuge_cpf,
      locatario.conjuge_rg locatario_conjuge_rg, locatario.conjuge_endereco locatario_conjuge_endereco,
      locatario.conjuge_profissao locatario_conjuge_profissao, locatario.conjuge_telefone locatario_conjuge_telefone,
      fiador.nome fiador_nome, fiador.cpf_cnpj fiador_doc, fiador.rg_ie fiador_rg_ie, fiador.endereco fiador_endereco,
      fiador.telefone fiador_telefone, fiador.whatsapp fiador_whatsapp, fiador.email fiador_email,
      fiador.profissao fiador_profissao, fiador.estado_civil fiador_estado_civil, fiador.nacionalidade fiador_nacionalidade,
      fiador.naturalidade fiador_naturalidade, fiador.conjuge_nome fiador_conjuge_nome, fiador.conjuge_cpf fiador_conjuge_cpf,
      fiador.conjuge_rg fiador_conjuge_rg, fiador.conjuge_endereco fiador_conjuge_endereco,
      fiador.conjuge_profissao fiador_conjuge_profissao, fiador.conjuge_telefone fiador_conjuge_telefone
    FROM contratos_locacao c
    LEFT JOIN imoveis i ON i.id = c.imovel_id
    LEFT JOIN pessoas locador ON locador.id = c.locador_id
    LEFT JOIN pessoas locatario ON locatario.id = c.locatario_id
    LEFT JOIN LATERAL (
      SELECT fiador_id FROM pessoa_fiadores
      WHERE locatario_id = c.locatario_id
      ORDER BY criado_em ASC
      LIMIT 1
    ) pf ON TRUE
    LEFT JOIN pessoas fiador ON fiador.id = COALESCE(c.fiador_id, pf.fiador_id)
    WHERE c.id = $1
  `, [req.params.id]);
  const c = result.rows[0];
  if (!c) return res.status(404).send('Contrato nao encontrado.');

  if (c.documento_personalizado) {
    res.send(`<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Contrato ${escapeHtml(c.codigo)}</title>
  <style>
    body{font-family:Arial,sans-serif;margin:40px;line-height:1.5;color:#161b22;background:#f4f6f8}
    button{position:fixed;right:24px;top:18px;border:0;border-radius:6px;background:#063b4b;color:white;padding:10px 14px;font-weight:700}
    .doc{max-width:860px;margin:auto;background:white;padding:42px 50px;box-shadow:0 10px 28px #0001}
    @media print{button{display:none}body{margin:0;background:white}.doc{box-shadow:none;max-width:none;padding:0}}
  </style>
</head>
<body>
  <button onclick="print()">Imprimir / salvar PDF</button>
  <main class="doc">${c.documento_personalizado}</main>
</body>
</html>`);
    return;
  }
  const spouseLine = (prefix) => {
    const nome = c[`${prefix}_conjuge_nome`];
    if (!nome) return '';
    return `<br><b>Conjuge:</b> ${escapeHtml(nome)}${c[`${prefix}_conjuge_cpf`] ? ` - CPF ${escapeHtml(c[`${prefix}_conjuge_cpf`])}` : ''}${c[`${prefix}_conjuge_rg`] ? ` - RG ${escapeHtml(c[`${prefix}_conjuge_rg`])}` : ''}${c[`${prefix}_conjuge_endereco`] ? `<br>${escapeHtml(c[`${prefix}_conjuge_endereco`])}` : ''}${[c[`${prefix}_conjuge_profissao`] ? `Profissao: ${c[`${prefix}_conjuge_profissao`]}` : '', c[`${prefix}_conjuge_telefone`] ? `Contato: ${c[`${prefix}_conjuge_telefone`]}` : ''].filter(Boolean).length ? `<br>${[c[`${prefix}_conjuge_profissao`] ? `Profissao: ${c[`${prefix}_conjuge_profissao`]}` : '', c[`${prefix}_conjuge_telefone`] ? `Contato: ${c[`${prefix}_conjuge_telefone`]}` : ''].filter(Boolean).map(escapeHtml).join(' | ')}` : ''}`;
  };
  const fiador = c.fiador_nome ? `
    <p><b>Fiador:</b> ${escapeHtml(c.fiador_nome)} - CPF/CNPJ ${escapeHtml(c.fiador_doc || '')}${c.fiador_rg_ie ? ` - RG/IE ${escapeHtml(c.fiador_rg_ie)}` : ''}<br>
    ${escapeHtml(c.fiador_endereco || '')}<br>
    ${[
      c.fiador_estado_civil ? `Estado civil: ${c.fiador_estado_civil}` : '',
      c.fiador_profissao ? `Profissao: ${c.fiador_profissao}` : '',
      c.fiador_nacionalidade ? `Nacionalidade: ${c.fiador_nacionalidade}` : '',
      c.fiador_naturalidade ? `Naturalidade: ${c.fiador_naturalidade}` : '',
      c.fiador_whatsapp || c.fiador_telefone ? `Contato: ${c.fiador_whatsapp || c.fiador_telefone}` : '',
      c.fiador_email ? `E-mail: ${c.fiador_email}` : '',
    ].filter(Boolean).map(escapeHtml).join(' | ')}${spouseLine('fiador')}</p>
  ` : '';
  const clausulasEspeciais = c.observacoes ? `
    <h2>2.1. Clausulas Especiais e Alteracoes</h2>
    <p>${escapeHtml(c.observacoes)}</p>
  ` : '';
  const locatarioConjugeAssinatura = c.locatario_conjuge_nome ? '<div class="line">Conjuge do Locatario</div>' : '';
  const fiadorAssinatura = c.fiador_nome ? `<div class="line">Fiador</div>${c.fiador_conjuge_nome ? '<div class="line">Conjuge do Fiador</div>' : ''}` : '';
  const assinaturas = `<div class="line">Locador</div><div class="line">Locatario</div>${locatarioConjugeAssinatura}${fiadorAssinatura}<div class="line">Testemunha 1<br>Nome:<br>CPF:</div><div class="line">Testemunha 2<br>Nome:<br>CPF:</div>`;
  const inicio = new Date(c.inicio).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
  const fim = new Date(c.fim).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
  const enderecoImovel = `${c.imovel_titulo || ''}, situado em ${c.imovel_endereco || ''}, ${c.bairro || ''}, ${c.cidade || ''}/${c.uf || ''}, CEP ${c.cep || ''}`;
  const garantia = c.fiador_nome ? 'fianca' : (c.garantia || 'nao informada');

  res.send(`<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Contrato ${escapeHtml(c.codigo)}</title>
  <style>
    body{font-family:Arial,sans-serif;margin:40px;line-height:1.5;color:#161b22;background:#f4f6f8}
    button{position:fixed;right:24px;top:18px;border:0;border-radius:6px;background:#063b4b;color:white;padding:10px 14px;font-weight:700}
    .doc{max-width:860px;margin:auto;background:white;padding:42px 50px;box-shadow:0 10px 28px #0001}
    h1{text-align:center;font-size:22px;margin:0 0 8px;text-transform:uppercase}
    h2{font-size:15px;margin:22px 0 8px;text-transform:uppercase;border-bottom:1px solid #d8dee4;padding-bottom:4px}
    h3{font-size:13px;margin:16px 0 6px;text-transform:uppercase}
    p{margin:7px 0;text-align:justify}
    .muted{text-align:center;color:#57606a;margin-bottom:20px}
    .summary{display:grid;grid-template-columns:1fr 1fr;gap:0;border:1px solid #8c959f;margin:18px 0}
    .summary div{padding:8px 10px;border-bottom:1px solid #d8dee4}
    .summary div:nth-child(odd){border-right:1px solid #d8dee4}
    .summary span{display:block;font-size:10px;text-transform:uppercase;color:#57606a}
    .summary b{display:block;margin-top:2px}
    ol{padding-left:22px}
    li{margin:7px 0;text-align:justify}
    .sign{display:grid;grid-template-columns:repeat(2,1fr);gap:54px 36px;margin-top:72px;page-break-inside:avoid}
    .line{border-top:1px solid #111;text-align:center;padding-top:8px;min-height:44px}
    .page-break{page-break-before:always}
    @media print{button{display:none}body{margin:0;background:white}.doc{box-shadow:none;max-width:none;padding:0}h2{page-break-after:avoid}}
  </style>
</head>
<body>
  <button onclick="print()">Imprimir / salvar PDF</button>
  <main class="doc">
    <h1>Contrato Particular de Locacao de Imovel</h1>
    <p class="muted">Contrato no. ${escapeHtml(c.codigo)} - IGS Imob PRO</p>

    <section class="summary">
      <div><span>Locador</span><b>${escapeHtml(c.locador_nome || '-')}</b></div>
      <div><span>Locatario</span><b>${escapeHtml(c.locatario_nome || '-')}</b></div>
      <div><span>Imovel</span><b>${escapeHtml(c.imovel_titulo || c.imovel_endereco || '-')}</b></div>
      <div><span>Finalidade</span><b>${escapeHtml(c.destino || 'residencial')}</b></div>
      <div><span>Inicio</span><b>${inicio}</b></div>
      <div><span>Termino</span><b>${fim}</b></div>
      <div><span>Aluguel</span><b>${brl(c.valor_aluguel)}</b></div>
      <div><span>Vencimento</span><b>Todo dia ${c.vencimento_dia}</b></div>
      <div><span>Reajuste</span><b>${escapeHtml(c.indice_reajuste || 'IGP-M')}</b></div>
      <div><span>Numero da unidade CEMIG</span><b>${escapeHtml(c.cemig_unidade || '-')}</b></div>
      <div><span>Garantia</span><b>${escapeHtml(garantia)}</b></div>
    </section>

    <h2>1. Das Partes</h2>
    <p><b>Locador:</b> ${escapeHtml(c.locador_nome)} - CPF/CNPJ ${escapeHtml(c.locador_doc || '')}<br>${escapeHtml(c.locador_endereco || '')}</p>
    <p><b>Locatario:</b> ${escapeHtml(c.locatario_nome)} - CPF/CNPJ ${escapeHtml(c.locatario_doc || '')}${c.locatario_rg_ie ? ` - RG/IE ${escapeHtml(c.locatario_rg_ie)}` : ''}<br>${escapeHtml(c.locatario_endereco || '')}<br>${[c.locatario_estado_civil ? `Estado civil: ${c.locatario_estado_civil}` : '', c.locatario_profissao ? `Profissao: ${c.locatario_profissao}` : ''].filter(Boolean).map(escapeHtml).join(' | ')}${spouseLine('locatario')}</p>
    ${fiador}

    <h2>2. Do Imovel e da Destinacao</h2>
    <p>O LOCADOR da em locacao ao LOCATARIO o imovel descrito a seguir: ${escapeHtml(enderecoImovel)}.</p>
    <p>O imovel sera utilizado exclusivamente para a finalidade ${escapeHtml(c.destino || 'residencial')}, sendo vedada a alteracao de uso sem autorizacao previa e escrita do LOCADOR ou da administradora.</p>
    ${clausulasEspeciais}

    <h2>3. Do Prazo da Locacao</h2>
    <p>O prazo da locacao inicia-se em ${inicio} e encerra-se em ${fim}${c.prazo_indeterminado ? ', podendo prosseguir por prazo indeterminado conforme legislacao aplicavel' : ''}. Qualquer renovacao, prorrogacao ou alteracao devera ser formalizada preferencialmente por aditivo escrito.</p>
    <p>A permanencia do LOCATARIO apos o termino do prazo, sem oposicao formal do LOCADOR, nao implica perdao de debitos, renuncia de direitos ou alteracao automatica das demais condicoes aqui pactuadas.</p>

    <h2>4. Do Aluguel, Vencimento e Forma de Pagamento</h2>
    <p>O aluguel mensal e de <b>${brl(c.valor_aluguel)}</b>, vencendo-se todo dia ${c.vencimento_dia} de cada mes. O pagamento devera ser feito nos canais indicados pela administradora, podendo ser recusado pagamento parcial sem acordo escrito.</p>
    <p>Pagamentos feitos por cheque, deposito, boleto ou outro meio sujeito a compensacao somente serao considerados quitados apos efetivo credito e confirmacao pela administradora.</p>

    <h2>5. Dos Encargos da Locacao</h2>
    <p>Correrao por conta do LOCATARIO, enquanto estiver na posse direta ou indireta do imovel, os alugueis, IPTU, taxas municipais, condominio ordinario, agua, energia, gas, telefone, internet, seguro contratado, multas por uso indevido, despesas de consumo e demais encargos vinculados ao uso do imovel.</p>
    <p>O LOCATARIO obriga-se a apresentar comprovantes de pagamento sempre que solicitado. A existencia de cobranca unificada pela administradora nao desobriga o LOCATARIO de quitar encargos eventualmente cobrados diretamente por concessionarias, condominio ou poder publico.</p>

    <h2>6. Do Reajuste</h2>
    <p>O aluguel sera reajustado pelo indice ${escapeHtml(c.indice_reajuste || 'IGP-M')}, ou por outro indice legal que venha a substitui-lo, observada a periodicidade permitida pela legislacao vigente. Na impossibilidade de utilizacao do indice pactuado, as partes poderao adotar criterio legal equivalente.</p>

    <h2>7. Da Mora, Multa, Juros e Cobranca</h2>
    <p>O atraso no pagamento sujeitara o LOCATARIO aos encargos previstos no cadastro do contrato, incluindo multa, juros, correcao monetaria, despesas de cobranca, custas, honorarios e demais acrescimos admitidos em lei ou pactuados entre as partes.</p>
    <p>A tolerancia em receber aluguel ou encargo fora do prazo nao altera vencimento, nao representa novacao e nao impede a cobranca dos acrescimos em novos atrasos.</p>

    <h2>8. Da Garantia Locaticia</h2>
    <p>A garantia contratual informada e: <b>${escapeHtml(garantia)}</b>. A garantia respondera por alugueis, encargos, multas, danos ao imovel, despesas de cobranca, custas, honorarios e quaisquer obrigacoes decorrentes deste contrato ate a efetiva entrega das chaves e apuracao final de debitos.</p>
    <p>Se a garantia tornar-se insuficiente, invalida, extinta ou se o fiador perder idoneidade cadastral, o LOCATARIO devera substitui-la por outra aceita pelo LOCADOR no prazo indicado pela administradora.</p>

    <h2>9. Da Fianca e Responsabilidade do Fiador</h2>
    <p>Havendo fiador, este assina como garantidor e devedor solidario das obrigacoes do LOCATARIO, inclusive alugueis, encargos, danos, multas, custas e honorarios, ate a entrega formal das chaves e baixa final dos debitos.</p>
    <p>O FIADOR declara conhecer a situacao do imovel, as condicoes economicas do contrato, o prazo da locacao e os riscos da garantia, renunciando ao beneficio de ordem quando juridicamente aplicavel. Se casado ou em regime que exija anuencia, o conjuge do fiador comparece para manifestar ciencia e concordancia com a fianca.</p>

    <h2>10. Da Vistoria Inicial</h2>
    <p>O LOCATARIO declara receber o imovel no estado descrito no laudo de vistoria, que passa a integrar este contrato. Qualquer divergencia devera ser comunicada por escrito no prazo ajustado pela administradora; o silencio importara aceitacao do estado registrado.</p>

    <h2>11. Da Conservacao e Manutencao</h2>
    <p>O LOCATARIO devera conservar o imovel, suas instalacoes, pintura, fechaduras, vidros, pisos, revestimentos, loucas, metais, rede eletrica, hidraulica e demais acessorios, usando-os de forma regular e comunicando imediatamente defeitos, infiltracoes, sinistros ou riscos de dano.</p>
    <p>Pequenos reparos decorrentes do uso ordinario, manutencao preventiva e danos causados pelo LOCATARIO, familiares, visitantes, empregados, animais ou terceiros por ele autorizados serao de responsabilidade do LOCATARIO.</p>

    <h2>12. Das Benfeitorias e Alteracoes</h2>
    <p>Nenhuma obra, modificacao estrutural, pintura diferenciada, instalacao fixa, remocao de parede, troca de piso ou alteracao relevante podera ser feita sem autorizacao previa e escrita do LOCADOR. Benfeitorias nao autorizadas poderao ser removidas ou incorporadas ao imovel sem direito de indenizacao, sem prejuizo da obrigacao de recompor o estado anterior.</p>

    <h2>13. Das Proibicoes</h2>
    <p>E vedado ao LOCATARIO sublocar, emprestar, ceder, transferir o contrato, alterar a finalidade, manter atividade ilicita, causar perturbacao, sobrecarregar instalacoes, guardar materiais perigosos ou praticar atos que desvalorizem, danifiquem ou coloquem em risco o imovel, vizinhos ou condominio.</p>

    <h2>14. Do Condominio e Regras Internas</h2>
    <p>Quando o imovel integrar condominio, loteamento, edificio ou conjunto administrado, o LOCATARIO obriga-se a cumprir regimento interno, convencao, normas de seguranca, regras de garagem, uso de areas comuns, silencio, animais, lixo, mudanca e demais disposicoes administrativas.</p>
    <p>Multas condominiais geradas por conduta do LOCATARIO, seus familiares, visitantes ou prestadores serao de sua exclusiva responsabilidade.</p>

    <h2>15. Das Visitas, Fiscalizacao e Venda</h2>
    <p>O LOCATARIO devera permitir vistoria, avaliacao, manutencao necessaria e visita de interessados em compra ou nova locacao, mediante combinacao previa e em horario razoavel. Em caso de venda, serao observadas as regras legais sobre preferencia quando aplicaveis.</p>

    <h2>16. Do Seguro, Sinistros e Responsabilidades</h2>
    <p>O LOCATARIO devera comunicar imediatamente incendio, vazamento, furto, invasao, dano estrutural, acidente, notificacao publica ou qualquer fato que possa atingir o imovel. Quando contratado seguro incendio ou similar, o pagamento do premio nao afasta a responsabilidade por danos causados por culpa, dolo, mau uso ou omissao.</p>

    <h2>17. Da Rescisao e Multa Contratual</h2>
    <p>O descumprimento de qualquer obrigacao contratual ou legal podera ensejar rescisao, cobranca de debitos, multa contratual, perdas e danos, despejo e demais medidas cabiveis. A devolucao antecipada pelo LOCATARIO podera sujeita-lo a multa proporcional ao periodo restante, salvo hipoteses legais ou acordo escrito em sentido diverso.</p>

    <h2>18. Da Entrega das Chaves e Vistoria Final</h2>
    <p>A locacao somente sera considerada encerrada com a entrega formal das chaves, desocupacao total, vistoria de saida, apresentacao de comprovantes exigidos e quitacao dos debitos apurados. A simples saida fisica do imovel, abandono ou entrega informal de chaves a terceiros nao encerra as obrigacoes.</p>
    <p>Constatados danos, pendencias de pintura, limpeza, contas de consumo, encargos, multas ou reparos, o LOCATARIO e seus garantidores responderao pelos valores ate a regularizacao integral.</p>

    <h2>19. Da Comunicacao Entre as Partes</h2>
    <p>As comunicacoes poderao ser feitas por escrito, e-mail, WhatsApp, correspondencia ou outro meio informado no cadastro, obrigando-se as partes a manter dados atualizados. O envio para contato cadastrado sera considerado valido ate comunicacao formal de alteracao.</p>

    <h2>20. Das Disposicoes Gerais</h2>
    <p>A eventual tolerancia quanto a prazos, valores ou obrigacoes nao constituira renuncia, perdao, novacao ou alteracao contratual. Este instrumento obriga as partes, herdeiros e sucessores, respeitados os limites legais.</p>
    <p>O presente contrato e regido pela Lei do Inquilinato, pelo Codigo Civil e demais normas aplicaveis. As partes declaram ter lido, compreendido e aceitado todas as clausulas, assinando-o em vias de igual teor.</p>

    <h2>21. Do Foro</h2>
    <p>Fica eleito o foro da comarca do imovel, salvo regra legal obrigatoria diversa, para dirimir controversias decorrentes deste contrato.</p>

    <p style="margin-top:34px;text-align:right">${escapeHtml(c.cidade || '')}, ____ de ____________________ de ______.</p>
    <div class="sign">${assinaturas}</div>
  </main>
</body>
</html>`);
});

app.put('/api/contratos/:id/documento-personalizado', requireAuth, async (req, res) => {
  const documento = String(req.body.documento_personalizado || '').trim();
  const result = await query(
    `UPDATE contratos_locacao
     SET documento_personalizado = NULLIF($1, ''),
         documento_personalizado_em = CASE WHEN NULLIF($1, '') IS NULL THEN NULL ELSE CURRENT_TIMESTAMP END
     WHERE id = $2
     RETURNING id, documento_personalizado, documento_personalizado_em`,
    [documento, req.params.id]
  );
  if (result.rowCount === 0) return res.status(404).json({ error: 'Contrato nao encontrado.' });
  await logAction(req, 'atualizar_documento_personalizado', 'contratos_locacao', req.params.id);
  res.json(result.rows[0]);
});

app.get('/api/backup', requireAuth, async (_req, res) => {
  const tables = [
    'usuarios',
    'pessoas',
    'pessoa_fiadores',
    'imoveis',
    'contratos_locacao',
    'parcelas_aluguel',
    'pagamentos_parcela',
    'contas_pagar',
    'contas_receber',
    'repasses_proprietario',
    'vistorias',
    'vistoria_fotos',
    'leads',
    'agendamentos',
    'anexos',
    'configuracoes',
    'logs_sistema',
    'emprestimos_chaves',
  ];
  const backup = { gerado_em: new Date().toISOString(), sistema: 'IGS Imob PRO', tabelas: {} };
  for (const table of tables) {
    const result = await query(`SELECT * FROM ${table}`);
    backup.tabelas[table] = result.rows;
  }
  res.setHeader('Content-Disposition', `attachment; filename="igs-imob-pro-backup-${Date.now()}.json"`);
  res.json(backup);
});

app.use((_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

initDatabase()
  .then(() => {
    return syncAllImovelStatuses();
  })
  .then(() => {
    app.listen(port, () => {
      console.log(`IGS Imob PRO rodando em http://localhost:${port}`);
      console.log('Login inicial: admin@igs.local / 123');
    });
  })
  .catch((error) => {
    console.error('Nao foi possivel iniciar o sistema:', error);
    process.exit(1);
  });

process.on('SIGINT', async () => {
  await pool.end();
  process.exit(0);
});
