require('dotenv').config();

const { initDatabase, pool } = require('./db');

initDatabase()
  .then(() => {
    console.log('Banco PostgreSQL inicializado com sucesso.');
  })
  .catch((error) => {
    console.error('Falha ao inicializar banco:', error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
