import 'dotenv/config'
import pg from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import * as schema from '../server/db/schema.js'
import { seedProductionsAndCustom } from './lib/seedProductions.js'

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://mbx@localhost:5432/numa3d'
})
const db = drizzle(pool, { schema })

function mustFind(rows, pred, label) {
  const row = rows.find(pred)
  if (!row) throw new Error(`Tidak menemukan ${label}. Jalankan npm run db:seed dulu, atau isi katalog.`)
  return row
}

async function main() {
  console.log('Seeding produksi & custom order...')

  const products = await db.select().from(schema.products)
  const materials = await db.select().from(schema.materials)
  const machines = await db.select().from(schema.machines)
  const packaging = await db.select().from(schema.packaging)

  const refs = {
    vas: mustFind(products, (p) => /vas/i.test(p.name), 'produk Vas'),
    gantungan: mustFind(products, (p) => /gantungan/i.test(p.name), 'produk Gantungan'),
    miniatur: mustFind(products, (p) => /miniatur/i.test(p.name), 'produk Miniatur'),
    pla: mustFind(materials, (m) => /pla hitam/i.test(m.name), 'material PLA Hitam'),
    plaPutih: mustFind(materials, (m) => /pla putih/i.test(m.name), 'material PLA Putih'),
    petg: mustFind(materials, (m) => /petg/i.test(m.name), 'material PETG'),
    resin: mustFind(materials, (m) => /resin/i.test(m.name), 'material Resin'),
    ender: mustFind(machines, (m) => /ender/i.test(m.name), 'mesin Ender'),
    photon: mustFind(machines, (m) => /photon|resin/i.test(m.name), 'mesin Photon'),
    boxKecil: packaging.find((p) => /box kecil/i.test(p.name)),
    bubble: packaging.find((p) => /bubble/i.test(p.name)),
    stiker: packaging.find((p) => /stiker/i.test(p.name)),
    kartu: packaging.find((p) => /kartu/i.test(p.name))
  }

  const result = await seedProductionsAndCustom(db, schema, refs)
  console.log(`Seed selesai: ${result.productions} produksi, ${result.customOrders} pesanan custom.`)
  await pool.end()
}

main().catch(async (e) => {
  console.error(e.message || e)
  await pool.end()
  process.exit(1)
})
