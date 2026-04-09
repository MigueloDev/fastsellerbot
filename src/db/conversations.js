import { prisma } from './client.js'

export async function upsertConversation(jid) {
  return prisma.conversation.upsert({
    where: { jid },
    update: { lastMessageAt: new Date() },
    create: { jid, lastMessageAt: new Date() },
  })
}

export async function saveMessage({ jid, direction, text, intent, origin }) {
  try {
    const conversation = await upsertConversation(jid)
    const message = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        direction,
        text,
        intent: intent ?? null,
        origin: origin ?? null,
      },
    })
    console.log('💾 Mensaje guardado:', { jid, direction, origin })
    return message
  } catch (err) {
    console.error('❌ Error guardando mensaje:', err.message)
    return null  // nunca relanzar — no tumbar el pipeline
  }
}

export async function getConversations() {
  return prisma.conversation.findMany({
    orderBy: { lastMessageAt: 'desc' },
    include: {
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 1,  // solo el último mensaje para el preview
      },
    },
  })
}

export async function getMessages(jid, limit = 50) {
  const conversation = await prisma.conversation.findUnique({
    where: { jid },
  })
  if (!conversation) return []

  return prisma.message.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: 'asc' },
    take: limit,
  })
}

export async function updateConversationStatus(jid, status) {
  await prisma.conversation.update({
    where: { jid },
    data: { status },
  })
  console.log('📝 Status actualizado:', { jid, status })
}
