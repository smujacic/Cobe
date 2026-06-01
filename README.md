# Order Processing API

A small REST API that accepts orders, persists them to PostgreSQL, and processes them asynchronously via a background worker using BullMQ and Redis.

## How to run

**Prerequisites:** Docker and Docker Compose

```bash
cp .env.example .env
docker compose up --build
```

This starts PostgreSQL, Redis, the API server, and the worker. Migrations run automatically on API startup.

API is available at `http://localhost:3000`  
Swagger UI at `http://localhost:3000/docs`

### Running locally (without Docker)

```bash
cp .env.example .env
# Start only infrastructure
docker compose up postgres redis

npm install
npm run migrate
npm run dev        # API server
npm run worker     # background worker (separate terminal)
```

### Running tests

Tests require the infrastructure to be running.

```bash
docker compose up postgres redis
npm test
```

## Order flow

```
POST /orders              → creates order (status: PENDING)
POST /orders/:id/items    → add items (only while PENDING)
DELETE /orders/:id/items/:itemId → remove item (only while PENDING)
POST /orders/:id/checkout → submits for processing (status: IN_PROGRESS)
POST /orders/:id/cancel   → cancels order

Worker picks up IN_PROGRESS orders → COMPLETED or ERROR (3 attempts)
```

## API endpoints

| Method   | Path                            | Description                                    |
| -------- | ------------------------------- | ---------------------------------------------- |
| `GET`    | `/api/orders`                   | List orders (filter by `status`, `customerId`) |
| `POST`   | `/api/orders`                   | Create order                                   |
| `GET`    | `/api/orders/:id`               | Get order with items and customer              |
| `PUT`    | `/api/orders/:id`               | Update order note                              |
| `POST`   | `/api/orders/:id/items`         | Add item to order                              |
| `DELETE` | `/api/orders/:id/items/:itemId` | Remove item from order                         |
| `POST`   | `/api/orders/:id/checkout`      | Submit order for processing                    |
| `POST`   | `/api/orders/:id/cancel`        | Cancel order                                   |
| `GET`    | `/api/customers`                | List customers                                 |
| `POST`   | `/api/customers`                | Create customer                                |
| `GET`    | `/api/customers/:id`            | Get customer                                   |
| `PUT`    | `/api/customers/:id`            | Update customer                                |
| `DELETE` | `/api/customers/:id`            | Soft delete customer                           |
| `GET`    | `/api/products`                 | List products                                  |
| `POST`   | `/api/products`                 | Create product                                 |
| `GET`    | `/api/products/:id`             | Get product                                    |
| `PUT`    | `/api/products/:id`             | Update product                                 |
| `DELETE` | `/api/products/:id`             | Soft delete product                            |

## Trade-offs

**Order creation flow vs. single-request creation**  
The task described `POST /orders` with items and quantities in a single request. Instead, order creation is split into separate steps (create → add items → checkout), which maps better to how real e-commerce flows work — a customer builds a cart before submitting. This makes the API more flexible at the cost of requiring more requests.

**Worker picks up `IN_PROGRESS`, not `PENDING`**  
The task described a worker that picks up `PENDING` orders. In this implementation, `PENDING` means the order is still being built by the customer. The `checkout` endpoint transitions to `IN_PROGRESS` and enqueues a BullMQ job, which the worker then processes. This prevents the worker from touching an order the customer is still modifying.

**BullMQ push pattern vs. DB polling**  
Rather than polling the database for orders to process, the checkout endpoint pushes a job to BullMQ (Redis-backed). This avoids polling overhead and gives immediate processing. The trade-off is a potential inconsistency if Redis is unavailable at checkout time — the order would be stuck as `IN_PROGRESS` with no queued job. A comment in the code notes this; the mitigation would be a periodic cron job to re-enqueue stuck orders.

**No authentication**  
Authentication and authorization are not implemented due to time constraints. In a production setting, all endpoints would require an auth layer — likely JWT-based with role separation between customers and internal services.

## What I would do differently with more time

- **Dedicated test database** — spin up a separate database for tests, isolated from development data
- **Authentication** — JWT or API key middleware
- **Rate limiting** — protect endpoints from abuse
- **Structured logging** — attach `orderId`, `customerId` to log context for easier tracing
- **Metrics** — track order processing times, failure rates, queue depth
