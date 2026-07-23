import * as products from '../controllers/products.controller.js'

const priceItemSchema = {
  type: 'object',
  required: ['ref', 'amount'],
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    ref: { type: 'string', enum: ['REF_USD', 'REF_BS'] },
    amount: { type: 'number', exclusiveMinimum: 0 },
    minQty: { type: 'integer', minimum: 1, default: 1 },
    active: { type: 'boolean' },
  },
}

const variantItemSchema = {
  type: 'object',
  required: ['name'],
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    name: { type: 'string', minLength: 1 },
    sku: { type: ['string', 'null'] },
    active: { type: 'boolean' },
  },
}

const productWriteSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    name: { type: 'string', minLength: 1 },
    sku: { type: ['string', 'null'] },
    brand: { type: ['string', 'null'] },
    description: { type: ['string', 'null'] },
    active: { type: 'boolean' },
    minStock: { type: ['integer', 'null'], minimum: 0 },
    purchasePriceUsd: { type: 'number', exclusiveMinimum: 0 },
    variants: { type: 'array', items: variantItemSchema },
    prices: { type: 'array', items: priceItemSchema },
  },
}

export default async function productsRoutes(app) {
  app.get('/products', products.list)
  app.get('/products/:id', products.get)

  app.post('/products', {
    schema: {
      body: {
        ...productWriteSchema,
        required: ['name', 'purchasePriceUsd'],
      },
    },
  }, products.create)

  app.patch('/products/:id', {
    schema: { body: productWriteSchema },
  }, products.patch)

  app.delete('/products/:id', products.remove)
}
