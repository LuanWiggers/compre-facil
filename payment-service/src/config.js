module.exports = {
  port: Number(process.env.PORT || 3000),
  databaseUrl:
    process.env.DATABASE_URL || 'postgres://payment:payment@localhost:5432/payments',
  rabbitUrl: process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672',
  // Fila consumida pelo serviço de NOTIFICAÇÃO
  notificationQueue: process.env.NOTIFICATION_QUEUE || 'notifications',
  // Fila consumida pelo próprio serviço de PAGAMENTO (processamento assíncrono)
  processQueue: process.env.PROCESS_QUEUE || 'payments.process',
  processingDelayMs: Number(process.env.PROCESSING_DELAY_MS || 5000),
};
