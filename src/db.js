const fs = require('fs/promises');
const path = require('path');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const isProduction = process.env.NODE_ENV === 'production';
const databaseUrl = process.env.DATABASE_URL || (isProduction ? null : 'postgres://igs:igs@localhost:5432/igs_imob_pro');

if (!databaseUrl) {
  throw new Error('Configure DATABASE_URL.');
}

const pool = new Pool({
  connectionString: databaseUrl,
});

async function query(text, params) {
  return pool.query(text, params);
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function assertInitialAdminConfig() {
  const email = normalizeEmail(process.env.INITIAL_ADMIN_EMAIL || (isProduction ? '' : 'admin@igs.local'));
  const password = process.env.INITIAL_ADMIN_PASSWORD || (isProduction ? '' : '123');

  if (!email || !password) {
    throw new Error('Configure INITIAL_ADMIN_EMAIL e INITIAL_ADMIN_PASSWORD.');
  }
  if (isProduction && password === '123') {
    throw new Error('INITIAL_ADMIN_PASSWORD nao pode ser 123 em producao.');
  }
  if (password.length < 8 && isProduction) {
    throw new Error('INITIAL_ADMIN_PASSWORD deve ter pelo menos 8 caracteres em producao.');
  }

  return { email, password };
}

async function initDatabase() {
  const schema = await fs.readFile(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(schema);

  const { email, password } = assertInitialAdminConfig();
  const exists = await pool.query('SELECT id FROM usuarios WHERE lower(email) = $1', [email]);

  if (exists.rowCount === 0) {
    const senhaHash = await bcrypt.hash(password, 10);
    await pool.query(
      'INSERT INTO usuarios (nome, email, senha_hash, perfil, trocar_senha_primeiro_acesso) VALUES ($1, $2, $3, $4, $5)',
      ['Administrador IGS', email, senhaHash, 'ADMIN', true]
    );
  }
}

module.exports = {
  pool,
  query,
  initDatabase,
  normalizeEmail,
};
