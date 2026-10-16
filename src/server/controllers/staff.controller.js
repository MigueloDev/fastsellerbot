import { listStaff, setStaffRole, StaffError } from '../../db/staff.js'

function handleError(err, reply) {
  if (err instanceof StaffError) {
    reply.status(err.status).send({ error: err.message })
    return true
  }
  return false
}

export async function me(request) {
  const user = request.user
  return {
    id: user.staffId,
    name: user.name,
    email: user.email,
    role: user.role,
  }
}

export async function list(request, reply) {
  try {
    return await listStaff()
  } catch (err) {
    if (handleError(err, reply)) return
    throw err
  }
}

export async function patchRole(request, reply) {
  try {
    return await setStaffRole(request.params.id, request.body.role)
  } catch (err) {
    if (handleError(err, reply)) return
    throw err
  }
}
