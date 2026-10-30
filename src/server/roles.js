const SELLER_EXACT = new Set([
  'GET /products',
  'GET /rates',
  'GET /rates/history',
  'GET /customers',
  'POST /customers',
  'GET /sales',
  'POST /sales',
  'GET /me',
  'GET /mobile/bootstrap',
  // Vendedor necesita elegir cuenta de caja al cobrar (misma vista que el
  // bootstrap: sin balance, solo cuentas activas). Escritura sigue vedada.
  'GET /cash-accounts',
])

const SELLER_PATTERNS = [
  { method: 'GET', re: /^\/products\/[^/]+$/ },
  { method: 'GET', re: /^\/sales\/[^/]+$/ },
  { method: 'POST', re: /^\/sales\/[^/]+\/payments$/ },
  { method: 'GET', re: /^\/payments\/[^/]+\/receipt-url$/ },
  { method: 'POST', re: /^\/sales\/[^/]+\/deliver$/ },
  { method: 'POST', re: /^\/sales\/[^/]+\/evidence$/ },
  { method: 'GET', re: /^\/sales\/[^/]+\/evidence-url$/ },
  { method: 'PATCH', re: /^\/sales\/[^/]+\/delivery$/ },
]

/**
 * @param {string} method
 * @param {string} pathname
 */
export function sellerCanAccess(method, pathname) {
  if (SELLER_EXACT.has(`${method} ${pathname}`)) return true
  return SELLER_PATTERNS.some((p) => p.method === method && p.re.test(pathname))
}

/**
 * Dueño = sellerId del staff. Ventas legacy (sellerId null) no son de nadie.
 * @param {{ sellerId?: string|null }|null|undefined} sale
 * @param {string|null|undefined} staffId
 */
export function ownsSale(sale, staffId) {
  return Boolean(staffId) && sale?.sellerId === staffId
}

/** Quita costo, gastos internos y ganancia. El vendedor arma la venta, no ve el margen. */
export function redactSaleForSeller(sale) {
  if (!sale) return sale
  const { costUsd, expensesUsd, profitUsd, marginPct, ...rest } = sale
  return {
    ...rest,
    ...(rest.charges ? { charges: rest.charges.filter((c) => c.billedToCustomer) } : {}),
    items: (rest.items ?? []).map((it) => {
      const { unitCostUsd, ...item } = it
      return item
    }),
  }
}

export function redactProductForSeller(product) {
  if (!product) return product
  const { purchasePriceUsd, ...rest } = product
  return rest
}

/** Shape de cuenta de caja que ve el vendedor: sin balance. */
export function publicCashAccount(account) {
  if (!account) return account
  const { id, alias, institution, currency, active } = account
  return { id, alias, institution, currency, active }
}
