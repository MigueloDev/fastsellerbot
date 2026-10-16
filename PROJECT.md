# backend — Resumen

Detalle monorepo (API, pipeline, schema, contrato con el dashboard): **[`docs/PROJECT_OVERVIEW.md`](../docs/PROJECT_OVERVIEW.md)**.

Este archivo es un puntero local. Si cambia el stack o la estructura de `src/`, actualizar también el overview.

---

## Identidad

| Item | Valor |
|------|--------|
| Rol | Bot WhatsApp + API inbox + catálogo + inventario + ventas + notas de entrega + compras USDT + caja operativa + tasas + métricas + reportes (VictoriaLeads) |
| Runtime | Node ≥24, ESM |
| Package manager | **pnpm** |
| Puerto default | `3600` |
| Dev Docker | `docker compose up` desde `backend/` (Dockerfile + compose locales; no toca `deploy/`) |

Prod (VPS, no uses esto en local): desde `backend/deploy/`, `cp .env.example .env` y `docker compose up -d --build`. Compose lee **solo** `deploy/.env` (no `backend/.env`). Redis interno + Caddy `:80/:443`. Dashboard: Vercel (root `fastseller_dashboard/`). PG: Supabase.

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
  sales/         # dominio puro: paymentMethods, balance, receivablesSummary, availability, pricing, receipt, profit (+ node:test)
  cash/          # dominio puro caja: movement + applyCashMovementInTx (+ node:test)
  deliveryNotes/ # dominio puro: totals / visibleMoneyFields (+ node:test)
  customers/     # validate cedula/teléfono VE (+ node:test)
  context/       # Redis historial + pause
  storage/       # Supabase Storage (comprobantes: sales/ + compras_usdt/)
  db/            # Prisma + conversations + products + rates + stock + customers + sales + deliveryNotes + currencyPurchases + cashAccounts + metrics + reports
  server/
    routes/                # plugins por dominio + index montaje
    controllers/           # … + deliveryNotes
    fastify.js, auth.js, hooks.js, events.js, queryRange.js, fxCsv.js
prisma/
  schema.prisma
  migrations/    # … + add_delivery_notes + add_cash_accounts + add_cash_movement_reason
scripts/
  rebuild-stock.js
  stock-selfcheck.js
config/
  products.js    # catálogo estático del bot (aún no DB)
```

Dependencia HTTP: `routes → controllers → db | sales/ | cash/ | rates/ | queue/ | context/ | storage/`.

## API (Clerk salvo `/health`)

Inbox: `GET /health` · `GET /conversations` · `GET /conversations/:jid/messages` · `PATCH /conversations/:jid/status` · `POST /send`

Productos: `GET/POST /products` · `GET/PATCH/DELETE /products/:id` (soft delete; `purchasePriceUsd` requerido en create; precios USD `REF_USD`/`REF_BS` con niveles `minQty`; `minStock?`)

Inventario: `GET /stock` · `GET /products/:id/stock` · `POST /stock/movements` (batch) · `GET /stock/movements` — ledger append-only; `saleId?` / `deliveryNoteId?` en movimientos  
Los niveles traen `quantity` (físico), `committed` (reservado por ventas sin entregar) y `available = quantity − committed`; `lowStock` compara contra `available`.

Tasas: `GET /rates` → `{ bcv, binance, gap }` (Redis `rate:*` + fallback PG `exchange_rates`)

Clientes: `GET/POST /customers` · `PATCH /customers/:id` — create: `cedula` + `firstName` + `lastName`; `phone?` VE (`0414|0424|0412|0422|0416|0426` + 7 dígitos)

Ventas: `GET/POST /sales` · `GET/PATCH /sales/:id` · `POST /sales/:id/payments` (`accountId` + `receiptBase64?` WebP) · `GET /payments/:id/receipt-url` · `POST /sales/:id/deliver` · `POST /sales/:id/undeliver` · `POST /sales/:id/void` · `GET /receivables`  
Deuda en USD; precios por nivel (`minQty`, qty agregada del producto) o override `unitPriceUsd` por ítem; costo congelado en `SaleItem.unitCostUsd`; respuesta incluye `costUsd`/`profitUsd`/`marginPct`; pagos Bs congelan tasa BCV; `PAYMENT_TOLERANCE` (default 0.10). Comprobantes opcionales en bucket privado Supabase (`SUPABASE_*`). Cada pago nuevo postea ENTRADA en la cuenta de caja elegida (`Payment.amount` nativo).

Compras de divisas: `GET /currency-purchases` · `GET /currency-purchases/eligible-sales` · `POST /currency-purchases` (`saleIds[]` o alias `saleId`, `fromAccountId`, `toAccountId`, `receiptBase64?`) · `GET /currency-purchases/:id/receipt-url`  
1 trade ↔ N ventas vía `CurrencyPurchaseAllocation` (consume `bsAvailable` de cada una; USDT proporcional a Bs); N compras en el tiempo por venta OK; `profitUsd` de cierre en la allocation (`PAGADA` + sin Bs pendientes) o `stampClosingProfitIfNeeded` al liquidar; captura nueva en `compras_usdt/{purchaseId}/`. Misma tx: SALIDA Bs + ENTRADA USD (`usdtReceived` a 2 dp). Prisma/migrate: correr dentro del contenedor `bot`.

Caja operativa: `GET/POST /cash-accounts` · `GET/PATCH /cash-accounts/:id` · `POST /cash-accounts/:id/movements` (`reason` `MANUAL`\|`GASTO`\|`PRESTAMO`)  
Ledger append-only (`CashMovement` + `CashAccount.balance`); gasto/préstamo son `reason` sobre ENTRADA/SALIDA (sin tabla Expense; gancho futuro `purchaseId` en el movimiento). Seed Banesco (BS) + Binance (USD); sin backfill. Zelle/efectivo USD → Binance hasta que existan más cuentas USD.

**Entrega (`DeliveryStatus`)**: eje independiente del estado de pago. Crear una venta **reserva** stock (valida `available`, sin movimientos); el `SALIDA` se escribe solo en `/deliver`. `/undeliver` y anular una venta entregada compensan con `ENTRADA`. Anular una venta sin entregar no toca el ledger. Editar (`PATCH`) exige PENDIENTE + sin pagos + `POR_ENTREGAR`.

Notas de entrega (independientes de `Sale`): `GET/POST /delivery-notes` · `GET /delivery-notes/:id` · `POST /delivery-notes/:id/void`  
Al crear valida `available` y escribe `SALIDA` (`deliveryNoteId`); `showValue` controla si la UI/impresión muestra montos (precios igual se snapshottean). Anular → `ENTRADA` compensatorias. Número serial `NE-#####` en UI.

Reportes: `GET /reports/sales` (`?from=&to=&status=&delivery=&customerId=&paymentState=`) · `GET /reports/fx` (`?from=&to=`, conciliación Bs cobrados vs USDT) · `GET /reports/fx/csv` (`?from=&to=&mode=detail|summary`) · `GET /reports/kardex` (`?productId=` requerido `&variantId=&from=&to=`, saldo corrido por nivel) · `GET /reports/movements` (`?productId=` requerido `&from=&to=`, ledger plano del producto)

Métricas: `GET /metrics/summary?from=&to=` — home dashboard (sold / collected / receivables / byPriceRef / topProducts / salesByDay / lowStock)

Scripts: `dev`, `start`, `test`, `db:generate`, `db:migrate`, `db:migrate:deploy` (solo imagen prod), `db:push`, `db:studio`.
