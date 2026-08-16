import bcrypt from 'bcryptjs'
import { useDb, schema } from '../db/index.js'

// Migrasi one-time: jika tabel users masih kosong, akun dari .env
// (ADMIN_USERNAME/ADMIN_PASSWORD) dijadikan user admin pertama di database.
// Setelah ini .env tidak lagi dipakai untuk login — hanya tabel users.
export default defineNitroPlugin(async () => {
  const config = useRuntimeConfig()
  if (!config.adminPassword) return

  try {
    const db = useDb()
    const existing = await db.select({ id: schema.users.id }).from(schema.users).limit(1)
    if (existing.length) return

    const passwordHash = await bcrypt.hash(config.adminPassword, 10)
    await db.insert(schema.users).values({
      username: config.adminUsername,
      passwordHash,
      role: 'admin'
    })
    console.log(`[numa3d] Akun admin awal dibuat dari .env: ${config.adminUsername}`)
  } catch (e) {
    console.error('[numa3d] Gagal bootstrap akun admin awal:', e.message)
  }
})
