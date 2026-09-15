const fs = require('fs/promises');
const path = require('path');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const databaseUrl = process.env.DATABASE_URL || 'postgres://igs:igs@localhost:5432/igs_imob_pro';

const pool = new Pool({
  connectionString: databaseUrl,
});

async function query(text, params) {
  return pool.query(text, params);
}

async function initDatabase() {
  const schema = await fs.readFile(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(schema);

  const email = process.env.INITIAL_ADMIN_EMAIL || 'admin@igs.local';
  const password = process.env.INITIAL_ADMIN_PASSWORD || '123';
  const exists = await pool.query('SELECT id FROM usuarios WHERE email = $1', [email]);

  if (exists.rowCount === 0) {
    const senhaHash = await bcrypt.hash(password, 10);
    await pool.query(
      'INSERT INTO usuarios (nome, email, senha_hash, perfil) VALUES ($1, $2, $3, $4)',
      ['Administrador IGS', email, senhaHash, 'admin']
    );
  }
}

module.exports = {
  pool,
  query,
  initDatabase,
};
