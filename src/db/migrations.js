import { prisma } from './client.js'

export async function runMigrations() {
  console.log('🗄️  Verificando conexión a la base de datos...')
  try {
    await prisma.$connect()
    // Verificar que las tablas existen haciendo una query simple
    await prisma.conversation.count()
    await prisma.message.count()
    console.log('✅ Base de datos conectada y tablas verificadas')
  } catch (err) {
    console.error('❌ Error conectando a la base de datos:', err.message)
    console.error('   Verifica DATABASE_URL en .env')
    console.error('   Corre: pnpm db:push para crear las tablas')
    throw err
  }
}
