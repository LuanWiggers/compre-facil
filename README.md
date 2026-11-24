# CompreFácil – Microsserviços de Pagamento e Notificação

Desafio 2 – Desenvolvimento de Sistemas Distribuídos.
Dois serviços NodeJS independentes (REST + AMQP), com Postgres e RabbitMQ via docker-compose.

## Arquitetura

```
Cliente --POST /transactions--> [payment-service] --grava--> Postgres
                                   |   |
        (II) "recebida" ---------->|   |---- (fila payments.process, interna)
                                   v   v
                        fila "notifications"      payment-service (consumer)
                                   |                   |
                                   v                   | (IV) status = sucesso
                         [notification-service] <------| (V) "confirmada"
                          (III, VI) envia notificação
```

| Serviço | Porta | Responsabilidade |
|---|---|---|
| payment-service | 3000 | REST de transações, persistência (Postgres), publica/consome filas |
| notification-service | 3001 | Consome a fila `notifications` e envia notificações (simulado em log) |
| postgres | 5432 | Banco de dados do pagamento |
| rabbitmq | 5672 / 15672 | Mensageria (painel: http://localhost:15672, guest/guest) |

Os serviços só se comunicam pela fila; nenhum chama o outro por HTTP. Cada um sobe e escala separadamente.

## Fluxo implementado

1. `POST /transactions` grava a transação com status **pendente** (I).
2. O pagamento publica `TRANSACTION_RECEIVED` na fila `notifications` (II).
3. A notificação lê a mensagem e envia a notificação de recebimento (III).
4. O pagamento (consumer da fila `payments.process`) simula o processamento (5 s), atualiza o status para **sucesso** (IV) e publica `TRANSACTION_CONFIRMED` (V).
5. A notificação lê a mensagem e envia a notificação de confirmação (VI).

A API responde `202 Accepted` imediatamente, sem esperar a confirmação.

## Como executar

Pré-requisito: Docker e Docker Compose.

```bash
docker compose up --build
```

### Testar

```bash
curl -X POST http://localhost:3000/transactions \
  -H "Content-Type: application/json" \
  -d '{"userId":"42","userEmail":"cliente@email.com","amount":199.90,"description":"Pedido #1001"}'
```

Resposta imediata com `status: "pendente"`. Depois consulte:

```bash
curl http://localhost:3000/transactions/<ID>     # status passa para "sucesso" após ~5 s
curl http://localhost:3001/notifications          # as duas notificações enviadas
```

Nos logs (`docker compose logs -f payment-service notification-service`) aparece a sequência completa.

### Rodar sem Docker nos serviços (opcional)

```bash
docker compose up postgres rabbitmq
cd payment-service && npm install && npm start        # terminal 1
cd notification-service && npm install && npm start   # terminal 2
```

### Prova de independência

```bash
docker compose stop notification-service
# envie uma transação: o pagamento continua funcionando e as mensagens ficam na fila
docker compose start notification-service
# as notificações pendentes são entregues
```

## Variáveis de ambiente

| Variável | Padrão | Serviço |
|---|---|---|
| PORT | 3000 / 3001 | ambos |
| DATABASE_URL | postgres://payment:payment@localhost:5432/payments | pagamento |
| RABBITMQ_URL | amqp://guest:guest@localhost:5672 | ambos |
| PROCESSING_DELAY_MS | 5000 | pagamento |
# compre-facil
