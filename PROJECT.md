# backend — Resumen

Detalle monorepo (API, pipeline, schema, contrato con el dashboard): **[`docs/PROJECT_OVERVIEW.md`](../docs/PROJECT_OVERVIEW.md)**.

Este archivo es un puntero local. Si cambia el stack o la estructura de `src/`, actualizar también el overview.

---

## Identidad

| Item | Valor |
|------|--------|
| Rol | Bot WhatsApp + API inbox + catálogo + inventario + ventas + tasas + métricas + reportes (VictoriaLeads) |
| Runtime | Node ≥24, ESM |
| Package manager | **pnpm** |
| Puerto default | `3600` |

## Stack

| Capa | Tecnología |
|------|------------|
| WhatsApp | Baileys + `baileys-redis-auth` |
| HTTP / realtime | Fastify 5 + Socket.IO 4 |
| Cola | BullMQ + ioredis (`outbound-messages`, `exchange-rates`) |
| DB | PostgreSQL + Prisma 7 (`prisma` CLI + migraciones) |
| IA | Vercel AI SDK + Groq |
| Auth API | Clerk JWT (`verifyToken` + claims; `CLERK_JWT_KEY` PEM recomendado; sin `getUser`) |

## Estructura clave

```
src/
  baileys/       # socket WA + events
  pipeline/      # inbound
  ai/            # intent, reply, guardrails
  queue/         # outbound + rates producer/worker
  rates/         # fetch BCV/Binance, validate, store, getRates
  sales/         # dominio puro: paymentMethods, balance, receivablesSummary, availability, pricing (+ node:test)
  customers/     # validate cedula/teléfono VE (+ node:test)
  context/       # Redis historial + pause
  db/            # Prisma + conversations + products + rates + stock + customers + sales + metrics + reports
  server/
    routes/                # plugins por dominio + index montaje
    controllers/           # health, conversations, rates, products, stock, customers, sales, metrics, reports
    fastify.js, auth.js, hooks.js, events.js, queryRange.js
prisma/
  schema.prisma
  migrations/    # baseline + products + exchange_rates + stock + sales + customer_cedula_names + delivery_status
scripts/
  rebuild-stock.js
  stock-selfcheck.js
config/
  products.js    # catálogo estático del bot (aún no DB)
```

Dependencia HTTP: `routes → controllers → db | sales/ | rates/ | queue/ | context/`.

## API (Clerk salvo `/health`)

Inbox: `GET /health` · `GET /conversations` · `GET /conversations/:jid/messages` · `PATCH /conversations/:jid/status` · `POST /send`

Productos: `GET/POST /products` · `GET/PATCH/DELETE /products/:id` (soft delete; precios USD `REF_USD`/`REF_BS` con niveles `minQty`; `minStock?`)

Inventario: `GET /stock` · `GET /products/:id/stock` · `POST /stock/movements` (batch) · `GET /stock/movements` — ledger append-only; `saleId?` en movimientos  
Los niveles traen `quantity` (físico), `committed` (reservado por ventas sin entregar) y `available = quantity − committed`; `lowStock` compara contra `available`.

Tasas: `GET /rates` → `{ bcv, binance, gap }` (Redis `rate:*` + fallback PG `exchange_rates`)

Clientes: `GET/POST /customers` · `PATCH /customers/:id` — create: `cedula` + `firstName` + `lastName`; `phone?` VE (`0414|0424|0412|0422|0416|0426` + 7 dígitos)

Ventas: `GET/POST /sales` · `GET/PATCH /sales/:id` · `POST /sales/:id/payments` · `POST /sales/:id/deliver` · `POST /sales/:id/undeliver` · `POST /sales/:id/void` · `GET /receivables`  
Deuda en USD; precios por nivel (`minQty`, qty agregada del producto) o override `unitPriceUsd` por ítem; pagos Bs congelan tasa BCV; `PAYMENT_TOLERANCE` (default 0.10).

**Entrega (`DeliveryStatus`)**: eje independiente del estado de pago. Crear una venta **reserva** stock (valida `available`, sin movimientos); el `SALIDA` se escribe solo en `/deliver`. `/undeliver` y anular una venta entregada compensan con `ENTRADA`. Anular una venta sin entregar no toca el ledger. Editar (`PATCH`) exige PENDIENTE + sin pagos + `POR_ENTREGAR`.

Reportes: `GET /reports/sales` (`?from=&to=&status=&delivery=&customerId=`) · `GET /reports/kardex` (`?productId=` requerido `&variantId=&from=&to=`, saldo corrido por nivel) · `GET /reports/movements` (`?productId=` requerido `&from=&to=`, ledger plano del producto)

Métricas: `GET /metrics/summary?from=&to=` — home dashboard (sold / collected / receivables / byPriceRef / topProducts / salesByDay / lowStock)

Scripts: `dev`, `start`, `test`, `db:generate`, `db:migrate`, `db:push`, `db:studio`.
