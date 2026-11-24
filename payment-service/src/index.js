const express = require('express');
const config = require('./config');
const db = require('./db');
const rabbit = require('./rabbit');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const app = express();
app.use(express.json());

app.get('/health', (_req, res) => res.json({ service: 'payment', status: 'ok' }));

// Recebe a solicitação de transação (fluxo assíncrono)
app.post('/transactions', async (req, res) => {
  const { userId, userEmail, amount, description } = req.body || {};
  const value = Number(amount);

  if (!userId || !Number.isFinite(value) || value <= 0) {
    return res
      .status(400)
      .json({ error: 'Informe userId e amount (número maior que zero).' });
  }

  try {
    // I. armazena a transação com status pendente
    const transaction = await db.createTransaction({
      userId,
      userEmail,
      amount: value,
      description,
    });

    // II. publica mensagem para o serviço de notificação (recebimento)
    rabbit.publishNotification('TRANSACTION_RECEIVED', transaction);

    // Dispara o processamento assíncrono (IV, V)
    rabbit.publishProcessRequest(transaction);

    // Responde sem esperar a confirmação
    return res.status(202).json({
      message: 'Solicitação recebida e em processamento.',
      transaction,
    });
  } catch (err) {
    console.error('[payment] erro ao criar transação:', err);
    return res.status(500).json({ error: 'Erro interno ao criar transação.' });
  }
});

app.get('/transactions', async (_req, res) => {
  res.json(await db.listTransactions());
});

app.get('/transactions/:id', async (req, res) => {
  try {
    const transaction = await db.getTransaction(req.params.id);
    if (!transaction) return res.status(404).json({ error: 'Transação não encontrada.' });
    res.json(transaction);
  } catch (err) {
    res.status(400).json({ error: 'ID inválido.' });
  }
});

// IV. confirma a transação e V. publica a confirmação para notificação
async function processTransaction({ transactionId }) {
  console.log(`[payment] processando transação ${transactionId}...`);
  await sleep(config.processingDelayMs); // simula o processamento do pagamento
  const confirmed = await db.confirmTransaction(transactionId);
  if (!confirmed) {
    console.log(`[payment] transação ${transactionId} já processada ou inexistente`);
    return;
  }
  rabbit.publishNotification('TRANSACTION_CONFIRMED', confirmed);
  console.log(`[payment] transação ${transactionId} confirmada (sucesso)`);
}

async function main() {
  await db.init();
  await rabbit.connect();
  rabbit.consume(config.processQueue, processTransaction);
  app.listen(config.port, () =>
    console.log(`[payment] REST ouvindo na porta ${config.port}`)
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
