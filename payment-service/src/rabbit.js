const amqp = require('amqplib');
const config = require('./config');

let channel;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function connect(retries = 20, delayMs = 3000) {
  for (let i = 1; i <= retries; i++) {
    try {
      const connection = await amqp.connect(config.rabbitUrl);
      connection.on('close', () => {
        console.error('[payment] conexão com RabbitMQ encerrada');
        process.exit(1);
      });
      connection.on('error', (e) => console.error('[payment] erro RabbitMQ:', e.message));
      channel = await connection.createChannel();
      await channel.assertQueue(config.notificationQueue, { durable: true });
      await channel.assertQueue(config.processQueue, { durable: true });
      console.log('[payment] RabbitMQ conectado');
      return channel;
    } catch (err) {
      console.log(`[payment] aguardando RabbitMQ (${i}/${retries}): ${err.message}`);
      await sleep(delayMs);
    }
  }
  throw new Error('Não foi possível conectar ao RabbitMQ');
}

function publish(queue, message) {
  return channel.sendToQueue(queue, Buffer.from(JSON.stringify(message)), {
    persistent: true,
    contentType: 'application/json',
  });
}

// Publica evento para o serviço de notificação
function publishNotification(type, transaction) {
  return publish(config.notificationQueue, {
    type, // TRANSACTION_RECEIVED | TRANSACTION_CONFIRMED
    transactionId: transaction.id,
    userId: transaction.user_id,
    userEmail: transaction.user_email,
    amount: transaction.amount,
    status: transaction.status,
    occurredAt: new Date().toISOString(),
  });
}

// Fila interna: dispara o processamento assíncrono da transação
function publishProcessRequest(transaction) {
  return publish(config.processQueue, { transactionId: transaction.id });
}

function consume(queue, handler) {
  channel.prefetch(1);
  return channel.consume(queue, async (msg) => {
    if (!msg) return;
    try {
      await handler(JSON.parse(msg.content.toString()));
      channel.ack(msg);
    } catch (err) {
      console.error(`[payment] erro ao processar mensagem de ${queue}:`, err.message);
      channel.nack(msg, false, false);
    }
  });
}

module.exports = { connect, publishNotification, publishProcessRequest, consume };
