import { prisma } from './client.js'

export class StaffError extends Error {
  /**
   * @param {number} status
   * @param {string} message
   */
  constructor(status, message) {
    super(message)
    this.name = 'StaffError'
    this.status = status
  }
}

function serialize(row) {
  if (!row) return null
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    createdAt: row.createdAt,
  }
}

/**
 * Crea el staff en el primer request. Si no hay ningún ADMIN, este usuario lo es.
 * ponytail: dos altas simultáneas con la tabla vacía pueden dejar dos ADMIN;
 * el techo es el primer deploy. Upgrade: advisory lock en la transacción.
 * @param {{ clerkUserId: string, email?: string|null, name?: string|null }} input
 */
export async function resolveStaff({ clerkUserId, email = null, name = null }) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.staff.findUnique({ where: { clerkUserId } })
    if (existing) {
      if (existing.email === email && existing.name === name) return existing
      return tx.staff.update({
        where: { id: existing.id },
        data: { email, name },
      })
    }
    const adminCount = await tx.staff.count({ where: { role: 'ADMIN' } })
    return tx.staff.create({
      data: {
        clerkUserId,
        email,
        name,
        role: adminCount === 0 ? 'ADMIN' : 'VENDEDOR',
      },
    })
  })
}

export async function listStaff() {
  const rows = await prisma.staff.findMany({ orderBy: { createdAt: 'asc' } })
  return rows.map(serialize)
}

/**
 * @param {string} id
 * @param {'ADMIN'|'VENDEDOR'} role
 */
export async function setStaffRole(id, role) {
  if (role !== 'ADMIN' && role !== 'VENDEDOR') {
    throw new StaffError(422, 'role inválido')
  }
  return prisma.$transaction(async (tx) => {
    const staff = await tx.staff.findUnique({ where: { id } })
    if (!staff) throw new StaffError(404, 'Usuario no encontrado')
    if (staff.role === 'ADMIN' && role !== 'ADMIN') {
      const admins = await tx.staff.count({ where: { role: 'ADMIN' } })
      if (admins <= 1) {
        throw new StaffError(409, 'Debe quedar al menos un administrador')
      }
    }
    const updated = await tx.staff.update({ where: { id }, data: { role } })
    return serialize(updated)
  })
}
