import { eq } from 'drizzle-orm'
import { useDb, schema } from '../../../db/index.js'
import { publicMachine, readTuyaPlug } from '../../../utils/tuyaLocal.js'

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  const db = useDb()
  const [row] = await db.select().from(schema.machines).where(eq(schema.machines.id, id))
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Mesin tidak ditemukan' })
  if (!row.tuyaIp || !row.tuyaDeviceId || !row.tuyaLocalKey) {
    throw createError({ statusCode: 400, statusMessage: 'Mesin ini belum dikaitkan ke plug Tuya' })
  }
  try {
    const reading = await readTuyaPlug({
      ip: row.tuyaIp,
      deviceId: row.tuyaDeviceId,
      localKey: row.tuyaLocalKey,
      version: row.tuyaVersion || 'auto'
    })
    const [updated] = await db
      .update(schema.machines)
      .set({
        tuyaVersion: reading.version || row.tuyaVersion,
        tuyaLastPowerWatt: reading.powerWatt,
        tuyaLastVoltage: reading.voltage,
        tuyaLastCurrentMa: reading.currentMa,
        tuyaLastOn: reading.on,
        tuyaLastReadAt: new Date(),
        tuyaLastError: null
      })
      .where(eq(schema.machines.id, id))
      .returning()
    return {
      ...publicMachine(updated),
      powerWatt: reading.powerWatt,
      voltage: reading.voltage,
      currentMa: reading.currentMa,
      on: reading.on,
      version: reading.version,
      dps: reading.dps
    }
  } catch (e) {
    await db
      .update(schema.machines)
      .set({ tuyaLastError: e.statusMessage || e.message || 'Gagal baca plug', tuyaLastReadAt: new Date() })
      .where(eq(schema.machines.id, id))
    throw e
  }
})
