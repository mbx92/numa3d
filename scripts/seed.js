import 'dotenv/config'
import pg from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import * as schema from '../server/db/schema.js'

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://mbx@localhost:5432/numa3d'
})
const db = drizzle(pool, { schema })

async function main() {
  console.log('Seeding database...')

  await db.insert(schema.appSettings).values({
    electricityRatePerKwh: 1445,
    machineUsageHoursPerMonth: 100,
    defaultMarginPercent: 40
  })

  const [pla, plaPutih, petg, resin] = await db
    .insert(schema.materials)
    .values([
      { name: 'PLA Hitam eSUN 1kg', type: 'filament', unit: 'gram', pricePerUnit: 150, stockQuantity: 850, supplier: 'Tokopedia - 3DZaiku' },
      { name: 'PLA Putih Sunlu 1kg', type: 'filament', unit: 'gram', pricePerUnit: 140, stockQuantity: 120, supplier: 'Shopee - Sunlu Official' },
      { name: 'PETG Transparan 1kg', type: 'filament', unit: 'gram', pricePerUnit: 180, stockQuantity: 950, supplier: 'Tokopedia - 3DZaiku' },
      { name: 'Resin Standard Abu 1L', type: 'resin', unit: 'ml', pricePerUnit: 350, stockQuantity: 600, supplier: 'Shopee - Anycubic' }
    ])
    .returning()

  const [ender, photon] = await db
    .insert(schema.machines)
    .values([
      {
        name: 'Ender 3 V2',
        powerWatt: 350,
        purchasePrice: 3200000,
        purchaseDate: '2025-03-10',
        depreciationMonths: 36,
        notes: 'Printer FDM utama'
      },
      {
        name: 'Anycubic Photon Mono 2',
        powerWatt: 55,
        purchasePrice: 2800000,
        purchaseDate: '2025-06-01',
        depreciationMonths: 36,
        notes: 'Printer resin untuk detail kecil'
      }
    ])
    .returning()

  const [boxKecil, bubble, stiker, kartu] = await db
    .insert(schema.packaging)
    .values([
      { name: 'Box Kecil 10x10', unit: 'pcs', pricePerUnit: 1500, stockQuantity: 80, supplier: 'Tokopedia - PackNine' },
      { name: 'Bubble Wrap per meter', unit: 'meter', pricePerUnit: 2000, stockQuantity: 25, supplier: 'Toko ATK lokal' },
      { name: 'Stiker Logo 5cm', unit: 'pcs', pricePerUnit: 500, stockQuantity: 200, supplier: 'Percetakan lokal' },
      { name: 'Kartu Thank You', unit: 'pcs', pricePerUnit: 700, stockQuantity: 5, supplier: 'Percetakan lokal' }
    ])
    .returning()

  const [vasSeries, customSeries] = await db
    .insert(schema.productSeries)
    .values([
      { name: 'Vas Dekoratif', description: 'Koleksi vas 3D print untuk dekorasi rumah' },
      { name: 'Custom & Hadiah', description: 'Produk custom nama dan hadiah personal' }
    ])
    .returning()

  const [vas, gantungan, miniatur] = await db
    .insert(schema.products)
    .values([
      { name: 'Vas Bunga Spiral', description: 'Vas dekoratif mode vase, PLA', status: 'active', seriesId: vasSeries.id },
      { name: 'Gantungan Kunci Custom Nama', description: 'Gantungan kunci nama custom 2 warna', status: 'active', seriesId: customSeries.id },
      { name: 'Miniatur Rumah Adat', description: 'Prototipe resin, masih riset pasar', status: 'rnd' }
    ])
    .returning()

  await db.insert(schema.productRecipes).values([
    {
      productId: vas.id,
      materialId: pla.id,
      quantityUsed: 120,
      printTimeMinutes: 300,
      machineId: ender.id,
      failureRatePercent: 8,
      laborMinutes: 20,
      laborRatePerHour: 15000
    },
    {
      productId: gantungan.id,
      materialId: pla.id,
      quantityUsed: 12,
      printTimeMinutes: 45,
      machineId: ender.id,
      failureRatePercent: 5,
      laborMinutes: 10,
      laborRatePerHour: 15000
    },
    {
      productId: gantungan.id,
      materialId: plaPutih.id,
      quantityUsed: 4,
      printTimeMinutes: 15,
      machineId: ender.id,
      failureRatePercent: 5,
      laborMinutes: 0,
      laborRatePerHour: 0
    },
    {
      productId: miniatur.id,
      materialId: resin.id,
      quantityUsed: 85,
      printTimeMinutes: 240,
      machineId: photon.id,
      failureRatePercent: 12,
      laborMinutes: 45,
      laborRatePerHour: 15000
    }
  ])

  await db.insert(schema.productPackaging).values([
    { productId: vas.id, packagingId: boxKecil.id, quantityUsed: 1 },
    { productId: vas.id, packagingId: bubble.id, quantityUsed: 0.5 },
    { productId: vas.id, packagingId: kartu.id, quantityUsed: 1 },
    { productId: gantungan.id, packagingId: stiker.id, quantityUsed: 1 },
    { productId: gantungan.id, packagingId: kartu.id, quantityUsed: 1 }
  ])

  const ym = new Date().toISOString().slice(0, 7)
  await db.insert(schema.expenses).values([
    { date: `${ym}-02`, category: 'material', description: 'Beli PLA Hitam eSUN 2 roll', amount: 300000 },
    { date: `${ym}-03`, category: 'tool', description: 'Nozzle 0.4mm 5 pcs + scraper', amount: 85000 },
    { date: `${ym}-05`, category: 'electricity', description: 'Estimasi listrik workshop', amount: 150000 },
    { date: `${ym}-08`, category: 'rnd', description: 'Resin uji coba miniatur', amount: 210000, relatedProductId: miniatur.id },
    { date: `${ym}-10`, category: 'other', description: 'Lakban + plastik packing', amount: 45000 }
  ])

  await db.insert(schema.sales).values([
    {
      date: `${ym}-04`,
      productId: vas.id,
      quantity: 2,
      salePricePerUnit: 85000,
      channel: 'tokopedia',
      marketplaceFeePercent: 6.5,
      notes: 'Pembeli repeat order'
    },
    {
      date: `${ym}-06`,
      productId: gantungan.id,
      quantity: 10,
      salePricePerUnit: 15000,
      channel: 'shopee',
      marketplaceFeePercent: 8
    },
    {
      date: `${ym}-09`,
      productId: vas.id,
      quantity: 1,
      salePricePerUnit: 90000,
      channel: 'instagram',
      marketplaceFeePercent: null,
      notes: 'DM Instagram, COD'
    },
    {
      date: `${ym}-12`,
      productId: gantungan.id,
      quantity: 5,
      salePricePerUnit: 17500,
      channel: 'whatsapp',
      marketplaceFeePercent: null
    }
  ])

  const { seedProductionsAndCustom } = await import('./lib/seedProductions.js')
  await seedProductionsAndCustom(db, schema, {
    vas,
    gantungan,
    miniatur,
    pla,
    plaPutih,
    petg,
    resin,
    ender,
    photon,
    boxKecil,
    bubble,
    stiker,
    kartu
  })

  console.log('Seed selesai.')
  await pool.end()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
