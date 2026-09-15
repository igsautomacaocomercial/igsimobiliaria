CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SEQUENCE IF NOT EXISTS recibo_numero_seq START WITH 20000;
CREATE SEQUENCE IF NOT EXISTS pessoa_codigo_seq START WITH 1;
CREATE SEQUENCE IF NOT EXISTS imovel_codigo_seq START WITH 1;
CREATE SEQUENCE IF NOT EXISTS contrato_codigo_seq START WITH 1;

CREATE TABLE IF NOT EXISTS usuarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  senha_hash TEXT NOT NULL,
  perfil TEXT NOT NULL DEFAULT 'admin',
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pessoas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  tipo TEXT NOT NULL,
  cpf_cnpj TEXT,
  email TEXT,
  telefone TEXT,
  whatsapp TEXT,
  endereco TEXT,
  observacoes TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS imoveis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo TEXT NOT NULL UNIQUE,
  titulo TEXT NOT NULL,
  tipo TEXT NOT NULL,
  finalidade TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'disponivel',
  proprietario_id UUID REFERENCES pessoas(id) ON DELETE SET NULL,
  endereco TEXT NOT NULL,
  bairro TEXT,
  cidade TEXT,
  uf TEXT,
  valor_aluguel NUMERIC(12,2) DEFAULT 0,
  valor_venda NUMERIC(12,2) DEFAULT 0,
  condominio NUMERIC(12,2) DEFAULT 0,
  iptu NUMERIC(12,2) DEFAULT 0,
  quartos INTEGER DEFAULT 0,
  banheiros INTEGER DEFAULT 0,
  vagas INTEGER DEFAULT 0,
  area_m2 NUMERIC(12,2) DEFAULT 0,
  observacoes TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS contratos_locacao (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo TEXT NOT NULL UNIQUE,
  imovel_id UUID NOT NULL REFERENCES imoveis(id) ON DELETE RESTRICT,
  locador_id UUID REFERENCES pessoas(id) ON DELETE SET NULL,
  locatario_id UUID NOT NULL REFERENCES pessoas(id) ON DELETE RESTRICT,
  fiador_id UUID REFERENCES pessoas(id) ON DELETE SET NULL,
  inicio DATE NOT NULL,
  fim DATE NOT NULL,
  valor_aluguel NUMERIC(12,2) NOT NULL,
  vencimento_dia INTEGER NOT NULL DEFAULT 10,
  indice_reajuste TEXT DEFAULT 'IGP-M',
  garantia TEXT DEFAULT 'caucao',
  status TEXT NOT NULL DEFAULT 'ativo',
  observacoes TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS parcelas_aluguel (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_id UUID NOT NULL REFERENCES contratos_locacao(id) ON DELETE CASCADE,
  competencia DATE NOT NULL,
  vencimento DATE NOT NULL,
  valor NUMERIC(12,2) NOT NULL,
  multa NUMERIC(12,2) DEFAULT 0,
  juros NUMERIC(12,2) DEFAULT 0,
  desconto NUMERIC(12,2) DEFAULT 0,
  pago_em DATE,
  status TEXT NOT NULL DEFAULT 'aberta',
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS contas_pagar (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  descricao TEXT NOT NULL,
  categoria TEXT,
  imovel_id UUID REFERENCES imoveis(id) ON DELETE SET NULL,
  fornecedor_id UUID REFERENCES pessoas(id) ON DELETE SET NULL,
  vencimento DATE NOT NULL,
  valor NUMERIC(12,2) NOT NULL,
  pago_em DATE,
  status TEXT NOT NULL DEFAULT 'aberta',
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS contas_receber (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  descricao TEXT NOT NULL,
  categoria TEXT,
  pessoa_id UUID REFERENCES pessoas(id) ON DELETE SET NULL,
  imovel_id UUID REFERENCES imoveis(id) ON DELETE SET NULL,
  vencimento DATE NOT NULL,
  valor NUMERIC(12,2) NOT NULL,
  recebido_em DATE,
  status TEXT NOT NULL DEFAULT 'aberta',
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS repasses_proprietario (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_id UUID REFERENCES contratos_locacao(id) ON DELETE SET NULL,
  proprietario_id UUID REFERENCES pessoas(id) ON DELETE SET NULL,
  competencia DATE NOT NULL,
  valor_bruto NUMERIC(12,2) NOT NULL,
  comissao NUMERIC(12,2) NOT NULL DEFAULT 0,
  valor_repasse NUMERIC(12,2) NOT NULL,
  repassado_em DATE,
  status TEXT NOT NULL DEFAULT 'pendente',
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vistorias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  imovel_id UUID NOT NULL REFERENCES imoveis(id) ON DELETE CASCADE,
  contrato_id UUID REFERENCES contratos_locacao(id) ON DELETE SET NULL,
  tipo TEXT NOT NULL,
  data_vistoria DATE NOT NULL,
  responsavel TEXT,
  observacoes TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vistoria_fotos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vistoria_id UUID NOT NULL REFERENCES vistorias(id) ON DELETE CASCADE,
  ambiente TEXT,
  url TEXT NOT NULL,
  observacoes TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  telefone TEXT,
  email TEXT,
  interesse TEXT NOT NULL DEFAULT 'locacao',
  etapa TEXT NOT NULL DEFAULT 'novo',
  origem TEXT,
  imovel_id UUID REFERENCES imoveis(id) ON DELETE SET NULL,
  corretor_id UUID REFERENCES pessoas(id) ON DELETE SET NULL,
  observacoes TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agendamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  imovel_id UUID REFERENCES imoveis(id) ON DELETE SET NULL,
  data_hora TIMESTAMPTZ NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'visita',
  status TEXT NOT NULL DEFAULT 'marcado',
  observacoes TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS anexos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entidade TEXT NOT NULL,
  entidade_id UUID NOT NULL,
  nome_arquivo TEXT NOT NULL,
  url TEXT NOT NULL,
  tipo TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS configuracoes (
  chave TEXT PRIMARY KEY,
  valor JSONB NOT NULL,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS logs_sistema (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  acao TEXT NOT NULL,
  entidade TEXT,
  entidade_id UUID,
  detalhes JSONB,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO configuracoes (chave, valor)
VALUES
  ('imobiliaria', '{"nome":"IGS Imobiliaria","email":"","telefone":"","cidade":""}'::jsonb),
  ('financeiro', '{"multa_percentual":2,"juros_mensal_percentual":1,"comissao_percentual":10}'::jsonb)
ON CONFLICT (chave) DO NOTHING;

ALTER TABLE pessoas
  ADD COLUMN IF NOT EXISTS codigo TEXT,
  ADD COLUMN IF NOT EXISTS cep TEXT,
  ADD COLUMN IF NOT EXISTS pf_pj TEXT DEFAULT 'PF',
  ADD COLUMN IF NOT EXISTS rg_ie TEXT,
  ADD COLUMN IF NOT EXISTS nascimento DATE,
  ADD COLUMN IF NOT EXISTS naturalidade TEXT,
  ADD COLUMN IF NOT EXISTS nacionalidade TEXT,
  ADD COLUMN IF NOT EXISTS estado_civil TEXT,
  ADD COLUMN IF NOT EXISTS profissao TEXT,
  ADD COLUMN IF NOT EXISTS cargo TEXT,
  ADD COLUMN IF NOT EXISTS renda NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS origem_cliente TEXT,
  ADD COLUMN IF NOT EXISTS filiacao TEXT,
  ADD COLUMN IF NOT EXISTS referencias TEXT,
  ADD COLUMN IF NOT EXISTS endereco_correspondencia TEXT,
  ADD COLUMN IF NOT EXISTS conjuge_nome TEXT,
  ADD COLUMN IF NOT EXISTS conjuge_cpf TEXT,
  ADD COLUMN IF NOT EXISTS conjuge_rg TEXT,
  ADD COLUMN IF NOT EXISTS conjuge_telefone TEXT,
  ADD COLUMN IF NOT EXISTS conjuge_endereco TEXT,
  ADD COLUMN IF NOT EXISTS conjuge_nascimento DATE,
  ADD COLUMN IF NOT EXISTS conjuge_nacionalidade TEXT,
  ADD COLUMN IF NOT EXISTS conjuge_estado_civil TEXT,
  ADD COLUMN IF NOT EXISTS conjuge_profissao TEXT,
  ADD COLUMN IF NOT EXISTS cadastro_em DATE DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS atualizado_em TIMESTAMPTZ DEFAULT now();

ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS ultimo_login TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS trocar_senha_primeiro_acesso BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS atualizado_em TIMESTAMPTZ DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS usuarios_email_lower_idx ON usuarios (lower(email));

CREATE TABLE IF NOT EXISTS pessoa_fiadores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  locatario_id UUID NOT NULL REFERENCES pessoas(id) ON DELETE CASCADE,
  fiador_id UUID NOT NULL REFERENCES pessoas(id) ON DELETE CASCADE,
  observacoes TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (locatario_id, fiador_id)
);

ALTER TABLE imoveis
  ADD COLUMN IF NOT EXISTS cep TEXT,
  ADD COLUMN IF NOT EXISTS regiao TEXT,
  ADD COLUMN IF NOT EXISTS logradouro TEXT,
  ADD COLUMN IF NOT EXISTS numero TEXT,
  ADD COLUMN IF NOT EXISTS complemento TEXT,
  ADD COLUMN IF NOT EXISTS edificio TEXT,
  ADD COLUMN IF NOT EXISTS construtora TEXT,
  ADD COLUMN IF NOT EXISTS unidade TEXT,
  ADD COLUMN IF NOT EXISTS suites INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS salas INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS elevadores INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unidades_andar INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pavimentos INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS idade INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS posicao TEXT,
  ADD COLUMN IF NOT EXISTS area_terreno_m2 NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS agua_instalacao TEXT,
  ADD COLUMN IF NOT EXISTS energia_instalacao TEXT,
  ADD COLUMN IF NOT EXISTS telefone_instalacao TEXT,
  ADD COLUMN IF NOT EXISTS iptu_indice TEXT,
  ADD COLUMN IF NOT EXISTS chaves_local TEXT,
  ADD COLUMN IF NOT EXISTS detalhes TEXT,
  ADD COLUMN IF NOT EXISTS proximidades TEXT,
  ADD COLUMN IF NOT EXISTS outras_infos TEXT,
  ADD COLUMN IF NOT EXISTS captador_id UUID REFERENCES pessoas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sindico_id UUID REFERENCES pessoas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS administradora_id UUID REFERENCES pessoas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS disponivel_whatsapp BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS cadastro_em DATE DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS atualizado_em TIMESTAMPTZ DEFAULT now();

ALTER TABLE contratos_locacao
  ADD COLUMN IF NOT EXISTS prazo_indeterminado BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS proximo_reajuste DATE,
  ADD COLUMN IF NOT EXISTS data_aditivo DATE,
  ADD COLUMN IF NOT EXISTS proximo_aditivo DATE,
  ADD COLUMN IF NOT EXISTS data_rescisao DATE,
  ADD COLUMN IF NOT EXISTS dia_repasse INTEGER DEFAULT 10,
  ADD COLUMN IF NOT EXISTS taxa_administracao NUMERIC(7,2) DEFAULT 10,
  ADD COLUMN IF NOT EXISTS taxa_intermediacao NUMERIC(7,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS taxa_minima NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS aluguel_garantido BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS cobrar_multa BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS repassar_multa BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS cobrar_juros BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS repassar_juros BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS cobrar_iptu BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS repassar_iptu BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS descontar_irrf BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS cobranca_eletronica BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS destino TEXT DEFAULT 'residencial',
  ADD COLUMN IF NOT EXISTS responsavel TEXT;

ALTER TABLE parcelas_aluguel
  ADD COLUMN IF NOT EXISTS repasse_vencimento DATE,
  ADD COLUMN IF NOT EXISTS valor_repasse NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS iptu_valor NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS condominio_valor NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_pago NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ultimo_pagamento_em DATE,
  ADD COLUMN IF NOT EXISTS acordo_observacao TEXT,
  ADD COLUMN IF NOT EXISTS origem TEXT DEFAULT 'mensal',
  ADD COLUMN IF NOT EXISTS categoria TEXT DEFAULT 'ALUGUEL',
  ADD COLUMN IF NOT EXISTS descricao TEXT,
  ADD COLUMN IF NOT EXISTS recibo_numero INTEGER,
  ADD COLUMN IF NOT EXISTS recebido_de TEXT DEFAULT 'locatario',
  ADD COLUMN IF NOT EXISTS forma_pagamento TEXT,
  ADD COLUMN IF NOT EXISTS repassado_em DATE,
  ADD COLUMN IF NOT EXISTS estornado_em DATE,
  ADD COLUMN IF NOT EXISTS documento_personalizado TEXT,
  ADD COLUMN IF NOT EXISTS documento_personalizado_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelado_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelado_por UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS motivo_cancelamento TEXT;

CREATE TABLE IF NOT EXISTS pagamentos_parcela (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parcela_id UUID NOT NULL REFERENCES parcelas_aluguel(id) ON DELETE CASCADE,
  valor NUMERIC(12,2) NOT NULL,
  forma_pagamento TEXT NOT NULL DEFAULT 'dinheiro',
  pago_em DATE NOT NULL DEFAULT CURRENT_DATE,
  observacao TEXT,
  usuario_id UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE pagamentos_parcela
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'ativo',
  ADD COLUMN IF NOT EXISTS estornado_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS estornado_por UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS motivo_estorno TEXT;

CREATE TABLE IF NOT EXISTS emprestimos_chaves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  interessado_nome TEXT NOT NULL,
  contato TEXT,
  documento TEXT,
  imovel_id UUID REFERENCES imoveis(id) ON DELETE SET NULL,
  hora_retirada TIMESTAMPTZ NOT NULL DEFAULT now(),
  previsao_devolucao TIMESTAMPTZ,
  devolvida_em TIMESTAMPTZ,
  observacoes TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE logs_sistema
  ADD COLUMN IF NOT EXISTS dados_anteriores JSONB,
  ADD COLUMN IF NOT EXISTS dados_novos JSONB,
  ADD COLUMN IF NOT EXISTS ip TEXT,
  ADD COLUMN IF NOT EXISTS user_agent TEXT;

ALTER TABLE contas_pagar
  ADD COLUMN IF NOT EXISTS cancelado_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelado_por UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS motivo_cancelamento TEXT;

ALTER TABLE contas_receber
  ADD COLUMN IF NOT EXISTS cancelado_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelado_por UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS motivo_cancelamento TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contratos_vencimento_dia_check') THEN
    ALTER TABLE contratos_locacao ADD CONSTRAINT contratos_vencimento_dia_check CHECK (vencimento_dia BETWEEN 1 AND 31);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contratos_dia_repasse_check') THEN
    ALTER TABLE contratos_locacao ADD CONSTRAINT contratos_dia_repasse_check CHECK (dia_repasse IS NULL OR dia_repasse BETWEEN 1 AND 31);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contratos_valores_check') THEN
    ALTER TABLE contratos_locacao ADD CONSTRAINT contratos_valores_check CHECK (valor_aluguel >= 0 AND taxa_administracao >= 0 AND taxa_intermediacao >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contratos_periodo_check') THEN
    ALTER TABLE contratos_locacao ADD CONSTRAINT contratos_periodo_check CHECK (prazo_indeterminado OR fim >= inicio);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'imoveis_valores_check') THEN
    ALTER TABLE imoveis ADD CONSTRAINT imoveis_valores_check CHECK (valor_aluguel >= 0 AND valor_venda >= 0 AND condominio >= 0 AND iptu >= 0);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS parcelas_status_vencimento_idx ON parcelas_aluguel (status, vencimento);
CREATE INDEX IF NOT EXISTS contratos_status_fim_idx ON contratos_locacao (status, fim);
CREATE INDEX IF NOT EXISTS imoveis_status_idx ON imoveis (status);
CREATE INDEX IF NOT EXISTS imoveis_proprietario_idx ON imoveis (proprietario_id);
CREATE INDEX IF NOT EXISTS leads_etapa_idx ON leads (etapa);
CREATE INDEX IF NOT EXISTS emprestimos_chaves_devolvida_idx ON emprestimos_chaves (devolvida_em);
CREATE INDEX IF NOT EXISTS logs_sistema_criado_idx ON logs_sistema (criado_em);
