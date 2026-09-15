const rolePermissions = {
  ADMIN: ['*'],
  FINANCEIRO: [
    'dashboard.read', 'cep.read', 'pessoas.read', 'imoveis.read', 'contratos.read',
    'parcelas.read', 'parcelas.write', 'parcelas.delete', 'contas_receber.read', 'contas_receber.write',
    'contas_pagar.read', 'contas_pagar.write', 'relatorios.read', 'recibos.read', 'backup.read',
    'operacional.read', 'inadimplencia.read', 'inadimplencia.write', 'repasses.read', 'repasses.write',
    'reajustes.read', 'reajustes.write', 'contratos.eventos.read',
  ],
  CORRETOR: [
    'dashboard.read', 'cep.read', 'pessoas.read', 'pessoas.write', 'imoveis.read', 'imoveis.write',
    'contratos.read', 'leads.read', 'leads.write', 'relatorios.read', 'documentos.read',
    'operacional.read', 'inadimplencia.read', 'repasses.read', 'reajustes.read', 'contratos.eventos.read',
  ],
  ATENDIMENTO: [
    'dashboard.read', 'cep.read', 'pessoas.read', 'pessoas.write', 'imoveis.read',
    'leads.read', 'leads.write', 'chaves.read', 'chaves.write', 'relatorios.read',
    'operacional.read', 'inadimplencia.read', 'inadimplencia.write', 'repasses.read', 'reajustes.read', 'contratos.eventos.read',
  ],
  VISTORIADOR: ['dashboard.read', 'imoveis.read', 'relatorios.read', 'operacional.read'],
  CONSULTA: [
    'dashboard.read', 'pessoas.read', 'imoveis.read', 'contratos.read', 'parcelas.read',
    'contas_receber.read', 'contas_pagar.read', 'leads.read', 'chaves.read', 'relatorios.read',
    'recibos.read', 'documentos.read', 'operacional.read', 'inadimplencia.read', 'repasses.read',
    'reajustes.read', 'contratos.eventos.read',
  ],
};

function normalizeRole(role) {
  return String(role || 'CONSULTA').toUpperCase();
}

function can(user, permission) {
  const permissions = rolePermissions[normalizeRole(user?.perfil)] || rolePermissions.CONSULTA;
  return permissions.includes('*') || permissions.includes(permission);
}

function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.session.user) return res.status(401).json({ error: 'Sessao expirada. Faca login novamente.' });
    if (!can(req.session.user, permission)) return res.status(403).json({ error: 'Acesso negado.' });
    next();
  };
}

module.exports = {
  rolePermissions,
  normalizeRole,
  can,
  requirePermission,
};
