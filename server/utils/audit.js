import { eq } from 'drizzle-orm'
import { useDb, schema } from '../db/index.js'

// Catat satu baris audit log. Dipanggil setelah operasi mutasi berhasil.
// username didenormalisasi (dilihat sekali per panggilan) agar tetap terbaca
// meski user penulisnya kemudian dihapus dari tabel users.
// Catat peristiwa autentikasi (login berhasil/gagal/diblokir rate limit).
// Berbeda dari logAudit: belum ada sesi, jadi userId null dan username diambil
// dari input login — nilainya tidak tepercaya, hanya untuk penelusuran.
export async function logAuthEvent({ action, username, summary }) {
  const db = useDb()
  await db.insert(schema.auditLogs).values({
    userId: null,
    username: username ? String(username).slice(0, 100) : '(kosong)',
    action,
    entity: 'auth',
    entityId: null,
    summary
  })
}

export async function logAudit(event, { action, entity, entityId = null, summary }) {
  const auth = event.context.auth
  if (!auth) return
  const db = useDb()
  const rows = await db.select({ username: schema.users.username }).from(schema.users).where(eq(schema.users.id, auth.id))
  await db.insert(schema.auditLogs).values({
    userId: auth.id,
    username: rows[0]?.username || `user#${auth.id}`,
    action,
    entity,
    entityId,
    summary
  })
}
