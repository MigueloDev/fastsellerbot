import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'node:crypto'

const DEFAULT_BUCKET = 'payment-receipts'
const SIGNED_URL_TTL_SEC = 60

let _client = null

function env(name) {
  const v = process.env[name]
  if (!v?.trim()) throw new Error(`Falta ${name} en el entorno`)
  return v.trim()
}

function bucketName() {
  return process.env.SUPABASE_PAYMENT_RECEIPTS_BUCKET?.trim() || DEFAULT_BUCKET
}

function supabase() {
  if (_client) return _client
  _client = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return _client
}

/**
 * @param {string} path
 * @param {Buffer} buffer
 * @param {string} contentType
 * @returns {Promise<string>} storage path
 */
async function uploadReceipt(path, buffer, contentType) {
  const { error } = await supabase().storage.from(bucketName()).upload(path, buffer, {
    contentType,
    upsert: false,
  })
  if (error) {
    throw new Error(`Error subiendo comprobante: ${error.message}`)
  }
  return path
}

/**
 * @param {string} saleId
 * @param {Buffer} buffer
 * @param {string} contentType
 * @returns {Promise<string>} storage path
 */
export async function uploadPaymentReceipt(saleId, buffer, contentType) {
  const id = randomBytes(8).toString('hex')
  const path = `sales/${saleId}/${Date.now()}-${id}.webp`
  return uploadReceipt(path, buffer, contentType)
}

/**
 * Comprobante de compra USDT — mismo bucket, dir `compras_usdt/{purchaseId}/`.
 * @param {string} purchaseId
 * @param {Buffer} buffer
 * @param {string} contentType
 * @returns {Promise<string>} storage path
 */
export async function uploadCurrencyPurchaseReceipt(purchaseId, buffer, contentType) {
  const id = randomBytes(8).toString('hex')
  const path = `compras_usdt/${purchaseId}/${Date.now()}-${id}.webp`
  return uploadReceipt(path, buffer, contentType)
}

/**
 * @param {string} path
 */
export async function deletePaymentReceipt(path) {
  if (!path) return
  const { error } = await supabase().storage.from(bucketName()).remove([path])
  if (error) {
    console.error('[receipts] delete failed', path, error.message)
  }
}

/**
 * @param {string} path
 * @returns {Promise<string>} signed URL
 */
export async function signedReceiptUrl(path) {
  const { data, error } = await supabase()
    .storage.from(bucketName())
    .createSignedUrl(path, SIGNED_URL_TTL_SEC)
  if (error || !data?.signedUrl) {
    throw new Error(error?.message ?? 'No se pudo firmar URL del comprobante')
  }
  return data.signedUrl
}
