const express = require('express');
const amqp = require('amqplib');

const PORT = Number(process.env.PORT || 3001);
const RABBIT_URL = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672';
const QUEUE = process.env.NOTIFICATION_QUEUE || 'notifications';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Histórico em memória das notificações enviadas (consultável via REST)
const sent = [];

function buildNotification(event) {
  const valor = Number(event.amount).toFixed(2).replace('.', ',');
  const texts = {
    TRANSACTION_RECEIVED: `Recebemos sua solicitação de pagamento de R$ ${valor}. Estamos processando.`,
    TRANSACTION_CONFIRMED: `Pagamento de R$ ${valor} confirmado com sucesso!`,
  };
  return {
    id: sent.length + 1,
    transactionId: event.transactionId,
    userId: event.userId,
    to: event.userEmail || `usuário ${event.userId}`,
    type: event.type,
    message: texts[event.type] || `Atualização da transação (${event.status}).`,
    sentAt: new Date().toISOString(),
  };
}

// Simula o envio (e-mail/push/SMS) escrevendo no log
function sendNotification(event) {
  const notification = buildNotification(event);
  sent.push(notification);
  console.log(
    `[notification] ENVIADA para ${notification.to}: ${notification.message} (transação ${notification.transactionId})`
  );
}

async function startConsumer(retries = 20, delayMs = 3000) {
  for (let i = 1; i <= retries; i++) {
    try {
      const connection = await amqp.connect(RABBIT_URL);
      connection.on('close', () => {
        console.error('[notification] conexão com RabbitMQ encerrada');
        process.exit(1);
      });
      connection.on('error', (e) => console.error('[notification] erro RabbitMQ:', e.message));
      const channel = await connection.createChannel();
      await channel.assertQueue(QUEUE, { durable: true });
      channel.prefetch(1);
      await channel.consume(QUEUE, (msg) => {
        if (!msg) return;
        try {
          sendNotification(JSON.parse(msg.content.toString()));
          channel.ack(msg);
        } catch (err) {
          console.error('[notification] mensagem inválida:', err.message);
          channel.nack(msg, false, false);
        }
      });
      console.log(`[notification] RabbitMQ conectado, consumindo fila "${QUEUE}"`);
      return;
    } catch (err) {
      console.log(`[notification] aguardando RabbitMQ (${i}/${retries}): ${err.message}`);
      await sleep(delayMs);
    }
  }
  throw new Error('Não foi possível conectar ao RabbitMQ');
}

const app = express();
app.get('/health', (_req, res) => res.json({ service: 'notification', status: 'ok' }));
app.get('/notifications', (req, res) => {
  const { transactionId } = req.query;
  res.json(transactionId ? sent.filter((n) => n.transactionId === transactionId) : sent);
});

startConsumer()
  .then(() =>
    app.listen(PORT, () => console.log(`[notification] REST ouvindo na porta ${PORT}`))
  )
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
