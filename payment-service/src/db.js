const { Pool } = require('pg');
const config = require('./config');

const pool = new Pool({ connectionString: config.databaseUrl });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function init(retries = 20, delayMs = 3000) {
  for (let i = 1; i <= retries; i++) {
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS transactions (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id TEXT NOT NULL,
          user_email TEXT,
          amount NUMERIC(12,2) NOT NULL,
          description TEXT,
          status TEXT NOT NULL DEFAULT 'pendente',
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
      console.log('[payment] Postgres conectado e tabela pronta');
      return;
    } catch (err) {
      console.log(`[payment] aguardando Postgres (${i}/${retries}): ${err.message}`);
      await sleep(delayMs);
    }
  }
  throw new Error('Não foi possível conectar ao Postgres');
}

async function createTransaction({ userId, userEmail, amount, description }) {
  const { rows } = await pool.query(
    `INSERT INTO transactions (user_id, user_email, amount, description, status)
     VALUES ($1, $2, $3, $4, 'pendente') RETURNING *`,
    [userId, userEmail || null, amount, description || null]
  );
  return rows[0];
}

// Só confirma se ainda estiver pendente (idempotente contra mensagens duplicadas)
async function confirmTransaction(id) {
  const { rows } = await pool.query(
    `UPDATE transactions SET status = 'sucesso', updated_at = now()
     WHERE id = $1 AND status = 'pendente' RETURNING *`,
    [id]
  );
  return rows[0] || null;
}

async function getTransaction(id) {
  const { rows } = await pool.query('SELECT * FROM transactions WHERE id = $1', [id]);
  return rows[0] || null;
}

async function listTransactions() {
  const { rows } = await pool.query(
    'SELECT * FROM transactions ORDER BY created_at DESC LIMIT 100'
  );
  return rows;
}

module.exports = { init, createTransaction, confirmTransaction, getTransaction, listTransactions };
