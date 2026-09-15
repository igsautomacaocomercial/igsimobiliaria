const state = {
  user: null,
  view: 'dashboard',
  data: {},
  filters: {},
  pages: {},
};

const pageSize = 15;

const rolePermissions = {
  ADMIN: ['*'],
  FINANCEIRO: ['dashboard', 'operacional', 'inadimplencia', 'repasses', 'reajustes', 'faturas', 'relatorios', 'contas_receber', 'contas_pagar', 'pessoas', 'imoveis', 'contratos'],
  CORRETOR: ['dashboard', 'operacional', 'inadimplencia', 'repasses', 'reajustes', 'pessoas', 'imoveis', 'contratos', 'leads', 'relatorios'],
  ATENDIMENTO: ['dashboard', 'operacional', 'inadimplencia', 'repasses', 'reajustes', 'pessoas', 'imoveis', 'leads', 'chaves', 'relatorios'],
  VISTORIADOR: ['dashboard', 'operacional', 'imoveis', 'relatorios'],
  CONSULTA: ['dashboard', 'operacional', 'inadimplencia', 'repasses', 'reajustes', 'pessoas', 'imoveis', 'contratos', 'faturas', 'relatorios', 'leads', 'chaves', 'contas_receber', 'contas_pagar'],
};

function canView(view) {
  const permissions = rolePermissions[String(state.user?.perfil || 'CONSULTA').toUpperCase()] || rolePermissions.CONSULTA;
  return permissions.includes('*') || permissions.includes(view);
}

let filterRenderTimer;

function scheduleFilterRender(selector = '#filter-input') {
  clearTimeout(filterRenderTimer);
  filterRenderTimer = setTimeout(() => {
    render();
    requestAnimationFrame(() => {
      const input = document.querySelector(selector);
      if (!input) return;
      input.focus();
      const end = input.value.length;
      if (typeof input.setSelectionRange === 'function') input.setSelectionRange(end, end);
    });
  }, 250);
}

function todayInputValue() {
  const today = new Date();
  const offsetDate = new Date(today.getTime() - today.getTimezoneOffset() * 60000);
  return offsetDate.toISOString().slice(0, 10);
}

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

const paymentMethods = [
  ['dinheiro', 'Dinheiro'],
  ['pix', 'Pix'],
  ['cartao', 'Cartao'],
  ['deposito', 'Deposito'],
  ['cheque', 'Cheque'],
];

const detailOptions = [
  'Armarios nos Quartos',
  'Banhos com Blindex',
  'D.C.E.',
  'Cozinha c/ Armarios',
  'Varanda / Sacada',
  'Area Privativa',
  'Area de Lazer',
  'Piscina',
  'Desocupado',
  'Salao de Festas',
  'Salao de Jogos',
  'Quadras Esportivas',
  'Porteiro Fisico',
  'Vagas Independentes',
];

const reportOptions = [
  ['panorama', 'Panorama da Imobiliaria'],
  ['faturas_atraso', 'Faturas em atraso nao recebidas'],
  ['faturas_receber_periodo', 'Faturas a receber no periodo'],
  ['faturas_repassar_periodo', 'Faturas a repassar no periodo'],
  ['faturas_recebidas_periodo', 'Faturas recebidas no periodo'],
  ['faturas_repassadas_periodo', 'Faturas repassadas no periodo'],
  ['recebidas_nao_repassadas', 'Faturas recebidas e nao repassadas'],
  ['repassadas_nao_recebidas', 'Faturas repassadas e nao recebidas'],
  ['recebimentos_repasses', 'Relatorio de recebimentos e repasses'],
  ['locadores_imoveis', 'Relacao de locadores e seus imoveis'],
  ['carteira_por_bairro', 'Carteira por bairro'],
  ['imoveis_sem_proprietario', 'Imoveis sem proprietario'],
  ['imoveis_dados_incompletos', 'Imoveis com dados incompletos'],
  ['chaves_abertas', 'Chaves em aberto'],
  ['locacoes_periodo', 'Relatorio de locacoes no periodo'],
  ['captacao_imoveis', 'Relatorio de captacao de imoveis'],
  ['rescisoes_periodo', 'Relatorio de rescisoes no periodo'],
  ['contratos_ativos_dia', 'Contratos ativos por dia de cobranca'],
  ['contratos_vencendo', 'Contratos vencendo'],
  ['contratos_sem_faturas', 'Contratos ativos sem faturas geradas'],
  ['manutencao_imovel', 'Relatorio de manutencoes por imovel'],
  ['caixa_periodo', 'Demonstrativo de caixa no periodo'],
  ['saldos_locadores', 'Saldos em contas de locadores'],
  ['resumo_iptu', 'Resumo de pagamento de IPTU'],
  ['resumo_condominio', 'Resumo de pagamento de condominio'],
  ['contas_categoria', 'Contas por historico/categoria'],
];

const modules = {
  pessoas: {
    icon: 'ID',
    title: 'Clientes',
    subtitle: 'Locadores, locatarios, fiadores, compradores, fornecedores e corretores.',
    endpoint: '/api/pessoas',
    columns: ['codigo', 'nome', 'tipo', 'cpf_cnpj', 'whatsapp'],
    search: ['nome', 'codigo', 'cpf_cnpj', 'cep', 'endereco', 'email', 'whatsapp'],
    fields: [
      ['codigo', 'Codigo', 'text'],
      ['nome', 'Nome completo', 'text'],
      ['tipo', 'Tipo', 'select', ['locador', 'locatario', 'fiador', 'corretor', 'fornecedor', 'cliente_comprador']],
      ['pf_pj', 'PF/PJ', 'select', ['PF', 'PJ', 'Estrangeiro']],
      ['cep', 'CEP', 'cep'],
      ['cpf_cnpj', 'CPF/CNPJ', 'text'],
      ['rg_ie', 'RG/Inscricao estadual', 'text'],
      ['telefone', 'Telefone', 'text'],
      ['whatsapp', 'Celular/WhatsApp', 'text'],
      ['email', 'E-mail principal', 'email'],
      ['endereco', 'Endereco', 'text'],
      ['nascimento', 'Nascimento/Fundacao', 'date'],
      ['naturalidade', 'Naturalidade', 'text'],
      ['nacionalidade', 'Nacionalidade', 'text'],
      ['estado_civil', 'Estado civil', 'select', ['solteiro', 'casado', 'divorciado', 'viuvo', 'uniao_estavel']],
      ['profissao', 'Profissao/Ramo atividade', 'text'],
      ['cargo', 'Cargo', 'text'],
      ['renda', 'Renda/Faturamento', 'number'],
      ['origem_cliente', 'Origem cliente', 'text'],
      ['filiacao', 'Filiacao', 'textarea'],
      ['referencias', 'Referencias', 'textarea'],
      ['endereco_correspondencia', 'Endereco para correspondencia', 'textarea'],
      ['conjuge_nome', 'Conjuge/Socio', 'text'],
      ['conjuge_cpf', 'CPF conjuge', 'text'],
      ['conjuge_rg', 'RG conjuge', 'text'],
      ['conjuge_telefone', 'Telefone conjuge', 'text'],
      ['conjuge_endereco', 'Endereco conjuge', 'text'],
      ['conjuge_nascimento', 'Nascimento conjuge', 'date'],
      ['conjuge_nacionalidade', 'Nacionalidade conjuge', 'text'],
      ['conjuge_estado_civil', 'Estado civil conjuge', 'select', ['solteiro', 'casado', 'divorciado', 'viuvo', 'uniao_estavel']],
      ['conjuge_profissao', 'Profissao conjuge', 'text'],
      ['observacoes', 'Observacoes', 'textarea'],
    ],
  },
  imoveis: {
    icon: 'IM',
    title: 'Imoveis',
    subtitle: 'Ficha completa: endereco, chaves, caracteristicas, IPTU, valores e manutencoes.',
    endpoint: '/api/imoveis',
    columns: ['codigo', 'tipo', 'titulo', 'bairro', 'status', 'valor_aluguel', 'qualidade'],
    search: ['codigo', 'titulo', 'endereco', 'bairro', 'cidade', 'tipo', 'iptu_indice'],
    fields: [
      ['codigo', 'Codigo', 'text'],
      ['titulo', 'Titulo de exibicao', 'text'],
      ['tipo', 'Tipo', 'select', ['casa', 'apartamento', 'apto_2q', 'apto_3q', 'loja', 'sala', 'lote', 'galpao']],
      ['finalidade', 'Finalidade', 'select', ['venda', 'locacao', 'ambos']],
      ['status', 'Status', 'select', [
        ['disponivel', 'Disponivel'],
        ['analisando', 'Analisando'],
        ['reservado', 'Reservado'],
        ['alugado', 'Alugado'],
        ['vendido', 'Vendido'],
        ['inativo', 'Inativo'],
      ]],
      ['proprietario_id', 'Locador/Proprietario', 'person:locador'],
      ['cep', 'CEP', 'text'],
      ['regiao', 'Regiao', 'text'],
      ['logradouro', 'Logradouro', 'text'],
      ['endereco', 'Endereco', 'text'],
      ['numero', 'Numero', 'text'],
      ['complemento', 'Complemento', 'text'],
      ['bairro', 'Bairro', 'text'],
      ['cidade', 'Cidade', 'text'],
      ['uf', 'UF', 'text'],
      ['edificio', 'Edificio', 'text'],
      ['construtora', 'Construtora', 'text'],
      ['unidade', 'Unidade', 'text'],
      ['valor_aluguel', 'Aluguel', 'number'],
      ['valor_venda', 'Venda', 'number'],
      ['condominio', 'Condominio', 'number'],
      ['iptu', 'IPTU', 'number'],
      ['quartos', 'Quartos', 'number'],
      ['suites', 'Suites', 'number'],
      ['salas', 'Salas', 'number'],
      ['banheiros', 'Banheiros', 'number'],
      ['vagas', 'Garagens', 'number'],
      ['elevadores', 'Elevadores', 'number'],
      ['unidades_andar', 'Unids/andar', 'number'],
      ['pavimentos', 'Pavimentos', 'number'],
      ['idade', 'Idade', 'number'],
      ['area_m2', 'Area util m2', 'number'],
      ['area_terreno_m2', 'Area terreno m2', 'number'],
      ['posicao', 'Posicao', 'text'],
      ['agua_instalacao', 'Agua/instalacao', 'text'],
      ['energia_instalacao', 'Numero da unidade CEMIG', 'text'],
      ['telefone_instalacao', 'Telefone/instalacao', 'text'],
      ['iptu_indice', 'Indice IPTU', 'text'],
      ['chaves_local', 'Local das chaves', 'text'],
      ['detalhes', 'Detalhes', 'multi', detailOptions],
      ['proximidades', 'Proximidade', 'textarea'],
      ['outras_infos', 'Outras informacoes', 'textarea'],
      ['captador_id', 'Captador', 'person:corretor'],
      ['sindico_id', 'Sindico/Adm', 'person'],
      ['administradora_id', 'Administradora', 'person:fornecedor'],
      ['disponivel_whatsapp', 'Conectar no WhatsApp', 'checkbox'],
      ['observacoes', 'Observacoes e manutencoes', 'textarea'],
    ],
  },
  contratos: {
    icon: 'CT',
    title: 'Locacoes',
    subtitle: 'Contratos, dados de cobranca, reajuste, repasse, garantias e documento.',
    endpoint: '/api/contratos',
    columns: ['codigo', 'inicio', 'fim', 'valor_aluguel', 'status'],
    search: ['codigo', 'responsavel', 'destino', 'garantia'],
    fields: [
      ['codigo', 'No. contrato', 'text'],
      ['imovel_id', 'Imovel', 'property'],
      ['locador_id', 'Locador', 'person:locador'],
      ['locatario_id', 'Locatario', 'person:locatario'],
      ['fiador_id', 'Fiador', 'person:fiador'],
      ['inicio', 'Inicio', 'date'],
      ['fim', 'Termino', 'date'],
      ['prazo_indeterminado', 'Prazo indeterminado', 'checkbox'],
      ['valor_aluguel', 'Valor aluguel', 'number'],
      ['vencimento_dia', 'Dia cobranca', 'number'],
      ['dia_repasse', 'Dia repasse', 'number'],
      ['indice_reajuste', 'Indice reajuste', 'select', ['IGP-M', 'IPCA', 'INPC']],
      ['proximo_reajuste', 'Proximo reajuste', 'date'],
      ['data_aditivo', 'Data aditivo', 'date'],
      ['proximo_aditivo', 'Proximo aditivo', 'date'],
      ['data_rescisao', 'Data rescisao', 'date'],
      ['taxa_administracao', '% taxa adm', 'number'],
      ['taxa_intermediacao', '% intermed.', 'number'],
      ['taxa_minima', 'Taxa minima', 'number'],
      ['aluguel_garantido', 'Tem aluguel garantido', 'checkbox'],
      ['cobrar_multa', 'Cobrar multa atraso', 'checkbox'],
      ['repassar_multa', 'Repassar multa', 'checkbox'],
      ['cobrar_juros', 'Cobrar juros a.m.', 'checkbox'],
      ['repassar_juros', 'Repassar juros', 'checkbox'],
      ['cobrar_iptu', 'Cobrar IPTU na fatura', 'checkbox'],
      ['repassar_iptu', 'Repassar IPTU', 'checkbox'],
      ['descontar_irrf', 'Descontar IRRF', 'checkbox'],
      ['cobranca_eletronica', 'Cobranca eletronica', 'checkbox'],
      ['destino', 'Destinado a', 'select', ['residencial', 'comercial', 'temporada']],
      ['responsavel', 'Funcionario responsavel', 'text'],
      ['garantia', 'Garantia', 'select', ['caucao', 'fiador', 'seguro_fianca', 'sem_garantia']],
      ['status', 'Status', 'select', ['ativo', 'renovado', 'encerrado', 'distrato', 'juridico']],
      ['observacoes', 'Clausulas especiais / alteracoes', 'textarea'],
    ],
  },
  contas_receber: {
    icon: 'CR',
    title: 'Receber',
    subtitle: 'Receitas avulsas, taxas, encargos e recebimentos manuais.',
    endpoint: '/api/contas_receber',
    columns: ['descricao', 'categoria', 'vencimento', 'valor', 'status'],
    search: ['descricao', 'categoria'],
    fields: [
      ['descricao', 'Descricao', 'text'],
      ['categoria', 'Categoria', 'text'],
      ['pessoa_id', 'Pessoa', 'person'],
      ['imovel_id', 'Imovel', 'property'],
      ['vencimento', 'Vencimento', 'date'],
      ['valor', 'Valor', 'number'],
      ['recebido_em', 'Recebido em', 'date'],
      ['status', 'Status', 'select', ['aberta', 'recebida', 'cancelada']],
    ],
  },
  contas_pagar: {
    icon: 'CP',
    title: 'Pagar',
    subtitle: 'Despesas da imobiliaria, fornecedores, manutencoes e custos por imovel.',
    endpoint: '/api/contas_pagar',
    columns: ['descricao', 'categoria', 'vencimento', 'valor', 'status'],
    search: ['descricao', 'categoria'],
    fields: [
      ['descricao', 'Descricao', 'text'],
      ['categoria', 'Categoria', 'text'],
      ['imovel_id', 'Imovel', 'property'],
      ['fornecedor_id', 'Fornecedor', 'person:fornecedor'],
      ['vencimento', 'Vencimento', 'date'],
      ['valor', 'Valor', 'number'],
      ['pago_em', 'Pago em', 'date'],
      ['descontar_repasse', 'Descontar do repasse', 'checkbox'],
      ['status', 'Status', 'select', ['aberta', 'paga', 'cancelada']],
    ],
  },
  leads: {
    icon: 'FX',
    title: 'CRM',
    subtitle: 'Leads, funil, visitas e imoveis ofertados.',
    endpoint: '/api/leads',
    columns: ['nome', 'telefone', 'interesse', 'etapa', 'origem'],
    search: ['nome', 'telefone', 'email', 'origem'],
    fields: [
      ['nome', 'Nome', 'text'],
      ['telefone', 'Telefone', 'text'],
      ['email', 'E-mail', 'email'],
      ['interesse', 'Interesse', 'select', ['locacao', 'venda', 'ambos']],
      ['etapa', 'Etapa', 'select', ['novo', 'em_atendimento', 'visita_marcada', 'proposta', 'contrato', 'fechado', 'perdido']],
      ['origem', 'Origem', 'text'],
      ['imovel_id', 'Imovel ofertado', 'property'],
      ['corretor_id', 'Corretor', 'person:corretor'],
      ['observacoes', 'Observacoes', 'textarea'],
    ],
  },
  chaves: {
    icon: 'CH',
    title: 'Chaves',
    subtitle: 'Controle de emprestimo de chaves para visitas e interessados.',
    endpoint: '/api/chaves',
    columns: ['interessado_nome', 'contato', 'documento', 'hora_retirada', 'devolvida_em'],
    search: ['interessado_nome', 'contato', 'documento'],
    fields: [
      ['interessado_nome', 'Nome do interessado', 'text'],
      ['contato', 'Contato/obs', 'text'],
      ['documento', 'Documento', 'text'],
      ['imovel_id', 'Imovel', 'property'],
      ['hora_retirada', 'Hora retirada', 'datetime-local'],
      ['previsao_devolucao', 'Previsao devolucao', 'datetime-local'],
      ['devolvida_em', 'Devolvida em', 'datetime-local'],
      ['observacoes', 'Observacoes', 'textarea'],
    ],
  },
  usuarios: {
    icon: 'US',
    title: 'Usuarios',
    subtitle: 'Controle de acesso administrativo, perfis e status dos usuarios.',
    endpoint: '/api/usuarios',
    columns: ['nome', 'email', 'perfil', 'ativo', 'ultimo_login'],
    search: ['nome', 'email', 'perfil'],
    fields: [
      ['nome', 'Nome', 'text'],
      ['email', 'E-mail', 'email'],
      ['perfil', 'Perfil', 'select', ['ADMIN', 'FINANCEIRO', 'CORRETOR', 'ATENDIMENTO', 'VISTORIADOR', 'CONSULTA']],
      ['ativo', 'Ativo', 'checkbox'],
      ['senha', 'Senha inicial (obrigatoria ao criar)', 'password'],
    ],
  },
};

async function api(url, options = {}) {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || 'Erro ao processar solicitacao.');
  }
  return response.json();
}

async function boot() {
  const { user } = await api('/api/auth/me');
  state.user = user;
  render();
  if (user) await loadView('dashboard');
}

function render() {
  const app = document.querySelector('#app');
  if (!state.user) {
    app.innerHTML = loginTemplate();
    document.querySelector('#login-form').addEventListener('submit', login);
    return;
  }
  if (state.user.trocar_senha_primeiro_acesso) {
    app.innerHTML = firstPasswordTemplate();
    document.querySelector('#first-password-form').addEventListener('submit', changeOwnPassword);
    document.querySelector('#logout-first-access').addEventListener('click', async () => {
      await api('/api/auth/logout', { method: 'POST', body: '{}' });
      state.user = null;
      render();
    });
    return;
  }
  app.innerHTML = shellTemplate();
  bindShell();
  renderView();
}

function firstPasswordTemplate() {
  return `
    <section class="login">
      <form class="login-panel" id="first-password-form">
        <div class="logo-mark">IGS</div>
        <h1>Troque sua senha</h1>
        <p>Por seguranca, defina uma senha com pelo menos 8 caracteres antes de continuar.</p>
        <label>Senha atual <input name="senha_atual" type="password" required></label>
        <label>Nova senha <input name="nova_senha" type="password" minlength="8" required></label>
        <label>Confirmar nova senha <input name="confirmar_senha" type="password" minlength="8" required></label>
        <button class="primary" type="submit">Salvar senha</button>
        <button class="secondary" type="button" id="logout-first-access">Sair</button>
        <div class="error" id="password-error"></div>
      </form>
    </section>
  `;
}

function loginTemplate() {
  return `
    <section class="login">
      <form class="login-panel" id="login-form">
        <div class="logo-mark">IGS</div>
        <h1>IGS Imob PRO</h1>
        <p>ERP imobiliario com locacao, repasse, faturas, chaves, CRM e contratos.</p>
        <label>E-mail <input name="email" type="email" value="admin@igs.local" required></label>
        <label>Senha <input name="senha" type="password" value="123" required></label>
        <button class="primary" type="submit">Entrar</button>
        <div class="error" id="login-error"></div>
      </form>
    </section>
  `;
}

function shellTemplate() {
  const items = [
    ['dashboard', 'Dashboard'],
    ['operacional', 'Operacao'],
    ['inadimplencia', 'Inadimplencia'],
    ['repasses', 'Repasses'],
    ['reajustes', 'Reajustes'],
    ['pessoas', 'Clientes'],
    ['imoveis', 'Imoveis'],
    ['contratos', 'Locacoes'],
    ['faturas', 'Faturas'],
    ['relatorios', 'Relatorios'],
    ['chaves', 'Chaves'],
    ['leads', 'CRM'],
    ['contas_receber', 'Receber'],
    ['contas_pagar', 'Pagar'],
    ['usuarios', 'Usuarios'],
  ].filter(([id]) => canView(id));
  return `
    <section class="shell">
      <aside class="sidebar">
        <div class="brand"><div class="logo-mark">IGS</div><div><strong>IGS Imob PRO</strong><span>Gestao imobiliaria</span></div></div>
        <nav class="nav">
          ${items.map(([id, label]) => `<button data-view="${id}" class="${state.view === id ? 'active' : ''}"><span>${modules[id]?.icon || 'DB'}</span>${label}</button>`).join('')}
        </nav>
        <div class="sidebar-footer">
          <span>${state.user.nome}</span>
          <a class="button" href="/api/backup">Backup JSON</a>
          <button class="secondary" id="logout">Sair</button>
        </div>
      </aside>
      <section class="workspace">
        <header class="quickbar">
          ${canView('pessoas') ? '<button data-view="pessoas">Pesquisar cliente</button>' : ''}
          ${canView('operacional') ? '<button data-view="operacional">Central operacional</button>' : ''}
          ${canView('inadimplencia') ? '<button data-view="inadimplencia">Inadimplencia</button>' : ''}
          ${canView('repasses') ? '<button data-view="repasses">Repasses</button>' : ''}
          ${canView('imoveis') ? '<button data-view="imoveis">Pesquisar imovel</button>' : ''}
          ${canView('contratos') ? '<button data-view="contratos">Controle de contratos</button>' : ''}
          ${canView('faturas') ? '<button data-view="faturas">Faturas e repasses</button>' : ''}
          ${canView('relatorios') ? '<button data-view="relatorios">Relatorios de locacao</button>' : ''}
          ${canView('chaves') ? '<button data-view="chaves">Controle de chaves</button>' : ''}
          ${canView('leads') ? '<button data-view="leads">Funil CRM</button>' : ''}
        </header>
        <section class="content" id="content"></section>
      </section>
    </section>
  `;
}

function bindShell() {
  document.querySelectorAll('[data-view]').forEach((button) => {
    button.addEventListener('click', () => loadView(button.dataset.view));
  });
  document.querySelector('#logout').addEventListener('click', async () => {
    await api('/api/auth/logout', { method: 'POST', body: '{}' });
    state.user = null;
    state.view = 'dashboard';
    render();
  });
}

async function login(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  try {
    const { user } = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: form.get('email'), senha: form.get('senha') }),
    });
    state.user = user;
    await loadView('dashboard');
  } catch (error) {
    document.querySelector('#login-error').textContent = error.message;
  }
}

async function changeOwnPassword(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  try {
    const { user } = await api('/api/auth/password', {
      method: 'PUT',
      body: JSON.stringify(Object.fromEntries(form.entries())),
    });
    state.user = user;
    await loadView('dashboard');
  } catch (error) {
    document.querySelector('#password-error').textContent = error.message;
  }
}

async function loadView(view) {
  if (!canView(view)) view = 'dashboard';
  state.view = view;
  if (view === 'dashboard') {
    state.data.dashboard = await api('/api/dashboard');
  } else if (view === 'operacional') {
    state.data.operacional = await api('/api/operacional');
  } else if (view === 'inadimplencia') {
    const params = new URLSearchParams(state.filters.inadimplencia || {});
    state.data.inadimplencia = await api(`/api/inadimplencia?${params}`);
  } else if (view === 'repasses') {
    state.data.repasses = await api('/api/repasses');
  } else if (view === 'reajustes') {
    state.data.reajustes = await api('/api/reajustes');
  } else if (view === 'faturas') {
    await loadDependencies();
    state.data.faturas = await api('/api/parcelas_aluguel');
  } else if (view === 'relatorios') {
    await loadDependencies();
    await loadReport();
  } else {
    await loadDependencies();
    state.data[view] = await api(modules[view].endpoint);
  }
  render();
}

async function loadDependencies() {
  if (!state.data.pessoas) state.data.pessoas = await api('/api/pessoas');
  if (!state.data.imoveis) state.data.imoveis = await api('/api/imoveis');
  if (!state.data.contratos) state.data.contratos = await api('/api/contratos');
}

function defaultReportFilters() {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
  const end = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().slice(0, 10);
  return { tipo: 'panorama', inicio: start, fim: end };
}

async function loadReport() {
  const filters = { ...defaultReportFilters(), ...(state.filters.relatorios || {}) };
  state.filters.relatorios = filters;
  const params = new URLSearchParams(filters);
  state.data.relatorios = await api(`/api/relatorios/locacao?${params}`);
}

function renderView() {
  const content = document.querySelector('#content');
  if (!content) return;
  if (state.view === 'dashboard') {
    content.innerHTML = dashboardTemplate(state.data.dashboard);
    content.querySelectorAll('[data-view]').forEach((button) => {
      button.addEventListener('click', () => {
        if (button.dataset.reportShortcut) {
          state.filters.relatorios = { ...defaultReportFilters(), ...(state.filters.relatorios || {}), tipo: button.dataset.reportShortcut };
        }
        loadView(button.dataset.view);
      });
    });
    return;
  }
  if (state.view === 'faturas') {
    content.innerHTML = invoicesTemplate();
    bindInvoices();
    return;
  }
  if (state.view === 'relatorios') {
    content.innerHTML = reportsTemplate();
    bindReports();
    return;
  }
  if (state.view === 'operacional') {
    content.innerHTML = operationalTemplate();
    bindOperational();
    return;
  }
  if (state.view === 'inadimplencia') {
    content.innerHTML = delinquencyTemplate();
    bindDelinquency();
    return;
  }
  if (state.view === 'repasses') {
    content.innerHTML = transfersTemplate();
    bindTransfers();
    return;
  }
  if (state.view === 'reajustes') {
    content.innerHTML = adjustmentsTemplate();
    bindAdjustments();
    return;
  }
  content.innerHTML = moduleTemplate(state.view);
  bindModule(state.view);
}

function dashboardTemplate(data) {
  if (!data) return '<p>Carregando...</p>';
  const cards = [
    ['Imoveis disponiveis', data.imoveis.disponivel || 0, 'metric-success'],
    ['Imoveis alugados', data.imoveis.alugado || 0, 'metric-info'],
    ['Contratos vencendo', data.contratosVencendo || 0, 'metric-warning'],
    ['Alugueis em atraso', data.alugueisAtraso.total || 0, 'metric-danger'],
    ['Vencem hoje', data.alugueisVencendoHoje.total || 0, 'metric-today'],
    ['Vencem 7 dias', data.alugueisVencendo7.total || 0, 'metric-dark'],
    ['Contas pagar atrasadas', data.contasPagarAtraso.total || 0, 'metric-danger'],
    ['Contas receber atrasadas', data.contasReceberAtraso.total || 0, 'metric-danger'],
    ['Valor em atraso', money.format(Number(data.alugueisAtraso.total_valor || 0)), 'metric-danger'],
    ['A pagar', money.format(Number(data.contasPagar.total_valor || 0)), 'metric-warning'],
    ['A receber', money.format(Number(data.contasReceber.total_valor || 0)), 'metric-info'],
    ['Carteira vendida', data.imoveis.vendido || 0, 'metric-dark'],
  ];
  const max = Math.max(...data.mensal.map((row) => Number(row.recebimentos) + Number(row.despesas)), 1);
  const statusCounts = [
    ['Disponiveis', Number(data.imoveis.disponivel || 0), '#16a34a'],
    ['Analisando', Number(data.imoveis.analisando || 0), '#ca8a04'],
    ['Reservados', Number(data.imoveis.reservado || 0), '#f59e0b'],
    ['Alugados', Number(data.imoveis.alugado || 0), '#0f335f'],
    ['Vendidos', Number(data.imoveis.vendido || 0), '#111827'],
    ['Inativos', Number(data.imoveis.inativo || 0), '#b91c1c'],
  ];
  const maxStatus = Math.max(...statusCounts.map(([, count]) => count), 1);
  const alertas = data.alertas || [];
  const totalImoveis = statusCounts.reduce((sum, [, count]) => sum + count, 0);
  const ocupacao = totalImoveis ? Math.round((Number(data.imoveis.alugado || 0) / totalImoveis) * 100) : 0;
  const auditoria = data.auditoriaCarteira || {};
  return `
    <div class="hero">
      <div><h1>Central IGS Imob PRO</h1><p>Locacao, financeiro, contratos, chaves e CRM no mesmo painel.</p></div>
      <button class="primary" data-view="imoveis">Cadastrar imovel</button>
    </div>
    <section class="grid metrics">${cards.map(([label, value, cls]) => metric(label, value, cls)).join('')}</section>
    <section class="grid two">
      <div class="panel"><h2>Recebimentos e despesas</h2><div class="chart">
        ${data.mensal.map((row) => {
          const total = Number(row.recebimentos) + Number(row.despesas);
          return `<div class="bar-row"><span>${row.mes}</span><div class="bar-track"><div class="bar-fill" style="width:${(total / max) * 100}%"></div></div><strong>${money.format(total)}</strong></div>`;
        }).join('')}
      </div></div>
      <div class="panel"><h2>Funil comercial</h2><div class="chart">
        ${data.funil.length ? data.funil.map((row) => `<div class="bar-row"><span>${labelize(row.etapa)}</span><div class="bar-track"><div class="bar-fill accent" style="width:${Math.min(row.total * 18, 100)}%"></div></div><strong>${row.total}</strong></div>`).join('') : '<p>Nenhum lead cadastrado.</p>'}
      </div></div>
    </section>
    <section class="grid two">
      <div class="panel">
        <h2>Alertas operacionais</h2>
        <div class="alert-list">
          ${alertas.length ? alertas.map(alertRow).join('') : '<p>Sem pendencias para os proximos 7 dias.</p>'}
        </div>
      </div>
      <div class="panel">
        <h2>Resumo do dia</h2>
        <div class="dashboard-summary">
          ${metric('Atrasadas', data.alugueisAtraso.total || 0, 'metric-danger')}
          ${metric('Vencem hoje', data.alugueisVencendoHoje.total || 0, 'metric-today')}
          ${metric('7 dias', data.alugueisVencendo7.total || 0, 'metric-dark')}
          ${metric('Contas vencidas', Number(data.contasPagarAtraso.total || 0) + Number(data.contasReceberAtraso.total || 0), 'metric-warning')}
        </div>
      </div>
    </section>
    <section class="grid two">
      <div class="panel">
        <h2>Imoveis por status</h2>
        <div class="chart">
          ${statusCounts.map(([label, count, color]) => `<div class="bar-row"><span>${label}</span><div class="bar-track"><div class="bar-fill" style="width:${(count / maxStatus) * 100}%; background:${color}"></div></div><strong>${count}</strong></div>`).join('')}
        </div>
      </div>
      <div class="panel">
        <h2>Resumo imobiliario rapido</h2>
        <div class="dashboard-summary">
          ${metric('Disponiveis', data.imoveis.disponivel || 0, 'metric-success')}
          ${metric('Alugados', data.imoveis.alugado || 0, 'metric-info')}
          ${metric('Vencendo', data.contratosVencendo || 0, 'metric-warning')}
          ${metric('Atrasadas', data.alugueisAtraso.total || 0, 'metric-danger')}
        </div>
      </div>
    </section>
    <section class="grid two">
      <div class="panel">
        <h2>Saude da carteira</h2>
        <div class="portfolio-health">
          <div class="health-ring" style="--percent:${ocupacao}"><strong>${ocupacao}%</strong><span>ocupacao</span></div>
          <div class="health-list">
            <div><span>Total de imoveis</span><strong>${totalImoveis}</strong></div>
            <div><span>Sem proprietario</span><strong>${auditoria.imoveisSemProprietario || 0}</strong></div>
            <div><span>Sem valor comercial</span><strong>${auditoria.imoveisSemValor || 0}</strong></div>
            <div><span>Chaves em aberto</span><strong>${auditoria.chavesAbertas || 0}</strong></div>
          </div>
        </div>
      </div>
      <div class="panel">
        <h2>Atalhos de melhoria</h2>
        <div class="quick-actions">
          <button class="secondary" data-view="relatorios" data-report-shortcut="imoveis_dados_incompletos">Auditar imoveis</button>
          <button class="secondary" data-view="relatorios" data-report-shortcut="carteira_por_bairro">Carteira por bairro</button>
          <button class="secondary" data-view="chaves">Controle de chaves</button>
        </div>
      </div>
    </section>
  `;
}

function metric(label, value, className = '') {
  return `<div class="metric ${className}"><span>${label}</span><strong>${value}</strong></div>`;
}

function operationalTemplate() {
  const data = state.data.operacional || { cards: {}, prioridades: [] };
  const c = data.cards || {};
  const cards = [
    ['Alugueis atrasados', c.alugueisAtrasados?.total || 0, 'metric-danger'],
    ['Valor em atraso', money.format(Number(c.alugueisAtrasados?.valor || 0)), 'metric-danger'],
    ['Vencem hoje', c.alugueisHoje?.total || 0, 'metric-today'],
    ['Valor hoje', money.format(Number(c.alugueisHoje?.valor || 0)), 'metric-today'],
    ['Proximos 7 dias', c.alugueis7Dias?.total || 0, 'metric-warning'],
    ['Valor 7 dias', money.format(Number(c.alugueis7Dias?.valor || 0)), 'metric-warning'],
    ['Recebidos hoje', c.recebidosHoje?.total || 0, 'metric-success'],
    ['Valor recebido', money.format(Number(c.recebidosHoje?.valor || 0)), 'metric-success'],
    ['Repasses pendentes', c.repassesPendentes?.total || 0, 'metric-info'],
    ['Valor a repassar', money.format(Number(c.repassesPendentes?.valor || 0)), 'metric-info'],
    ['Proprietarios aguardando', c.repassesPendentes?.proprietarios || 0, 'metric-info'],
    ['Reajustes pendentes', c.contratosReajustePendente || 0, 'metric-warning'],
    ['Contratos vencem 30d', c.contratosVencendo30 || 0, 'metric-warning'],
    ['Contratos vencem 60d', c.contratosVencendo60 || 0, 'metric-dark'],
    ['Chaves fora', c.chavesNaoDevolvidas || 0, 'metric-danger'],
  ];
  return `
    <div class="topbar"><div><h1>Central Operacional</h1><p>Trabalho por excecao: cobrancas, repasses, reajustes, contratos e chaves.</p></div><button class="secondary" id="refresh-operational">Atualizar</button></div>
    <section class="grid metrics">${cards.map(([label, value, cls]) => metric(label, value, cls)).join('')}</section>
    <section class="panel"><h2>Acoes prioritarias</h2><div class="alert-list">
      ${(data.prioridades || []).length ? data.prioridades.map((item) => `<div class="alert-item status-atrasada"><div><strong>${escapeHtml(item.titulo)}</strong><span>Contrato ${escapeHtml(item.contrato)} | ${escapeHtml(item.locatario || '-')} | ${escapeHtml(item.imovel || '-')}</span></div><div class="alert-meta"><b>${money.format(Number(item.saldo || 0))}</b><button class="secondary" data-view="inadimplencia">Ver cobranca</button></div></div>`).join('') : '<p>Nenhuma prioridade critica no momento.</p>'}
    </div></section>
  `;
}

function bindOperational() {
  document.querySelector('#refresh-operational')?.addEventListener('click', () => loadView('operacional'));
  document.querySelectorAll('[data-view]').forEach((button) => button.addEventListener('click', () => loadView(button.dataset.view)));
}

function delinquencyTemplate() {
  const rows = state.data.inadimplencia || [];
  const pageRows = paginatedRows('inadimplencia', rows);
  return `
    <div class="topbar"><div><h1>Central de Inadimplencia</h1><p>Faturas abertas/parciais vencidas, sem canceladas e sem pagas.</p></div></div>
    <div class="filter-panel report-filters">
      <label>Busca<input id="delinquency-search" value="${escapeHtml(state.filters.inadimplencia?.busca || '')}" placeholder="Locatario, imovel ou contrato"></label>
      <label>Atraso min.<input id="delinquency-min" type="number" value="${escapeHtml(state.filters.inadimplencia?.atraso_min || '')}"></label>
      <label>Ordenar<select id="delinquency-order"><option value="maior_atraso">Maior atraso</option><option value="maior_divida">Maior divida</option><option value="vencimento">Vencimento</option><option value="nome">Nome</option></select></label>
      <button class="primary" id="run-delinquency">Filtrar</button>
    </div>
    <div class="table-wrap"><table><thead><tr><th>Contrato</th><th>Locatario</th><th>Imovel</th><th>Vencimento</th><th>Dias</th><th>Saldo atualizado</th><th>Situacao</th><th>Ultima acao</th><th>Acoes</th></tr></thead><tbody>
      ${pageRows.length ? pageRows.map((row) => `<tr><td>${escapeHtml(row.contrato_codigo)}</td><td>${escapeHtml(row.locatario_nome)}</td><td>${escapeHtml(row.imovel_titulo)}</td><td>${date(row.vencimento)}</td><td>${row.encargos.dias_atraso}</td><td><b>${money.format(Number(row.encargos.saldo_atualizado || 0))}</b></td><td><span class="tag status-atrasada">${escapeHtml(row.encargos.situacao)}</span></td><td>${escapeHtml(row.ultima_acao_status || '-')}</td><td class="row-actions"><button class="secondary" data-charge="${row.id}">Registrar contato</button><button class="secondary" data-negotiate="${row.id}">Negociar</button><button class="secondary" data-whatsapp="${row.id}">WhatsApp</button><button class="secondary" data-pay="${row.id}">Receber</button></td></tr>`).join('') : '<tr><td colspan="9">Nenhuma inadimplencia encontrada.</td></tr>'}
    </tbody></table>${paginationTemplate('inadimplencia', rows.length)}</div>
  `;
}

function bindDelinquency() {
  const order = document.querySelector('#delinquency-order');
  if (order) order.value = state.filters.inadimplencia?.ordem || 'maior_atraso';
  document.querySelector('#run-delinquency').addEventListener('click', async () => {
    state.filters.inadimplencia = {
      busca: document.querySelector('#delinquency-search').value,
      atraso_min: document.querySelector('#delinquency-min').value,
      ordem: document.querySelector('#delinquency-order').value,
    };
    state.pages.inadimplencia = 1;
    await loadView('inadimplencia');
  });
  bindPagination('inadimplencia');
  document.querySelectorAll('[data-charge]').forEach((button) => button.addEventListener('click', () => openChargeActionForm(button.dataset.charge)));
  document.querySelectorAll('[data-negotiate]').forEach((button) => button.addEventListener('click', () => openNegotiateForm(button.dataset.negotiate)));
  document.querySelectorAll('[data-whatsapp]').forEach((button) => button.addEventListener('click', () => openWhatsapp(button.dataset.whatsapp)));
  document.querySelectorAll('[data-pay]').forEach((button) => button.addEventListener('click', () => openInvoicePayForm(button.dataset.pay)));
}

function transfersTemplate() {
  const rows = state.data.repasses || [];
  return `
    <div class="topbar"><div><h1>Central de Repasses</h1><p>Recebimentos de locatarios ainda nao repassados aos proprietarios.</p></div></div>
    <div class="table-wrap"><table><thead><tr><th>Proprietario</th><th>Imoveis</th><th>Recebido</th><th>Taxas</th><th>Despesas</th><th>A repassar</th><th>Acoes</th></tr></thead><tbody>
      ${rows.length ? rows.map((row) => `<tr><td>${escapeHtml(row.nome)}</td><td>${row.imoveis}</td><td>${money.format(Number(row.recebido || 0))}</td><td>${money.format(Number(row.taxa || 0))}</td><td>${money.format(Number(row.despesas || 0))}</td><td><b>${money.format(Number(row.liquido || 0))}</b></td><td class="row-actions"><button class="secondary" data-transfer-detail="${row.id}">Ver composicao</button><button class="primary" data-transfer-pay="${row.id}">Marcar repasse</button></td></tr>`).join('') : '<tr><td colspan="7">Nenhum repasse pendente.</td></tr>'}
    </tbody></table></div>`;
}

function bindTransfers() {
  document.querySelectorAll('[data-transfer-detail]').forEach((button) => button.addEventListener('click', () => openTransferComposition(button.dataset.transferDetail)));
  document.querySelectorAll('[data-transfer-pay]').forEach((button) => button.addEventListener('click', () => markTransfer(button.dataset.transferPay)));
}

function adjustmentsTemplate() {
  const rows = state.data.reajustes || [];
  return `
    <div class="topbar"><div><h1>Reajustes</h1><p>Contratos ativos com reajuste pendente ou previsto nos proximos 60 dias.</p></div></div>
    <div class="table-wrap"><table><thead><tr><th>Contrato</th><th>Imovel</th><th>Locatario</th><th>Valor atual</th><th>Indice</th><th>Proximo reajuste</th><th>Status</th><th>Acoes</th></tr></thead><tbody>
      ${rows.length ? rows.map((row) => `<tr><td>${escapeHtml(row.contrato)}</td><td>${escapeHtml(row.imovel)}</td><td>${escapeHtml(row.locatario)}</td><td>${money.format(Number(row.valor_aluguel || 0))}</td><td>${escapeHtml(row.indice_reajuste || '-')}</td><td>${date(row.proximo_reajuste)}</td><td><span class="tag status-${row.status}">${escapeHtml(labelize(row.status))}</span></td><td class="row-actions"><button class="secondary" data-adjust="${row.contrato_id}">Simular/aplicar</button><button class="secondary" data-postpone="${row.contrato_id}">Adiar</button></td></tr>`).join('') : '<tr><td colspan="8">Nenhum reajuste previsto.</td></tr>'}
    </tbody></table></div>`;
}

function bindAdjustments() {
  document.querySelectorAll('[data-adjust]').forEach((button) => button.addEventListener('click', () => openAdjustmentForm(button.dataset.adjust)));
  document.querySelectorAll('[data-postpone]').forEach((button) => button.addEventListener('click', () => postponeAdjustment(button.dataset.postpone)));
}

function alertRow(row) {
  const dueState = invoiceDueState(row);
  return `
    <div class="alert-item ${dueState.className}">
      <div>
        <strong>${escapeHtml(row.tipo)}</strong>
        <span>${escapeHtml(row.titulo)}</span>
      </div>
      <div class="alert-meta">
        <span>${date(row.vencimento)}</span>
        <b>${money.format(Number(row.valor || 0))}</b>
        <span class="tag ${dueState.className}">${escapeHtml(dueState.label)}</span>
      </div>
    </div>
  `;
}

function reportsTemplate() {
  const filters = { ...defaultReportFilters(), ...(state.filters.relatorios || {}) };
  const report = state.data.relatorios || { titulo: 'Relatorios', rows: [] };
  const rows = report.rows || [];
  const columns = rows.length ? Object.keys(rows[0]) : [];
  return `
    <div class="topbar">
      <div><h1>Relatorios de Locacao</h1><p>Consultas parecidas com os sistemas tradicionais de imobiliaria, com periodo e impressao.</p></div>
      <div class="row-actions">
        <button class="secondary" id="export-report-csv" ${rows.length ? '' : 'disabled'}>Exportar CSV</button>
        <button class="secondary" id="print-report">Imprimir</button>
      </div>
    </div>
    <div class="report-layout">
      <aside class="report-menu">
        <h2>Relatorios</h2>
        ${reportOptions.map(([id, label]) => `<button class="${filters.tipo === id ? 'active' : ''}" data-report="${id}">${label}</button>`).join('')}
      </aside>
      <section class="report-content">
        <div class="filter-panel report-filters">
          <label>Inicio<input id="report-start" type="date" value="${escapeHtml(filters.inicio)}"></label>
          <label>Fim<input id="report-end" type="date" value="${escapeHtml(filters.fim)}"></label>
          <button class="primary" id="run-report">Gerar</button>
          <span>${rows.length} registro(s)</span>
        </div>
        <div class="panel report-header"><h2>${escapeHtml(report.titulo || '')}</h2><p>${report.inicio ? `${date(report.inicio)} ate ${date(report.fim)}` : 'Relatorio sem filtro de periodo.'}</p></div>
        ${reportSummaryTemplate(rows)}
        <div class="table-wrap report-table"><table>
          <thead><tr>${columns.length ? columns.map((column) => `<th>${labelize(column)}</th>`).join('') : '<th>Resultado</th>'}</tr></thead>
          <tbody>${rows.length ? paginatedRows('relatorios', rows).map((row) => `<tr>${columns.map((column) => `<td>${formatReportValue(column, row[column])}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${Math.max(columns.length, 1)}">Nenhum registro encontrado.</td></tr>`}</tbody>
        </table></div>
        ${paginationTemplate('relatorios', rows.length)}
      </section>
    </div>
  `;
}

function bindReports() {
  document.querySelectorAll('[data-report]').forEach((button) => {
    button.addEventListener('click', async () => {
      state.filters.relatorios = { ...defaultReportFilters(), ...(state.filters.relatorios || {}), tipo: button.dataset.report };
      state.pages.relatorios = 1;
      await loadReport();
      render();
    });
  });
  document.querySelector('#run-report').addEventListener('click', async () => {
    state.filters.relatorios = {
      ...defaultReportFilters(),
      ...(state.filters.relatorios || {}),
      inicio: document.querySelector('#report-start').value,
      fim: document.querySelector('#report-end').value,
    };
    state.pages.relatorios = 1;
    await loadReport();
    render();
  });
  document.querySelector('#export-report-csv').addEventListener('click', exportCurrentReportCsv);
  document.querySelector('#print-report').addEventListener('click', () => window.print());
  bindPagination('relatorios');
}

function exportCurrentReportCsv() {
  const report = state.data.relatorios || { rows: [] };
  const rows = report.rows || [];
  if (!rows.length) return;
  const columns = Object.keys(rows[0]);
  const csv = [
    columns.map(csvCell).join(';'),
    ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(';')),
  ].join('\r\n');
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${slugify(report.tipo || 'relatorio')}-${todayInputValue()}.csv`;
  document.body.appendChild(link);
  link.click();
  URL.revokeObjectURL(link.href);
  link.remove();
}

function csvCell(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function reportSummaryTemplate(rows) {
  if (!rows.length) return '';
  const columns = Object.keys(rows[0]);
  const summaries = columns
    .filter((column) => isReportNumericColumn(column, rows))
    .slice(0, 4)
    .map((column) => {
      const values = rows.map((row) => Number(row[column] || 0));
      const total = column.includes('medio') || column.includes('media')
        ? values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1)
        : values.reduce((sum, value) => sum + value, 0);
      const value = isMoneyColumn(column) ? money.format(total) : total.toLocaleString('pt-BR');
      return metric(labelize(column), value);
    });
  if (!summaries.length) summaries.push(metric('Registros', rows.length));
  return `<section class="grid metrics report-summary">${summaries.join('')}</section>`;
}

function isReportNumericColumn(column, rows) {
  if (['ano', 'mes', 'dia_cobranca'].includes(column)) return false;
  return rows.some((row) => row[column] !== null && row[column] !== '' && !Number.isNaN(Number(row[column])));
}

function isMoneyColumn(column) {
  return ['valor', 'total', 'pago', 'saldo', 'recebido', 'repassado', 'a_repassar', 'valor_repasse', 'aluguel', 'venda', 'iptu', 'condominio', 'saldo_imobiliaria', 'total_aluguel', 'potencial_aluguel', 'ticket_medio'].includes(column) || column.includes('valor');
}

function moduleTemplate(name) {
  const config = modules[name];
  const rows = filteredRows(name);
  const pageRows = paginatedRows(name, rows);
  return `
    <div class="topbar">
      <div><h1>${config.title}</h1><p>${config.subtitle}</p></div>
      <button class="primary" id="new-record">Adicionar</button>
    </div>
    <div class="filter-panel">
          <label>Pesquisar por nome, codigo, documento, endereco ou bairro
        <input id="filter-input" value="${escapeHtml(state.filters[name] || '')}" placeholder="Digite para filtrar">
      </label>
      <span>${rows.length} registro(s)</span>
    </div>
    <div class="data-layout">
      <div class="table-wrap"><table>
        <thead><tr>${config.columns.map((column) => `<th>${labelize(column)}</th>`).join('')}<th>Acoes</th></tr></thead>
        <tbody>${rows.length ? pageRows.map((row) => tableRow(name, config, row)).join('') : `<tr><td colspan="${config.columns.length + 1}">Nenhum registro encontrado.</td></tr>`}</tbody>
      </table>${paginationTemplate(name, rows.length)}</div>
      <aside class="side-card">${sideSummary(name, rows[0])}</aside>
    </div>
  `;
}

function filteredRows(name) {
  const config = modules[name];
  const rows = state.data[name] || [];
  const term = normalize(state.filters[name] || '');
  if (!term) return rows;
  return rows.filter((row) => config.search.some((key) => normalize(row[key]).includes(term)));
}

function tableRow(name, config, row) {
  return `
    <tr>
      ${config.columns.map((column) => `<td>${formatValue(column, column === 'qualidade' ? row : row[column])}</td>`).join('')}
      <td class="row-actions">
        <button class="secondary" data-edit="${row.id}">Editar</button>
        ${name === 'pessoas' && row.tipo === 'locatario' ? `<button class="secondary" data-guarantor="${row.id}">Fiador</button>` : ''}
        ${name === 'contratos' ? `<button class="secondary" data-parcelas="${row.id}">Gerar faturas</button><button class="secondary" data-clauses="${row.id}">Clausulas</button><button class="secondary" data-document="${row.id}">Documento</button><a class="mini-link" target="_blank" href="/api/contratos/${row.id}/documento">Contrato</a>` : ''}
        ${name === 'usuarios' ? `<button class="secondary" data-reset-password="${row.id}">Redefinir senha</button><button class="secondary" data-toggle-user="${row.id}" data-active="${row.ativo ? 'false' : 'true'}">${row.ativo ? 'Desativar' : 'Ativar'}</button>` : `<button class="danger" data-delete="${row.id}">Excluir</button>`}
      </td>
    </tr>
  `;
}

function sideSummary(name, row) {
  if (!row) return '<h2>Ficha rapida</h2><p>Selecione ou cadastre um registro.</p>';
  if (name === 'imoveis') {
    const quality = propertyQuality(row);
    return `<h2>${escapeHtml(row.codigo)} - ${escapeHtml(row.titulo)}</h2><p>${escapeHtml(row.endereco || '')}, ${escapeHtml(row.numero || '')} - ${escapeHtml(row.bairro || '')}</p><div class="price-box"><span>Aluguel</span><strong>${money.format(Number(row.valor_aluguel || 0))}</strong><span>Condominio ${money.format(Number(row.condominio || 0))} | IPTU ${money.format(Number(row.iptu || 0))}</span></div><p>${badges(row.detalhes)}</p><p><b>Chaves:</b> ${escapeHtml(row.chaves_local || '-')}</p><div class="quality-card"><strong>Qualidade do cadastro: ${quality.score}%</strong><div class="quality-track"><span style="width:${quality.score}%"></span></div>${quality.missing.length ? `<p>Pendencias: ${quality.missing.map(escapeHtml).join(', ')}</p>` : '<p>Cadastro pronto para operacao.</p>'}</div>`;
  }
  if (name === 'pessoas') {
    return `<h2>${escapeHtml(row.nome)}</h2><p>${escapeHtml(row.tipo)} | ${escapeHtml(row.cpf_cnpj || '')}</p><p><b>Contato:</b> ${escapeHtml(row.whatsapp || row.telefone || '-')}</p><p><b>Endereco:</b> ${escapeHtml(row.endereco || '-')}</p><p><b>Profissao:</b> ${escapeHtml(row.profissao || '-')}</p>${row.fiadores_nomes ? `<p><b>Fiador(es):</b> ${escapeHtml(row.fiadores_nomes)}</p>` : ''}`;
  }
  if (name === 'contratos') {
    return `<h2>Contrato ${escapeHtml(row.codigo)}</h2><p>${date(row.inicio)} ate ${date(row.fim)}</p><div class="price-box"><span>Aluguel</span><strong>${money.format(Number(row.valor_aluguel || 0))}</strong><span>Vence dia ${row.vencimento_dia || '-'} | Repasse dia ${row.dia_repasse || '-'}</span></div><p><b>Reajuste:</b> ${escapeHtml(row.indice_reajuste || '-')} ${date(row.proximo_reajuste)}</p>`;
  }
  return `<h2>Ficha rapida</h2><p>${escapeHtml(row.nome || row.descricao || row.interessado_nome || row.codigo || '')}</p>`;
}

function bindModule(name) {
  document.querySelector('#new-record').addEventListener('click', () => openForm(name));
  document.querySelector('#filter-input').addEventListener('input', (event) => {
    state.filters[name] = event.target.value;
    state.pages[name] = 1;
    scheduleFilterRender();
  });
  bindPagination(name);
  document.querySelectorAll('[data-edit]').forEach((button) => {
    button.addEventListener('click', () => {
      const item = (state.data[name] || []).find((row) => row.id === button.dataset.edit);
      openForm(name, item);
    });
  });
  document.querySelectorAll('[data-delete]').forEach((button) => {
    button.addEventListener('click', () => removeRecord(name, button.dataset.delete));
  });
  document.querySelectorAll('[data-parcelas]').forEach((button) => {
    button.addEventListener('click', () => generateInstallments(button.dataset.parcelas));
  });
  document.querySelectorAll('[data-clauses]').forEach((button) => {
    button.addEventListener('click', () => openContractClausesForm(button.dataset.clauses));
  });
  document.querySelectorAll('[data-document]').forEach((button) => {
    button.addEventListener('click', () => openContractDocumentForm(button.dataset.document));
  });
  document.querySelectorAll('[data-guarantor]').forEach((button) => {
    button.addEventListener('click', () => openGuarantorForm(button.dataset.guarantor));
  });
  document.querySelectorAll('[data-reset-password]').forEach((button) => {
    button.addEventListener('click', () => resetUserPassword(button.dataset.resetPassword));
  });
  document.querySelectorAll('[data-toggle-user]').forEach((button) => {
    button.addEventListener('click', () => toggleUserStatus(button.dataset.toggleUser, button.dataset.active === 'true'));
  });
}

async function resetUserPassword(id) {
  const senha = prompt('Informe a nova senha temporaria com pelo menos 8 caracteres:');
  if (!senha) return;
  await api(`/api/usuarios/${id}/reset-password`, { method: 'PUT', body: JSON.stringify({ senha }) });
  state.data.usuarios = await api('/api/usuarios');
  render();
}

async function toggleUserStatus(id, ativo) {
  await api(`/api/usuarios/${id}/status`, { method: 'PUT', body: JSON.stringify({ ativo }) });
  state.data.usuarios = await api('/api/usuarios');
  render();
}

async function openContractDocumentForm(id) {
  const contrato = (state.data.contratos || []).find((item) => item.id === id);
  if (!contrato) return;
  const html = await fetch(`/api/contratos/${id}/documento`).then((response) => response.text());
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  const main = parsed.querySelector('main.doc');
  const modal = document.createElement('div');
  modal.className = 'modal-backdrop';
  modal.innerHTML = `
    <form class="modal modal-document" id="document-form">
      <header><div><h2>Editar contrato completo</h2><p>Edite o documento inteiro e salve para reutilizar esta versao.</p></div><button type="button" class="secondary" data-close>Fechar</button></header>
      <div class="doc-editor-wrap">
        <div class="doc-editor" id="doc-editor" contenteditable="true">${main ? main.innerHTML : ''}</div>
      </div>
      <div class="actions">
        <button type="button" class="secondary" data-close>Cancelar</button>
        <button type="button" class="secondary" id="clear-doc">Restaurar padrao</button>
        <button class="primary" type="submit">Salvar documento</button>
      </div>
      <div class="error" id="form-error"></div>
    </form>
  `;
  document.body.appendChild(modal);
  modal.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', () => modal.remove()));
  modal.querySelector('#clear-doc').addEventListener('click', () => {
    modal.querySelector('#doc-editor').innerHTML = '';
  });
  modal.querySelector('#document-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const documento_personalizado = modal.querySelector('#doc-editor').innerHTML.trim();
    try {
      await api(`/api/contratos/${id}/documento-personalizado`, {
        method: 'PUT',
        body: JSON.stringify({ documento_personalizado }),
      });
      modal.remove();
      state.data.contratos = await api('/api/contratos');
      render();
    } catch (error) {
      modal.querySelector('#form-error').textContent = error.message;
    }
  });
}

function openContractClausesForm(id) {
  const contrato = (state.data.contratos || []).find((item) => item.id === id);
  if (!contrato) return;
  const modal = document.createElement('div');
  modal.className = 'modal-backdrop';
  modal.innerHTML = `
    <form class="modal" id="clauses-form">
      <header><div><h2>Editar clausulas do contrato</h2><p>Altere o texto e salve para reutilizar no proximo contrato do mesmo locatario.</p></div><button type="button" class="secondary" data-close>Fechar</button></header>
      <div class="form-grid">
        <label class="full">Clausulas especiais / alteracoes<textarea name="observacoes">${escapeHtml(contrato.observacoes || '')}</textarea></label>
      </div>
      <div class="actions"><button type="button" class="secondary" data-close>Cancelar</button><button class="primary" type="submit">Salvar clausulas</button></div>
      <div class="error" id="form-error"></div>
    </form>
  `;
  document.body.appendChild(modal);
  modal.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', () => modal.remove()));
  modal.querySelector('#clauses-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      await api(`/api/contratos/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
      modal.remove();
      state.data.contratos = await api('/api/contratos');
      await loadDependencies();
      render();
    } catch (error) {
      modal.querySelector('#form-error').textContent = error.message;
    }
  });
}

function openGuarantorForm(locatarioId) {
  const locatario = (state.data.pessoas || []).find((person) => person.id === locatarioId);
  const fields = [
    ['nome', 'Nome do fiador', 'text'],
    ['pf_pj', 'PF/PJ', 'select', ['PF', 'PJ', 'Estrangeiro']],
    ['cep', 'CEP', 'cep'],
    ['cpf_cnpj', 'CPF/CNPJ', 'text'],
    ['rg_ie', 'RG/Inscricao estadual', 'text'],
    ['telefone', 'Telefone', 'text'],
    ['whatsapp', 'Celular/WhatsApp', 'text'],
    ['email', 'E-mail', 'email'],
    ['endereco', 'Endereco', 'text'],
    ['nascimento', 'Nascimento/Fundacao', 'date'],
    ['naturalidade', 'Naturalidade', 'text'],
    ['nacionalidade', 'Nacionalidade', 'text'],
    ['estado_civil', 'Estado civil', 'select', ['solteiro', 'casado', 'divorciado', 'viuvo', 'uniao_estavel']],
    ['profissao', 'Profissao/Ramo atividade', 'text'],
    ['renda', 'Renda/Faturamento', 'number'],
    ['conjuge_nome', 'Conjuge do fiador', 'text'],
    ['conjuge_cpf', 'CPF conjuge', 'text'],
    ['conjuge_rg', 'RG conjuge', 'text'],
    ['conjuge_telefone', 'Telefone conjuge', 'text'],
    ['conjuge_endereco', 'Endereco conjuge', 'text'],
    ['conjuge_nascimento', 'Nascimento conjuge', 'date'],
    ['conjuge_nacionalidade', 'Nacionalidade conjuge', 'text'],
    ['conjuge_estado_civil', 'Estado civil conjuge', 'select', ['solteiro', 'casado', 'divorciado', 'viuvo', 'uniao_estavel']],
    ['conjuge_profissao', 'Profissao conjuge', 'text'],
    ['filiacao', 'Filiacao', 'textarea'],
    ['referencias', 'Referencias', 'textarea'],
    ['observacoes', 'Observacoes', 'textarea'],
  ];
  const modal = document.createElement('div');
  modal.className = 'modal-backdrop';
  modal.innerHTML = `
    <form class="modal" id="guarantor-form">
      <header><div><h2>Cadastrar fiador</h2><p>Vinculado ao locatario ${escapeHtml(locatario?.nome || '')}</p></div><button type="button" class="secondary" data-close>Fechar</button></header>
      <div class="form-grid">${fields.map((field) => inputTemplate(field, { pf_pj: 'PF' })).join('')}</div>
      <div class="actions"><button type="button" class="secondary" data-close>Cancelar</button><button class="primary" type="submit">Salvar fiador</button></div>
      <div class="error" id="form-error"></div>
    </form>`;
  document.body.appendChild(modal);
  bindCepLookup(modal, 'pessoas');
  modal.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', () => modal.remove()));
  modal.querySelector('#guarantor-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
    payload.tipo = 'fiador';
    for (const key of Object.keys(payload)) {
      if (payload[key] === '') payload[key] = null;
    }
    try {
      await api(`/api/pessoas/${locatarioId}/fiadores`, { method: 'POST', body: JSON.stringify(payload) });
      modal.remove();
      state.data.pessoas = await api('/api/pessoas');
      render();
    } catch (error) {
      modal.querySelector('#form-error').textContent = error.message;
    }
  });
}

function invoicesTemplate() {
  const rows = state.data.faturas || [];
  const term = normalize(state.filters.faturas || '');
  const statusFilter = state.filters.faturasStatus || 'todos';
  const filtered = rows.filter((row) => {
    const dueState = invoiceDueState(row);
    const matchesStatus = statusFilter === 'todos'
      || (statusFilter === 'paga' && row.status === 'paga')
      || (statusFilter === 'aberta' && row.status === 'aberta')
      || (statusFilter === 'parcial' && row.status === 'parcial')
      || (statusFilter === 'a_vencer' && dueState.key === 'a_vencer')
      || (statusFilter === 'vence_hoje' && dueState.key === 'vence_hoje')
      || (statusFilter === 'atrasada' && dueState.key === 'atrasada');
    const matchesTerm = !term || ['contrato_codigo', 'imovel_titulo', 'locatario_nome', 'locador_nome', 'categoria', 'descricao'].some((key) => normalize(row[key]).includes(term));
    return matchesStatus && matchesTerm;
  });
  const totalReceber = filtered.reduce((sum, row) => sum + invoiceTotal(row), 0);
  const totalRepassar = filtered.reduce((sum, row) => sum + Number(row.valor_repasse || 0), 0);
  const pageRows = paginatedRows('faturas', filtered);
  return `
    <div class="topbar">
      <div><h1>Faturas e repasses</h1><p>Controle de parcelas, recibos, pontualidade, baixa, parcial, acordo e repasse ao proprietario.</p></div>
      <div class="row-actions">
        <button class="primary" id="new-loose-invoice">Fatura avulsa</button>
        <button class="secondary" id="contract-partial">Parcial contrato</button>
      </div>
    </div>
    <div class="filter-panel">
      <div class="row-actions">
        <button class="secondary ${statusFilter === 'todos' ? 'active' : ''}" data-filter-status="todos">Todas</button>
        <button class="secondary ${statusFilter === 'paga' ? 'active' : ''}" data-filter-status="paga">Pagas</button>
        <button class="secondary ${statusFilter === 'aberta' ? 'active' : ''}" data-filter-status="aberta">Abertas</button>
        <button class="secondary ${statusFilter === 'parcial' ? 'active' : ''}" data-filter-status="parcial">Parciais</button>
        <button class="secondary ${statusFilter === 'a_vencer' ? 'active' : ''}" data-filter-status="a_vencer">A vencer</button>
        <button class="secondary ${statusFilter === 'vence_hoje' ? 'active' : ''}" data-filter-status="vence_hoje">Vence hoje</button>
        <button class="secondary ${statusFilter === 'atrasada' ? 'active' : ''}" data-filter-status="atrasada">Atrasadas</button>
      </div>
    </div>
    <section class="grid metrics">${metric('Faturas filtradas', filtered.length)}${metric('A receber', money.format(totalReceber))}${metric('A repassar', money.format(totalRepassar))}${metric('Recebidas', filtered.filter((r) => r.status === 'paga').length)}</section>
    <div class="filter-panel"><label>Pesquisar fatura <input id="filter-input" value="${escapeHtml(state.filters.faturas || '')}" placeholder="Contrato, cliente, imovel ou categoria"></label><span>${filtered.length} registro(s)</span></div>
    <div class="table-wrap"><table>
      <thead><tr><th>Mes/Ano</th><th>Contrato</th><th>Cliente</th><th>Vencimento</th><th>Aluguel</th><th>IPTU</th><th>Total</th><th>Pago</th><th>Saldo</th><th>Repassar</th><th>Status</th><th>Acoes</th></tr></thead>
      <tbody>${filtered.length ? pageRows.map(invoiceRow).join('') : '<tr><td colspan="12">Nenhuma fatura gerada. Abra Locacoes e clique em Gerar faturas.</td></tr>'}</tbody>
    </table>${paginationTemplate('faturas', filtered.length)}</div>
  `;
}

function invoiceRow(row) {
  const month = new Date(row.competencia).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric', timeZone: 'UTC' });
  const status = invoiceStatusBadge(row);
  return `
    <tr>
      <td>${month}</td><td>${escapeHtml(row.contrato_codigo || '-')}</td><td>${escapeHtml(row.locatario_nome || '-')}</td><td>${date(row.vencimento)}</td>
      <td>${money.format(Number(row.valor || 0))}</td><td>${money.format(Number(row.iptu_valor || 0))}</td><td><b>${money.format(invoiceTotal(row))}</b></td><td>${money.format(Number(row.valor_pago || 0))}</td><td><b>${money.format(invoiceBalance(row))}</b></td><td>${money.format(Number(row.valor_repasse || 0))}</td><td>${status}</td>
      <td class="row-actions">
        <button class="secondary" data-pay="${row.id}">Quitar</button>
        <button class="secondary" data-partial="${row.id}">Parcial</button>
        <button class="secondary" data-repass="${row.id}">Repassar</button>
        <button class="secondary" data-undo="${row.id}">Estorno</button>
        <button class="danger" data-delete-invoice="${row.id}">Excluir</button>
        <a class="mini-link" target="_blank" href="/api/recibo/${row.id}">Recibo</a>
      </td>
    </tr>
  `;
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

function invoiceDueState(row) {
  if (row.status === 'paga') return { key: 'paga', label: 'Pago', className: 'status-paga' };
  const dueDate = String(row.vencimento || '').slice(0, 10);
  const today = todayInputValue();
  if (!dueDate) return { key: 'a_vencer', label: 'A vencer', className: 'status-a-vencer' };
  if (dueDate < today) return { key: 'atrasada', label: 'Atrasada', className: 'status-atrasada' };
  if (dueDate === today) return { key: 'vence_hoje', label: 'Vence hoje', className: 'status-vence-hoje' };
  return { key: 'a_vencer', label: 'A vencer', className: 'status-a-vencer' };
}

function invoiceStatusBadge(row) {
  const dueState = invoiceDueState(row);
  const label = row.status === 'paga'
    ? 'Pago'
    : `${labelize(row.status)} · ${dueState.label}`;
  return `<span class="tag ${dueState.className}">${escapeHtml(label)}</span>`;
}

function bindInvoices() {
  document.querySelector('#new-loose-invoice').addEventListener('click', openLooseInvoiceForm);
  document.querySelector('#contract-partial').addEventListener('click', openContractPartialForm);
  document.querySelectorAll('[data-filter-status]').forEach((button) => {
    button.addEventListener('click', () => {
      state.filters.faturasStatus = button.dataset.filterStatus;
      state.pages.faturas = 1;
      render();
    });
  });
  document.querySelector('#filter-input').addEventListener('input', (event) => {
    state.filters.faturas = event.target.value;
    state.pages.faturas = 1;
    scheduleFilterRender();
  });
  bindPagination('faturas');
  document.querySelectorAll('[data-pay]').forEach((button) => button.addEventListener('click', () => openInvoicePayForm(button.dataset.pay)));
  document.querySelectorAll('[data-partial]').forEach((button) => button.addEventListener('click', () => openInvoicePartialForm(button.dataset.partial)));
  document.querySelectorAll('[data-repass]').forEach((button) => button.addEventListener('click', () => updateInvoice(button.dataset.repass, 'repassar')));
  document.querySelectorAll('[data-undo]').forEach((button) => button.addEventListener('click', () => updateInvoice(button.dataset.undo, 'estornar')));
  document.querySelectorAll('[data-delete-invoice]').forEach((button) => button.addEventListener('click', () => deleteInvoice(button.dataset.deleteInvoice)));
}

function paymentMethodSelect(value = 'dinheiro') {
  return `<label>Forma de pagamento<select name="forma_pagamento">${paymentMethods.map(([id, label]) => `<option value="${id}" ${value === id ? 'selected' : ''}>${label}</option>`).join('')}</select></label>`;
}

function openInvoicePayForm(id) {
  const row = (state.data.faturas || []).find((item) => item.id === id);
  const today = todayInputValue();
  const modal = document.createElement('div');
  modal.className = 'modal-backdrop';
  modal.innerHTML = `
    <form class="modal compact-modal" id="pay-form">
      <header><div><h2>Quitar fatura</h2><p>Saldo a quitar: ${money.format(invoiceBalance(row || {}))}</p></div><button type="button" class="secondary" data-close>Fechar</button></header>
      <div class="form-grid">
        ${paymentMethodSelect()}
        <label>Data pagamento<input name="pago_em" type="date" value="${today}"></label>
        <label class="full">Observacao<textarea name="observacao"></textarea></label>
      </div>
      <div class="actions"><button type="button" class="secondary" data-close>Cancelar</button><button class="primary" type="submit">Quitar</button></div>
      <div class="error" id="form-error"></div>
    </form>`;
  document.body.appendChild(modal);
  modal.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', () => modal.remove()));
  modal.querySelector('#pay-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    await submitModalRequest(modal, `/api/parcelas_aluguel/${id}/baixar`, 'PUT');
    if (state.view === 'inadimplencia') await loadView('inadimplencia');
  });
}

function openInvoicePartialForm(id) {
  const row = (state.data.faturas || []).find((item) => item.id === id);
  const today = todayInputValue();
  const modal = document.createElement('div');
  modal.className = 'modal-backdrop';
  modal.innerHTML = `
    <form class="modal compact-modal" id="partial-form">
      <header><div><h2>Pagamento parcial</h2><p>Saldo atual: ${money.format(invoiceBalance(row || {}))}</p></div><button type="button" class="secondary" data-close>Fechar</button></header>
      <div class="form-grid">
        <label>Valor recebido<input name="valor" type="number" step="0.01" min="0.01" required></label>
        ${paymentMethodSelect()}
        <label>Data pagamento<input name="pago_em" type="date" value="${today}"></label>
        <label class="full">Observacao/acordo<textarea name="observacao"></textarea></label>
      </div>
      <div class="actions"><button type="button" class="secondary" data-close>Cancelar</button><button class="primary" type="submit">Aplicar parcial</button></div>
      <div class="error" id="form-error"></div>
    </form>`;
  document.body.appendChild(modal);
  modal.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', () => modal.remove()));
  modal.querySelector('#partial-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    await submitModalForm(modal, `/api/parcelas_aluguel/${id}/pagamento-parcial`);
  });
}

function openContractPartialForm() {
  const today = todayInputValue();
  const modal = document.createElement('div');
  modal.className = 'modal-backdrop';
  modal.innerHTML = `
    <form class="modal compact-modal" id="contract-partial-form">
      <header><div><h2>Pagamento parcial do contrato</h2><p>Distribui o valor nas faturas em aberto mais antigas.</p></div><button type="button" class="secondary" data-close>Fechar</button></header>
      <div class="form-grid">
        ${selectFrom('contrato_id', 'Contrato', state.data.contratos || [], '', 'codigo')}
        <label>Valor recebido<input name="valor" type="number" step="0.01" min="0.01" required></label>
        ${paymentMethodSelect()}
        <label>Data pagamento<input name="pago_em" type="date" value="${today}"></label>
        <label class="full">Observacao/acordo<textarea name="observacao" placeholder="Ex: Cliente antecipou R$ 3.200,00 do aluguel anual."></textarea></label>
      </div>
      <div class="actions"><button type="button" class="secondary" data-close>Cancelar</button><button class="primary" type="submit">Distribuir pagamento</button></div>
      <div class="error" id="form-error"></div>
    </form>`;
  document.body.appendChild(modal);
  modal.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', () => modal.remove()));
  modal.querySelector('#contract-partial-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const contratoId = form.get('contrato_id');
    if (!contratoId) {
      modal.querySelector('#form-error').textContent = 'Selecione um contrato.';
      return;
    }
    await submitModalForm(modal, `/api/contratos/${contratoId}/pagamento-parcial`);
  });
}

function openLooseInvoiceForm() {
  const modal = document.createElement('div');
  modal.className = 'modal-backdrop';
  modal.innerHTML = `
    <form class="modal compact-modal" id="loose-invoice-form">
      <header><div><h2>Fatura avulsa</h2><p>Cobre acordo, taxa, IPTU extra, diferenca ou outra cobranca eventual.</p></div><button type="button" class="secondary" data-close>Fechar</button></header>
      <div class="form-grid">
        ${selectFrom('contrato_id', 'Contrato', state.data.contratos || [], '', 'codigo')}
        <label>Categoria<select name="categoria"><option value="ACORDO">Acordo</option><option value="ALUGUEL">Aluguel avulso</option><option value="IPTU">IPTU</option><option value="TAXA">Taxa</option><option value="MANUTENCAO">Manutencao</option><option value="OUTROS">Outros</option></select></label>
        <label>Valor<input name="valor" type="number" step="0.01" min="0.01" required></label>
        <label>Parcelas<input name="parcelas" type="number" min="1" step="1" value="1"></label>
        <label>Valor repasse<input name="valor_repasse" type="number" step="0.01" min="0"></label>
        <label>Competencia<input name="competencia" type="date"></label>
        <label>Vencimento<input name="vencimento" type="date" required></label>
        <label class="full">Descricao<input name="descricao" type="text" placeholder="Ex: Acordo aluguel anual - entrada parcial"></label>
        <label class="full">Observacao<textarea name="observacao"></textarea></label>
      </div>
      <div class="actions"><button type="button" class="secondary" data-close>Cancelar</button><button class="primary" type="submit">Gerar fatura</button></div>
      <div class="error" id="form-error"></div>
    </form>`;
  document.body.appendChild(modal);
  modal.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', () => modal.remove()));
  modal.querySelector('#loose-invoice-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const contratoId = form.get('contrato_id');
    if (!contratoId) {
      modal.querySelector('#form-error').textContent = 'Selecione um contrato.';
      return;
    }
    await submitModalForm(modal, `/api/contratos/${contratoId}/fatura-avulsa`);
  });
}

function openChargeActionForm(id) {
  const modal = document.createElement('div');
  modal.className = 'modal-backdrop';
  modal.innerHTML = `
    <form class="modal compact-modal" id="charge-form">
      <header><div><h2>Registrar acao de cobranca</h2><p>Historico operacional da inadimplencia.</p></div><button type="button" class="secondary" data-close>Fechar</button></header>
      <div class="form-grid">
        <label>Tipo<select name="tipo"><option value="whatsapp">WhatsApp</option><option value="telefone">Telefone</option><option value="email">E-mail</option><option value="presencial">Presencial</option><option value="acordo">Acordo</option><option value="juridico">Juridico</option><option value="observacao">Observacao</option></select></label>
        <label>Status<select name="status"><option value="enviado">Enviado</option><option value="sem_resposta">Sem resposta</option><option value="prometeu_pagar">Prometeu pagar</option><option value="pago">Pago</option><option value="negociacao">Negociacao</option><option value="encaminhado_juridico">Encaminhado juridico</option></select></label>
        <label>Proxima acao<input name="proxima_acao_em" type="datetime-local"></label>
        <label class="full">Observacao<textarea name="observacao"></textarea></label>
      </div>
      <div class="actions"><button type="button" class="secondary" data-close>Cancelar</button><button class="primary" type="submit">Salvar</button></div><div class="error" id="form-error"></div>
    </form>`;
  document.body.appendChild(modal);
  modal.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', () => modal.remove()));
  modal.querySelector('#charge-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    await submitModalRequest(modal, `/api/inadimplencia/${id}/acao`, 'POST');
    await loadView('inadimplencia');
  });
}

function openNegotiateForm(id) {
  const modal = document.createElement('div');
  modal.className = 'modal-backdrop';
  modal.innerHTML = `
    <form class="modal compact-modal" id="negotiate-form">
      <header><div><h2>Negociar fatura</h2><p>Registra acordo sem apagar valores anteriores.</p></div><button type="button" class="secondary" data-close>Fechar</button></header>
      <div class="form-grid">
        <label>Desconto<input name="desconto" type="number" min="0" step="0.01" value="0"></label>
        <label>Nova data<input name="nova_data" type="date"></label>
        <label>Proxima acao<input name="proxima_acao_em" type="datetime-local"></label>
        <label class="full">Motivo<input name="motivo" type="text"></label>
        <label class="full">Observacao<textarea name="observacao"></textarea></label>
      </div>
      <div class="actions"><button type="button" class="secondary" data-close>Cancelar</button><button class="primary" type="submit">Salvar negociacao</button></div><div class="error" id="form-error"></div>
    </form>`;
  document.body.appendChild(modal);
  modal.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', () => modal.remove()));
  modal.querySelector('#negotiate-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    await submitModalRequest(modal, `/api/inadimplencia/${id}/negociar`, 'POST');
    await loadView('inadimplencia');
  });
}

async function openWhatsapp(id) {
  const data = await api(`/api/inadimplencia/${id}/whatsapp`);
  if (data.url) window.open(data.url, '_blank');
  else alert(data.message || 'Locatario sem WhatsApp/telefone cadastrado.');
}

async function openTransferComposition(id) {
  const data = await api(`/api/repasses/${id}/composicao`);
  const modal = document.createElement('div');
  modal.className = 'modal-backdrop';
  modal.innerHTML = `
    <div class="modal">
      <header><div><h2>Composicao do repasse</h2><p>${data.parcelas.length} fatura(s), ${data.despesas.length} despesa(s)</p></div><button type="button" class="secondary" data-close>Fechar</button></header>
      <div class="table-wrap"><table><thead><tr><th>Contrato</th><th>Imovel</th><th>Competencia</th><th>Recebido</th><th>Taxa adm.</th><th>Liquido</th></tr></thead><tbody>${data.parcelas.map((p) => `<tr><td>${escapeHtml(p.contrato_codigo)}</td><td>${escapeHtml(p.imovel_titulo)}</td><td>${date(p.competencia)}</td><td>${money.format(Number(p.valor_pago || 0))}</td><td>${money.format(Number(p.totais_repasse.taxa_administracao || 0))}</td><td>${money.format(Number(p.totais_repasse.liquido || 0))}</td></tr>`).join('')}</tbody></table></div>
      <section class="grid metrics report-summary">${metric('Recebido', money.format(Number(data.totals.recebido || 0)))}${metric('Taxas', money.format(Number(data.totals.taxa || 0)))}${metric('Despesas', money.format(Number(data.totals.despesas || 0)))}${metric('Liquido', money.format(Number(data.totals.liquido || 0)))}</section>
    </div>`;
  document.body.appendChild(modal);
  modal.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', () => modal.remove()));
}

async function markTransfer(id) {
  if (!confirm('Confirmar repasse? Esta acao marca parcelas e despesas como repassadas.')) return;
  const result = await api(`/api/repasses/${id}/marcar`, { method: 'POST', body: JSON.stringify({ forma_pagamento: 'PIX' }) });
  window.open(`/api/repasses/${result.id}/demonstrativo`, '_blank');
  await loadView('repasses');
}

function openAdjustmentForm(id) {
  const modal = document.createElement('div');
  modal.className = 'modal-backdrop';
  modal.innerHTML = `
    <form class="modal compact-modal" id="adjustment-form">
      <header><div><h2>Aplicar reajuste</h2><p>Informe o percentual manualmente. Parcelas pagas/canceladas nao serao alteradas.</p></div><button type="button" class="secondary" data-close>Fechar</button></header>
      <div class="form-grid">
        <label>Percentual %<input name="percentual" type="number" step="0.0001" required></label>
        <label>Data-base<input name="data_base" type="date" value="${todayInputValue()}"></label>
        <label>Proximo reajuste<input name="proximo_reajuste" type="date"></label>
        <label class="full">Observacao<textarea name="observacao"></textarea></label>
      </div>
      <div class="actions"><button type="button" class="secondary" id="simulate-adjustment">Simular</button><button class="primary" type="submit">Aplicar</button></div><div class="error" id="form-error"></div>
      <div id="adjustment-preview"></div>
    </form>`;
  document.body.appendChild(modal);
  modal.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', () => modal.remove()));
  modal.querySelector('#simulate-adjustment').addEventListener('click', async () => {
    const payload = Object.fromEntries(new FormData(modal.querySelector('form')).entries());
    const preview = await api(`/api/reajustes/${id}/simular`, { method: 'POST', body: JSON.stringify(payload) });
    modal.querySelector('#adjustment-preview').innerHTML = `<p>Valor novo: <b>${money.format(Number(preview.valor_novo || 0))}</b> | Parcelas futuras afetadas: <b>${preview.parcelas_futuras}</b></p>`;
  });
  modal.querySelector('#adjustment-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!confirm('Confirmar aplicacao do reajuste?')) return;
    await submitModalRequest(modal, `/api/reajustes/${id}/aplicar`, 'POST');
    await loadView('reajustes');
  });
}

async function postponeAdjustment(id) {
  const nova_data = prompt('Nova data do reajuste (AAAA-MM-DD):');
  if (!nova_data) return;
  const motivo = prompt('Motivo do adiamento:') || '';
  await api(`/api/reajustes/${id}/adiar`, { method: 'POST', body: JSON.stringify({ nova_data, motivo }) });
  await loadView('reajustes');
}

async function submitModalForm(modal, endpoint) {
  await submitModalRequest(modal, endpoint, 'POST');
}

async function submitModalRequest(modal, endpoint, method) {
  const form = modal.querySelector('form');
  const payload = Object.fromEntries(new FormData(form).entries());
  for (const key of Object.keys(payload)) {
    if (payload[key] === '') payload[key] = null;
  }
  try {
    await api(endpoint, { method, body: JSON.stringify(payload) });
    modal.remove();
    if (state.view === 'faturas') state.data.faturas = await api('/api/parcelas_aluguel');
    render();
  } catch (error) {
    modal.querySelector('#form-error').textContent = error.message;
  }
}

async function updateInvoice(id, action) {
  await api(`/api/parcelas_aluguel/${id}/${action}`, { method: 'PUT', body: '{}' });
  state.data.faturas = await api('/api/parcelas_aluguel');
  render();
}

async function deleteInvoice(id) {
  if (!confirm('Excluir esta fatura? Esta acao nao pode ser desfeita.')) return;
  await api(`/api/parcelas_aluguel/${id}`, { method: 'DELETE' });
  state.data.faturas = await api('/api/parcelas_aluguel');
  render();
}

function openForm(name, item = {}) {
  const config = modules[name];
  const modal = document.createElement('div');
  modal.className = 'modal-backdrop';
  modal.innerHTML = `
    <form class="modal" id="record-form">
      <header><div><h2>${item.id ? 'Editar' : 'Adicionar'} ${config.title}</h2><p>${config.subtitle}</p></div><button type="button" class="secondary" data-close>Fechar</button></header>
      <div class="form-grid">${config.fields.map((field) => inputTemplate(field, item)).join('')}</div>
      <div class="actions"><button type="button" class="secondary" data-close>Cancelar</button><button class="primary" type="submit">Salvar</button></div>
      <div class="error" id="form-error"></div>
    </form>
  `;
  document.body.appendChild(modal);
  bindCepLookup(modal, name);
  if (name === 'contratos') {
    bindContractRentAutofill(modal);
    bindContractTemplateAutofill(modal, item);
  }
  modal.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', () => modal.remove()));
  modal.querySelector('#record-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
    for (const [key, value] of Object.entries(payload)) {
      if (value === '') payload[key] = null;
    }
    config.fields.filter((field) => field[2] === 'checkbox').forEach(([key]) => {
      payload[key] = Boolean(payload[key]);
    });
    config.fields.filter((field) => field[2] === 'multi').forEach(([key]) => {
      payload[key] = [...modal.querySelectorAll(`[name="${key}"]:checked`)].map((input) => input.value).join(', ');
    });
    try {
      await api(item.id ? `${config.endpoint}/${item.id}` : config.endpoint, {
        method: item.id ? 'PUT' : 'POST',
        body: JSON.stringify(payload),
      });
      modal.remove();
      state.data[name] = await api(config.endpoint);
      if (['pessoas', 'imoveis', 'contratos'].includes(name)) state.data = { ...state.data, pessoas: null, imoveis: null, contratos: null };
      await loadDependencies();
      render();
    } catch (error) {
      modal.querySelector('#form-error').textContent = error.message;
    }
  });
}

function bindContractRentAutofill(modal) {
  const imovelSelect = modal.querySelector('[name="imovel_id"]');
  const rentInput = modal.querySelector('[name="valor_aluguel"]');
  if (!imovelSelect || !rentInput) return;

  const applyRent = (force = false) => {
    const imovel = (state.data.imoveis || []).find((row) => row.id === imovelSelect.value);
    const value = imovel?.valor_aluguel;
    if (value === null || value === undefined || value === '') {
      if (force) rentInput.value = '';
      return;
    }
    if (force || !rentInput.value) rentInput.value = String(value);
  };

  imovelSelect.addEventListener('change', () => applyRent(true));
  applyRent(false);
}

function bindContractTemplateAutofill(modal, item = {}) {
  const locatarioSelect = modal.querySelector('[name="locatario_id"]');
  const notesField = modal.querySelector('[name="observacoes"]');
  if (!locatarioSelect || !notesField || item.id) return;

  const applyTemplate = () => {
    if (notesField.value) return;
    const locatarioId = locatarioSelect.value;
    if (!locatarioId) return;

    const previous = (state.data.contratos || []).find((contrato) => contrato.locatario_id === locatarioId && contrato.observacoes);
    if (previous?.observacoes) notesField.value = previous.observacoes;
  };

  locatarioSelect.addEventListener('change', applyTemplate);
  applyTemplate();
}

function inputTemplate([name, label, type, options], item) {
  const value = item[name] ?? '';
  const full = ['textarea', 'multi'].includes(type) ? ' full' : '';
  if (name === 'codigo') return `<label>${label}<input name="${name}" type="text" value="${escapeHtml(value)}" placeholder="Automatico" readonly></label>`;
  if (type === 'textarea') return `<label class="${full}">${label}<textarea name="${name}">${escapeHtml(value)}</textarea></label>`;
  if (type === 'select') return `<label>${label}<select name="${name}">${options.map((option) => {
    const optionValue = Array.isArray(option) ? option[0] : option;
    const optionLabel = Array.isArray(option) ? option[1] : labelize(optionValue);
    return `<option value="${optionValue}" ${value === optionValue ? 'selected' : ''}>${escapeHtml(optionLabel)}</option>`;
  }).join('')}</select></label>`;
  if (type === 'property') return selectFrom(name, label, state.data.imoveis || [], value, 'titulo');
  if (type.startsWith('person')) {
    const personType = type.split(':')[1];
    const people = personType ? (state.data.pessoas || []).filter((person) => person.tipo === personType) : state.data.pessoas || [];
    return selectFrom(name, label, people, value, 'nome');
  }
  if (type === 'checkbox') return `<label class="check"><input name="${name}" type="checkbox" ${value ? 'checked' : ''}>${label}</label>`;
  if (type === 'cep') return `<label>${label}<input name="${name}" type="text" inputmode="numeric" autocomplete="postal-code" value="${escapeHtml(value)}" placeholder="Digite o CEP"></label>`;
  if (type === 'multi') {
    const selected = String(value || '').split(',').map((item) => item.trim());
    return `<fieldset class="checks ${full}"><legend>${label}</legend>${options.map((option) => `<label><input name="${name}" value="${escapeHtml(option)}" type="checkbox" ${selected.includes(option) ? 'checked' : ''}>${option}</label>`).join('')}</fieldset>`;
  }
  const inputValue = type === 'datetime-local' && value ? String(value).slice(0, 16) : value;
  return `<label>${label}<input name="${name}" type="${type}" value="${escapeHtml(inputValue)}"></label>`;
}

function bindCepLookup(modal, moduleName) {
  const cepInput = modal.querySelector('[name="cep"]');
  if (!cepInput) return;
  let lastCep = '';
  let timer;

  cepInput.addEventListener('input', () => {
    cepInput.value = formatCep(cepInput.value);
    const cep = cepInput.value.replace(/\D/g, '');
    clearTimeout(timer);
    if (cep.length !== 8 || cep === lastCep) return;
    timer = setTimeout(async () => {
      lastCep = cep;
      await lookupCep(modal, moduleName, cep);
    }, 250);
  });
}

async function lookupCep(modal, moduleName, cep) {
  const error = modal.querySelector('#form-error');
  try {
    const data = await api(`/api/cep/${cep}`);
    const fullAddress = [data.logradouro, data.bairro, data.cidade, data.uf].filter(Boolean).join(', ');
    setField(modal, 'logradouro', data.logradouro);
    setField(modal, 'endereco', moduleName === 'imoveis' ? data.logradouro : fullAddress);
    setField(modal, 'bairro', data.bairro);
    setField(modal, 'cidade', data.cidade);
    setField(modal, 'uf', data.uf);
    if (moduleName === 'pessoas') setField(modal, 'endereco_correspondencia', fullAddress);
    if (error) error.textContent = '';
  } catch (err) {
    if (error) error.textContent = err.message;
  }
}

function setField(root, name, value) {
  const field = root.querySelector(`[name="${name}"]`);
  if (field && value && !field.value) field.value = value;
}

function formatCep(value) {
  const digits = String(value || '').replace(/\D/g, '').slice(0, 8);
  return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
}

function selectFrom(name, label, rows, value, textField) {
  return `<label>${label}<select name="${name}"><option value="">Selecione</option>${rows.map((row) => `<option value="${row.id}" ${value === row.id ? 'selected' : ''}>${escapeHtml(row.codigo ? `${row.codigo} - ${row[textField] || row.nome}` : row[textField] || row.nome)}</option>`).join('')}</select></label>`;
}

async function removeRecord(name, id) {
  if (!confirm('Excluir este registro?')) return;
  await api(`${modules[name].endpoint}/${id}`, { method: 'DELETE' });
  state.data[name] = await api(modules[name].endpoint);
  render();
}

async function generateInstallments(id) {
  const result = await api(`/api/contratos/${id}/gerar-parcelas`, { method: 'POST', body: '{}' });
  alert(`${result.total} fatura(s) gerada(s).`);
}

function paginatedRows(key, rows) {
  const totalPages = Math.max(Math.ceil(rows.length / pageSize), 1);
  const current = Math.min(Math.max(Number(state.pages[key] || 1), 1), totalPages);
  state.pages[key] = current;
  const start = (current - 1) * pageSize;
  return rows.slice(start, start + pageSize);
}

function paginationTemplate(key, totalRows) {
  if (totalRows <= pageSize) return '';
  const totalPages = Math.ceil(totalRows / pageSize);
  const current = Math.min(Math.max(Number(state.pages[key] || 1), 1), totalPages);
  const start = (current - 1) * pageSize + 1;
  const end = Math.min(current * pageSize, totalRows);
  return `
    <div class="pagination">
      <span>Mostrando ${start}-${end} de ${totalRows}</span>
      <div class="row-actions">
        <button class="secondary" data-page-key="${key}" data-page="${current - 1}" ${current <= 1 ? 'disabled' : ''}>Anterior</button>
        <span>Pagina ${current} de ${totalPages}</span>
        <button class="secondary" data-page-key="${key}" data-page="${current + 1}" ${current >= totalPages ? 'disabled' : ''}>Proxima</button>
      </div>
    </div>
  `;
}

function bindPagination(key) {
  document.querySelectorAll(`[data-page-key="${key}"]`).forEach((button) => {
    button.addEventListener('click', () => {
      state.pages[key] = Number(button.dataset.page || 1);
      render();
    });
  });
}

function formatValue(column, value) {
  if (value === null || value === undefined || value === '') return '-';
  if (column === 'qualidade') return propertyQualityBadge(value);
  if (['valor', 'valor_aluguel', 'valor_venda', 'condominio', 'iptu', 'renda'].includes(column)) return money.format(Number(value));
  if (column === 'status' || column === 'etapa') return `<span class="tag status-${value}">${labelize(value)}</span>`;
  if (String(value).match(/^\d{4}-\d{2}-\d{2}/)) return date(value);
  return escapeHtml(value);
}

function formatReportValue(column, value) {
  if (value === null || value === undefined || value === '') return '-';
  if (String(value).match(/^\d{4}-\d{2}-\d{2}/)) return date(value);
  if (isMoneyColumn(column)) return money.format(Number(value || 0));
  return escapeHtml(value);
}

function date(value) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}

function badges(value) {
  return String(value || '').split(',').map((item) => item.trim()).filter(Boolean).map((item) => `<span class="tag">${escapeHtml(item)}</span>`).join(' ');
}

function labelize(value) {
  return String(value || '').replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function propertyQuality(row) {
  const checks = [
    ['proprietario_id', 'proprietario'],
    ['titulo', 'titulo'],
    ['tipo', 'tipo'],
    ['finalidade', 'finalidade'],
    ['status', 'status'],
    ['endereco', 'endereco'],
    ['bairro', 'bairro'],
    ['cidade', 'cidade'],
    ['valor', 'valor comercial'],
    ['chaves_local', 'local das chaves'],
  ];
  const missing = checks.filter(([key]) => {
    if (key === 'valor') return Number(row.valor_aluguel || 0) <= 0 && Number(row.valor_venda || 0) <= 0;
    return !String(row[key] || '').trim();
  }).map(([, label]) => label);
  const score = Math.round(((checks.length - missing.length) / checks.length) * 100);
  return { score, missing };
}

function propertyQualityBadge(row) {
  const quality = propertyQuality(row);
  const cls = quality.score >= 80 ? 'status-paga' : quality.score >= 60 ? 'status-reservado' : 'status-atrasada';
  return `<span class="tag ${cls}">${quality.score}%</span>`;
}

function slugify(value) {
  return normalize(value).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'relatorio';
}

function normalize(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
}

boot().catch((error) => {
  document.querySelector('#app').innerHTML = `<section class="login"><div class="login-panel"><h1>IGS Imob PRO</h1><p>${error.message}</p></div></section>`;
});
