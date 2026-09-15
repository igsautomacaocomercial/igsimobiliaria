# IGS Imob PRO

V1 funcional de um sistema imobiliario inspirado em ERP de locacao, CRM/site de imoveis e esteira de automacao imobiliaria.

## Modulos da V1

- Login com usuario inicial `admin@igs.local` e senha `123`
- Login com administrador inicial configurado por `INITIAL_ADMIN_EMAIL` e `INITIAL_ADMIN_PASSWORD`
- Sessao persistente em PostgreSQL, perfis de acesso e troca obrigatoria de senha no primeiro acesso
- Dashboard com imoveis, contratos vencendo, atrasos e financeiro
- Indicadores de saude da carteira: ocupacao, imoveis sem proprietario, imoveis sem valor e chaves abertas
- Pessoas: locador, locatario, fiador, corretor, fornecedor e comprador, com ficha completa, documentos, filiacao, referencias e conjuge
- Imoveis: finalidade, status, valores, endereco completo, instalacoes, IPTU, chaves, caracteristicas, proximidades e manutencoes
- Contratos de locacao com dados de cobranca, repasse, reajuste, taxas, garantias e documento imprimivel
- Faturas de aluguel com baixa, estorno, repasse ao proprietario e recibo imprimivel em duas vias
- Controle de pontualidade por parcelas pagas/em aberto
- Controle de emprestimo de chaves
- Contas a receber e contas a pagar
- CRM de leads e funil
- Backup JSON das tabelas principais
- Relatorios de auditoria: carteira por bairro, imoveis sem proprietario, dados incompletos e chaves em aberto
- Central Operacional do dia com inadimplencia, repasses, reajustes, contratos vencendo e chaves abertas
- Central de Inadimplencia com calculo de multa/juros, historico de cobranca, negociacao e link de WhatsApp
- Central de Repasses com composicao por proprietario, despesas descontaveis e demonstrativo imprimivel
- Reajustes de contratos com simulacao manual, aplicacao transacional e historico de eventos

## Rodar com PostgreSQL via Docker

```bash
copy .env.example .env
docker compose up -d
npm install
npm run dev
```

Acesse `http://localhost:3000`.

Se voce ja tem PostgreSQL instalado localmente, edite o arquivo `.env` e ajuste a variavel `DATABASE_URL` com o usuario, senha, host, porta e banco corretos. Exemplo:

```bash
DATABASE_URL=postgres://usuario:senha@localhost:5432/igs_imob_pro
```

O app cria as tabelas automaticamente ao iniciar. Caso o banco ainda nao exista, crie primeiro o database `igs_imob_pro` no seu PostgreSQL.

## Seguranca e ambiente

Em producao, configure obrigatoriamente:

- `NODE_ENV=production`
- `DATABASE_URL`
- `SESSION_SECRET`
- `INITIAL_ADMIN_EMAIL`
- `INITIAL_ADMIN_PASSWORD` com pelo menos 8 caracteres
- `TRUST_PROXY=true` quando estiver atras de Cloudflare, nginx ou proxy HTTPS

O sistema nao inicia em producao com senha inicial vazia ou `123`.

## Banco PostgreSQL

O schema fica em `src/schema.sql` e cobre as tabelas principais:

- `usuarios`
- `pessoas`
- `imoveis`
- `contratos_locacao`
- `parcelas_aluguel`
- `contas_pagar`
- `contas_receber`
- `repasses_proprietario`
- `vistorias`
- `vistoria_fotos`
- `leads`
- `agendamentos`
- `anexos`
- `configuracoes`
- `logs_sistema`
- `emprestimos_chaves`
- `cobrancas_historico`
- `acordos_cobranca`
- `contrato_reajustes`
- `contrato_eventos`

## Evolucao sugerida

- V2: contrato PDF/Word
- V3: boletos/contas automaticas de aluguel
- V4: repasse de proprietario
- V5: vistoria com fotos
- V6: WhatsApp e avisos automaticos com integracao externa
- V7: relatorios PRO com exportacao PDF e filtros salvos por usuario
- V8: site/catalogo publico de imoveis
