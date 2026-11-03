import { prisma } from './client.js'
import { normalizePhone } from '../customers/validate.js'

export class LeadError extends Error {
  /**
   * @param {number} status
   * @param {string} message
   */
  constructor(status, message) {
    super(message)
    this.name = 'LeadError'
    this.status = status
  }
}

/** @param {{ q?: string }} opts */
export async function listLeads({ q } = {}) {
  const where = {}
  if (q?.trim()) {
    const term = q.trim()
    where.OR = [
      { name: { contains: term, mode: 'insensitive' } },
      { phone: { contains: term, mode: 'insensitive' } },
    ]
  }
  // ponytail: tope fijo sin paginación; paginar cuando pase de unos cientos de leads
  return prisma.lead.findMany({ where, orderBy: { createdAt: 'desc' }, take: 200 })
}

/**
 * Valida y normaliza los campos presentes (undefined = no tocar).
 * @param {{ name?: string, phone?: string|null, source?: string, lastRemindedAt?: string|null }} data
 */
function toPatch(data) {
  const patch = {}
  if (data.name !== undefined) {
    const name = data.name?.trim()
    if (!name) throw new LeadError(422, 'name es requerido')
    patch.name = name
  }
  if (data.phone !== undefined) {
    const phone = normalizePhone(data.phone)
    if (!phone.ok) throw new LeadError(422, phone.error)
    patch.phone = phone.value
  }
  if (data.source !== undefined) patch.source = data.source
  if (data.lastRemindedAt !== undefined) {
    patch.lastRemindedAt = data.lastRemindedAt ? new Date(data.lastRemindedAt) : null
  }
  return patch
}

export async function createLead(data) {
  return prisma.lead.create({ data: toPatch(data) })
}

/** @param {string} id */
export async function updateLead(id, data) {
  try {
    return await prisma.lead.update({ where: { id }, data: toPatch(data) })
  } catch (err) {
    if (err.code === 'P2025') throw new LeadError(404, 'Lead no encontrado')
    throw err
  }
}

/** @param {string} id */
export async function deleteLead(id) {
  try {
    return await prisma.lead.delete({ where: { id } })
  } catch (err) {
    if (err.code === 'P2025') throw new LeadError(404, 'Lead no encontrado')
    throw err
  }
}
