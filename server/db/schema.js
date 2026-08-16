import {
  pgTable,
  pgEnum,
  serial,
  text,
  integer,
  real,
  date,
  timestamp,
  uniqueIndex,
  boolean
} from 'drizzle-orm/pg-core'

export const userRoleEnum = pgEnum('user_role', ['admin', 'staff'])
export const materialTypeEnum = pgEnum('material_type', ['filament', 'resin'])
export const productStatusEnum = pgEnum('product_status', ['rnd', 'active', 'discontinued'])
export const salesChannelEnum = pgEnum('sales_channel', [
  'tokopedia',
  'shopee',
  'tiktok_shop',
  'instagram',
  'whatsapp',
  'direct',
  'other'
])
export const capitalTypeEnum = pgEnum('capital_type', ['deposit', 'withdrawal'])

export const suppliers = pgTable('suppliers', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),
  notes: text('notes'),
  createdAt: timestamp('created_at').notNull().defaultNow()
})

// Series produk: katalog adalah kumpulan series, dan tiap series berisi
// beberapa produk. Satu produk hanya bisa masuk satu series (series_id).
export const productSeries = pgTable('product_series', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  // Object key gambar sampul series di MinIO. null = tanpa sampul.
  imageKey: text('image_key'),
  createdAt: timestamp('created_at').notNull().defaultNow()
})

// Pengguna sistem. Admin: akses penuh. Staff: hanya boleh mencatat
// Pengeluaran & Penjualan, sisanya (Material/Mesin/Packaging/Produk/
// Pengaturan/User) read-only — ditegakkan di server/utils/rbac.js.
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: userRoleEnum('role').notNull().default('staff'),
  createdAt: timestamp('created_at').notNull().defaultNow()
})

// Semua nilai uang disimpan sebagai integer rupiah (tanpa desimal).
export const materials = pgTable('materials', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  type: materialTypeEnum('type').notNull().default('filament'),
  unit: text('unit').notNull().default('gram'), // gram | ml
  pricePerUnit: integer('price_per_unit').notNull().default(0),
  stockQuantity: real('stock_quantity').notNull().default(0),
  supplier: text('supplier'),
  // Object key gambar di MinIO (bucket sama dengan file 3D). null = tanpa gambar.
  imageKey: text('image_key'),
  createdAt: timestamp('created_at').notNull().defaultNow()
})

export const machines = pgTable('machines', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  powerWatt: integer('power_watt').notNull().default(0),
  purchasePrice: integer('purchase_price').notNull().default(0),
  purchaseDate: date('purchase_date'),
  depreciationMonths: integer('depreciation_months').notNull().default(36),
  notes: text('notes'),
  // Object key gambar di MinIO (bucket sama dengan file 3D). null = tanpa gambar.
  imageKey: text('image_key'),
  // Smart plug Tuya (Local Tuya). local_key jangan dikirim ke klien.
  tuyaIp: text('tuya_ip'),
  tuyaDeviceId: text('tuya_device_id'),
  tuyaLocalKey: text('tuya_local_key'),
  tuyaVersion: text('tuya_version').notNull().default('3.4'),
  tuyaLastPowerWatt: real('tuya_last_power_watt'),
  tuyaLastVoltage: real('tuya_last_voltage'),
  tuyaLastCurrentMa: integer('tuya_last_current_ma'),
  tuyaLastOn: boolean('tuya_last_on'),
  tuyaLastReadAt: timestamp('tuya_last_read_at'),
  tuyaLastError: text('tuya_last_error')
})

export const products = pgTable('products', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  status: productStatusEnum('status').notNull().default('rnd'),
  // Object key gambar di MinIO — dipakai sebagai foto utama di katalog.
  imageKey: text('image_key'),
  // Series tempat produk ini bernaung (boleh null = belum punya series).
  seriesId: integer('series_id').references(() => productSeries.id, {
    onDelete: 'set null'
  }),
  createdAt: timestamp('created_at').notNull().defaultNow()
})

export const expenseCategories = pgTable('expense_categories', {
  id: serial('id').primaryKey(),
  key: text('key').notNull().unique(),
  name: text('name').notNull(),
  isSystem: boolean('is_system').notNull().default(false),
  sortOrder: integer('sort_order').notNull().default(100),
  createdAt: timestamp('created_at').notNull().defaultNow()
})

export const expenses = pgTable('expenses', {
  id: serial('id').primaryKey(),
  date: date('date').notNull(),
  category: text('category')
    .notNull()
    .default('other')
    .references(() => expenseCategories.key),
  description: text('description').notNull(),
  amount: integer('amount').notNull().default(0),
  relatedProductId: integer('related_product_id').references(() => products.id, {
    onDelete: 'set null'
  }),
  createdAt: timestamp('created_at').notNull().defaultNow()
})

// Satu pengeluaran bisa terkait banyak produk (mis. beli PLA yang dipakai
// beberapa recipe). related_product_id tetap diisi produk pertama agar
// filter lama tetap jalan.
export const expenseProducts = pgTable(
  'expense_products',
  {
    id: serial('id').primaryKey(),
    expenseId: integer('expense_id')
      .notNull()
      .references(() => expenses.id, { onDelete: 'cascade' }),
    productId: integer('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' })
  },
  (t) => ({
    expenseProductUniq: uniqueIndex('expense_products_expense_id_product_id_idx').on(t.expenseId, t.productId)
  })
)

export const productRecipes = pgTable('product_recipes', {
  id: serial('id').primaryKey(),
  productId: integer('product_id')
    .notNull()
    .references(() => products.id, { onDelete: 'cascade' }),
  materialId: integer('material_id')
    .notNull()
    .references(() => materials.id),
  quantityUsed: real('quantity_used').notNull().default(0),
  printTimeMinutes: integer('print_time_minutes').notNull().default(0),
  machineId: integer('machine_id').references(() => machines.id),
  failureRatePercent: real('failure_rate_percent').notNull().default(5),
  laborMinutes: integer('labor_minutes').notNull().default(0),
  laborRatePerHour: integer('labor_rate_per_hour').notNull().default(0)
})

export const packaging = pgTable('packaging', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  unit: text('unit').notNull().default('pcs'),
  pricePerUnit: integer('price_per_unit').notNull().default(0),
  stockQuantity: real('stock_quantity').notNull().default(0),
  supplier: text('supplier'),
  // Object key gambar di MinIO (bucket sama dengan file 3D). null = tanpa gambar.
  imageKey: text('image_key'),
  createdAt: timestamp('created_at').notNull().defaultNow()
})

export const productPackaging = pgTable('product_packaging', {
  id: serial('id').primaryKey(),
  productId: integer('product_id')
    .notNull()
    .references(() => products.id, { onDelete: 'cascade' }),
  packagingId: integer('packaging_id')
    .notNull()
    .references(() => packaging.id),
  quantityUsed: real('quantity_used').notNull().default(1)
})

export const sales = pgTable('sales', {
  id: serial('id').primaryKey(),
  date: date('date').notNull(),
  productId: integer('product_id')
    .notNull()
    .references(() => products.id),
  quantity: integer('quantity').notNull().default(1),
  salePricePerUnit: integer('sale_price_per_unit').notNull().default(0),
  channel: salesChannelEnum('channel').notNull().default('direct'),
  marketplaceFeePercent: real('marketplace_fee_percent'),
  notes: text('notes'),
  createdAt: timestamp('created_at').notNull().defaultNow()
})

// File 3D milik produk (STL/OBJ/3MF/GLB). Isi file disimpan di MinIO,
// tabel ini hanya menyimpan metadata + object key di bucket.
export const productFiles = pgTable('product_files', {
  id: serial('id').primaryKey(),
  productId: integer('product_id')
    .notNull()
    .references(() => products.id, { onDelete: 'cascade' }),
  filename: text('filename').notNull(),
  objectKey: text('object_key').notNull(),
  sizeBytes: integer('size_bytes').notNull().default(0),
  contentType: text('content_type'),
  createdAt: timestamp('created_at').notNull().defaultNow()
})

// Jejak audit untuk aksi mutasi (siapa mengubah apa). username didenormalisasi
// agar tetap terbaca meski user penulisnya kemudian dihapus.
export const auditLogs = pgTable('audit_logs', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
  username: text('username').notNull(),
  action: text('action').notNull(), // create | update | delete
  entity: text('entity').notNull(), // material | machine | packaging | product | product_recipe | product_file | settings | user | expense | sale
  entityId: integer('entity_id'),
  summary: text('summary').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow()
})

// Pengaturan global satu baris: tarif listrik & asumsi jam pakai mesin per bulan
// (dibutuhkan untuk komponen listrik dan depresiasi per jam pada HPP).
export const appSettings = pgTable('app_settings', {
  id: serial('id').primaryKey(),
  electricityRatePerKwh: integer('electricity_rate_per_kwh').notNull().default(1445),
  machineUsageHoursPerMonth: integer('machine_usage_hours_per_month').notNull().default(100),
  defaultMarginPercent: real('default_margin_percent').notNull().default(40)
})

// Mutasi modal pemilik: setoran (deposit) & penarikan (withdrawal). Dipakai untuk
// menghitung posisi modal = total setoran - total penarikan. Bukan bagian laba
// rugi, melainkan posisi ekuitas pemilik.
export const capitalTransactions = pgTable('capital_transactions', {
  id: serial('id').primaryKey(),
  date: date('date').notNull(),
  type: capitalTypeEnum('type').notNull().default('deposit'),
  amount: integer('amount').notNull().default(0),
  notes: text('notes'),
  createdAt: timestamp('created_at').notNull().defaultNow()
})

export const purchaseItemTypeEnum = pgEnum('purchase_item_type', ['material', 'packaging'])

// Pembelian ke supplier: satu dokumen = beberapa baris barang.
// Saat disimpan, stok material/packaging bertambah dan satu baris pengeluaran
// dibuat otomatis (agar kas & laba rugi tetap sinkron).
export const supplierPurchases = pgTable('supplier_purchases', {
  id: serial('id').primaryKey(),
  date: date('date').notNull(),
  supplier: text('supplier').notNull(),
  notes: text('notes'),
  totalAmount: integer('total_amount').notNull().default(0),
  expenseId: integer('expense_id').references(() => expenses.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').notNull().defaultNow()
})

export const supplierPurchaseLines = pgTable('supplier_purchase_lines', {
  id: serial('id').primaryKey(),
  purchaseId: integer('purchase_id')
    .notNull()
    .references(() => supplierPurchases.id, { onDelete: 'cascade' }),
  itemType: purchaseItemTypeEnum('item_type').notNull(),
  materialId: integer('material_id').references(() => materials.id),
  packagingId: integer('packaging_id').references(() => packaging.id),
  quantity: real('quantity').notNull().default(0),
  unitPrice: integer('unit_price').notNull().default(0),
  amount: integer('amount').notNull().default(0)
})
