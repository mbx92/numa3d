import { eq, sql } from 'drizzle-orm'

function pad(n) {
  return String(n).padStart(2, '0')
}

export function localDate(offsetDays = 0) {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function hoursAgo(hours) {
  return new Date(Date.now() - hours * 60 * 60 * 1000)
}

async function bump(db, table, id, delta) {
  if (!id || !delta) return
  await db
    .update(table)
    .set({ stockQuantity: sql`${table.stockQuantity} + ${delta}` })
    .where(eq(table.id, id))
}

/**
 * Isi contoh produksi katalog + pesanan custom.
 * refs: { vas, gantungan, miniatur, pla, plaPutih, petg, resin, ender, photon, boxKecil, bubble, stiker, kartu }
 */
export async function seedProductionsAndCustom(db, schema, refs) {
  const {
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
    stiker
  } = refs

  await db.insert(schema.productions).values([
    {
      date: localDate(-1),
      productId: gantungan.id,
      machineId: ender.id,
      quantityPlanned: 20,
      quantityGood: 0,
      quantityFailed: 0,
      status: 'queued',
      notes: 'Restock Shopee — batch gantungan',
      stockApplied: false,
      durationMinutes: 0
    },
    {
      date: localDate(0),
      productId: vas.id,
      machineId: ender.id,
      quantityPlanned: 2,
      quantityGood: 0,
      quantityFailed: 0,
      status: 'in_progress',
      notes: 'PLA hitam, infill 15%',
      stockApplied: false,
      startedAt: hoursAgo(3.5),
      durationMinutes: 300 * 2
    },
    {
      date: localDate(-4),
      productId: vas.id,
      machineId: ender.id,
      quantityPlanned: 4,
      quantityGood: 3,
      quantityFailed: 1,
      status: 'done',
      notes: '1 gagal warping di sudut',
      stockApplied: true,
      startedAt: hoursAgo(48),
      durationMinutes: 300 * 4
    },
    {
      date: localDate(-2),
      productId: miniatur.id,
      machineId: photon.id,
      quantityPlanned: 1,
      quantityGood: 0,
      quantityFailed: 0,
      status: 'cancelled',
      notes: 'File STL rusak, ditunda',
      stockApplied: false,
      durationMinutes: 240
    }
  ])

  // Stok katalog: 3 vas jadi masuk rak; material/packaging mengikuti recipe
  await bump(db, schema.products, vas.id, 3)
  await bump(db, schema.materials, pla.id, -(120 * 4))
  if (boxKecil) await bump(db, schema.packaging, boxKecil.id, -3)
  if (bubble) await bump(db, schema.packaging, bubble.id, -1.5)

  const [customQueued] = await db
    .insert(schema.customOrders)
    .values({
      date: localDate(0),
      customerName: 'Raka Pratama',
      title: 'Gantungan kunci inisial RP',
      channel: 'whatsapp',
      quantity: 8,
      pricePerUnit: 18000,
      materialId: pla.id,
      materialQuantityUsed: 14,
      packagingId: stiker?.id || null,
      packagingQuantityUsed: stiker ? 1 : 0,
      machineId: ender.id,
      printTimeMinutes: 40,
      notes: 'Huruf bold, gantungan ring silver dari pelanggan',
      status: 'open'
    })
    .returning()

  const [customPrinting] = await db
    .insert(schema.customOrders)
    .values({
      date: localDate(-1),
      customerName: 'Dewi Lestari',
      title: 'Figurine kucing sitting 12cm',
      channel: 'instagram',
      quantity: 1,
      pricePerUnit: 150000,
      materialId: plaPutih.id,
      materialQuantityUsed: 95,
      packagingId: boxKecil?.id || null,
      packagingQuantityUsed: boxKecil ? 1 : 0,
      machineId: ender.id,
      printTimeMinutes: 420,
      notes: 'File STL pelanggan, layer 0.16',
      status: 'open'
    })
    .returning()

  const [customReady] = await db
    .insert(schema.customOrders)
    .values({
      date: localDate(-3),
      customerName: 'PT Sinar Jaya',
      title: 'Holder kartu nama logo SJ',
      channel: 'direct',
      quantity: 12,
      pricePerUnit: 25000,
      materialId: petg.id,
      materialQuantityUsed: 28,
      packagingId: stiker?.id || null,
      packagingQuantityUsed: stiker ? 1 : 0,
      machineId: ender.id,
      printTimeMinutes: 90,
      notes: 'PETG biar lebih kuat',
      status: 'ready'
    })
    .returning()

  const [customDelivered] = await db
    .insert(schema.customOrders)
    .values({
      date: localDate(-6),
      customerName: 'Budi Santoso',
      title: 'Miniatur motor custom scale 1:18',
      channel: 'whatsapp',
      quantity: 1,
      pricePerUnit: 275000,
      materialId: resin.id,
      materialQuantityUsed: 70,
      packagingId: boxKecil?.id || null,
      packagingQuantityUsed: boxKecil ? 1 : 0,
      machineId: photon.id,
      printTimeMinutes: 360,
      notes: 'Sudah di-post-process, siap diambil',
      status: 'delivered'
    })
    .returning()

  await db.insert(schema.productions).values([
    {
      date: customQueued.date,
      productId: null,
      customOrderId: customQueued.id,
      machineId: ender.id,
      quantityPlanned: customQueued.quantity,
      status: 'queued',
      notes: customQueued.notes,
      stockApplied: false,
      durationMinutes: customQueued.printTimeMinutes * customQueued.quantity
    },
    {
      date: customPrinting.date,
      productId: null,
      customOrderId: customPrinting.id,
      machineId: ender.id,
      quantityPlanned: customPrinting.quantity,
      status: 'in_progress',
      notes: customPrinting.notes,
      stockApplied: false,
      startedAt: hoursAgo(5),
      durationMinutes: customPrinting.printTimeMinutes * customPrinting.quantity
    },
    {
      date: customReady.date,
      productId: null,
      customOrderId: customReady.id,
      machineId: ender.id,
      quantityPlanned: 12,
      quantityGood: 11,
      quantityFailed: 1,
      status: 'done',
      notes: customReady.notes,
      stockApplied: true,
      startedAt: hoursAgo(72),
      durationMinutes: 90 * 12
    },
    {
      date: customDelivered.date,
      productId: null,
      customOrderId: customDelivered.id,
      machineId: photon.id,
      quantityPlanned: 1,
      quantityGood: 1,
      quantityFailed: 0,
      status: 'done',
      notes: customDelivered.notes,
      stockApplied: true,
      startedAt: hoursAgo(120),
      durationMinutes: 360
    }
  ])

  await bump(db, schema.materials, petg.id, -(28 * 12))
  if (stiker) await bump(db, schema.packaging, stiker.id, -11)
  await bump(db, schema.materials, resin.id, -70)
  if (boxKecil) await bump(db, schema.packaging, boxKecil.id, -1)

  const yyyymm = localDate(0).replace(/-/g, '').slice(0, 6)
  await db.insert(schema.sales).values({
    date: localDate(-5),
    productId: null,
    customOrderId: customDelivered.id,
    quantity: 1,
    salePricePerUnit: 275000,
    channel: 'whatsapp',
    marketplaceFeePercent: null,
    notes: `Custom · ${customDelivered.customerName} · ${customDelivered.title}`,
    customerName: customDelivered.customerName,
    invoiceNumber: `INV-${yyyymm}-9001`
  })

  return {
    productions: 8,
    customOrders: 4
  }
}
