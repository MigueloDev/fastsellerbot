import { prisma } from './client.js'
import {
  normalizeCedula,
  normalizePhone,
  displayName,
} from '../customers/validate.js'

export class CustomerError extends Error {
  /**
   * @param {number} status
   * @param {string} message
   */
  constructor(status, message) {
    super(message)
    this.name = 'CustomerError'
    this.status = status
  }
}

/**
 * @param {{ q?: string, includeInactive?: boolean }} opts
 */
export async function listCustomers({ q, includeInactive = false } = {}) {
  const where = {}
  if (!includeInactive) where.active = true
  if (q?.trim()) {
    const term = q.trim()
    where.OR = [
      { cedula: { contains: term, mode: 'insensitive' } },
      { firstName: { contains: term, mode: 'insensitive' } },
      { lastName: { contains: term, mode: 'insensitive' } },
      { name: { contains: term, mode: 'insensitive' } },
      { phone: { contains: term, mode: 'insensitive' } },
      { jid: { contains: term, mode: 'insensitive' } },
    ]
  }

  return prisma.customer.findMany({
    where,
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    take: 100,
  })
}

/**
 * @param {{
 *   cedula: string,
 *   firstName: string,
 *   lastName: string,
 *   phone?: string|null,
 *   jid?: string|null,
 *   note?: string|null,
 * }} data
 */
export async function createCustomer(data) {
  const cedula = normalizeCedula(data.cedula)
  if (!cedula) {
    throw new CustomerError(
      422,
      'cedula inválida (V/E/J + 6–9 dígitos, o solo dígitos)',
    )
  }

  const firstName = data.firstName?.trim()
  const lastName = data.lastName?.trim()
  if (!firstName) throw new CustomerError(422, 'firstName es requerido')
  if (!lastName) throw new CustomerError(422, 'lastName es requerido')

  const phoneResult = normalizePhone(data.phone)
  if (!phoneResult.ok) throw new CustomerError(422, phoneResult.error)

  try {
    return await prisma.customer.create({
      data: {
        cedula,
        firstName,
        lastName,
        name: displayName(firstName, lastName),
        phone: phoneResult.value,
        jid: data.jid?.trim() || null,
        note: data.note?.trim() || null,
      },
    })
  } catch (err) {
    if (err.code === 'P2002') {
      const target = err.meta?.target
      if (Array.isArray(target) && target.includes('cedula')) {
        throw new CustomerError(422, 'cedula ya existe')
      }
      if (Array.isArray(target) && target.includes('jid')) {
        throw new CustomerError(422, 'jid ya existe')
      }
      throw new CustomerError(422, 'dato duplicado')
    }
    throw err
  }
}

/**
 * @param {string} id
 * @param {{
 *   cedula?: string,
 *   firstName?: string,
 *   lastName?: string,
 *   phone?: string|null,
 *   jid?: string|null,
 *   note?: string|null,
 *   active?: boolean,
 * }} data
 */
export async function updateCustomer(id, data) {
  const existing = await prisma.customer.findUnique({ where: { id } })
  if (!existing) throw new CustomerError(404, 'Cliente no encontrado')

  const patch = {}

  if (data.cedula !== undefined) {
    const cedula = normalizeCedula(data.cedula)
    if (!cedula) {
      throw new CustomerError(
        422,
        'cedula inválida (V/E + 6–9 dígitos, o solo dígitos)',
      )
    }
    patch.cedula = cedula
  }

  if (data.firstName !== undefined) {
    const firstName = data.firstName?.trim()
    if (!firstName) throw new CustomerError(422, 'firstName no puede estar vacío')
    patch.firstName = firstName
  }
  if (data.lastName !== undefined) {
    const lastName = data.lastName?.trim()
    if (!lastName) throw new CustomerError(422, 'lastName no puede estar vacío')
    patch.lastName = lastName
  }

  if (patch.firstName !== undefined || patch.lastName !== undefined) {
    const fn = patch.firstName ?? existing.firstName
    const ln = patch.lastName ?? existing.lastName
    patch.name = displayName(fn, ln)
  }

  if (data.phone !== undefined) {
    const phoneResult = normalizePhone(data.phone)
    if (!phoneResult.ok) throw new CustomerError(422, phoneResult.error)
    patch.phone = phoneResult.value
  }
  if (data.jid !== undefined) patch.jid = data.jid?.trim() || null
  if (data.note !== undefined) patch.note = data.note?.trim() || null
  if (data.active !== undefined) patch.active = Boolean(data.active)

  try {
    return await prisma.customer.update({ where: { id }, data: patch })
  } catch (err) {
    if (err.code === 'P2002') {
      const target = err.meta?.target
      if (Array.isArray(target) && target.includes('cedula')) {
        throw new CustomerError(422, 'cedula ya existe')
      }
      if (Array.isArray(target) && target.includes('jid')) {
        throw new CustomerError(422, 'jid ya existe')
      }
      throw new CustomerError(422, 'dato duplicado')
    }
    throw err
  }
}
