# IGS Imob PRO

V1 funcional de um sistema imobiliario inspirado em ERP de locacao, CRM/site de imoveis e esteira de automacao imobiliaria.

## Modulos da V1

- Login com usuario inicial `admin@igs.local` e senha `123`
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

## Evolucao sugerida

- V2: contrato PDF/Word
- V3: boletos/contas automaticas de aluguel
- V4: repasse de proprietario
- V5: vistoria com fotos
- V6: WhatsApp e avisos automaticos
- V7: relatorios PRO com exportacao CSV/PDF e filtros salvos por usuario
- V8: site/catalogo publico de imoveis
