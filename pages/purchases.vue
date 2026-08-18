<script setup>
import { PlusIcon, TrashIcon, CheckIcon, XMarkIcon } from '@heroicons/vue/24/outline'

const { data: purchases, refresh } = await useFetch('/api/purchases')
const { data: materials } = await useFetch('/api/materials')
const { data: packagingItems } = await useFetch('/api/packaging')
const { data: suppliers, refresh: refreshSuppliers } = await useFetch('/api/suppliers')
const { data: categories, refresh: refreshCategories } = await useFetch('/api/expense-categories')

const { page, pageSize, paged, total, totalPages, rangeStart, rangeEnd, reset } = usePagination(
  computed(() => purchases.value || []),
  10
)
watch(purchases, reset)

const showForm = ref(false)
const showSuppliers = ref(false)
const showCategories = ref(false)
const form = ref({})
const errorMsg = ref('')
const saving = ref(false)

const supplierForm = ref({ name: '', notes: '' })
const supplierError = ref('')
const savingSupplier = ref(false)
const categoryForm = ref({ name: '' })
const categoryError = ref('')
const savingCategory = ref(false)

function emptyLine() {
  return { itemType: 'material', materialId: '', packagingId: '', quantity: 0, unitPrice: 0 }
}
function openAdd() {
  form.value = { date: todayStr(), supplier: suppliers.value?.[0]?.name || '', category: 'material', notes: '', lines: [emptyLine()] }
  errorMsg.value = ''
  showForm.value = true
}
function openSuppliers() {
  supplierForm.value = { name: '', notes: '' }
  supplierError.value = ''
  showSuppliers.value = true
}
async function saveSupplier() {
  supplierError.value = ''
  savingSupplier.value = true
  try {
    const created = await $fetch('/api/suppliers', { method: 'POST', body: supplierForm.value })
    await refreshSuppliers()
    form.value.supplier = created.name
    supplierForm.value = { name: '', notes: '' }
    useToast().success(`Supplier "${created.name}" ditambahkan.`)
  } catch (e) {
    supplierError.value = e.data?.statusMessage || 'Gagal menambah supplier'
  } finally {
    savingSupplier.value = false
  }
}
async function removeSupplier(s) {
  if (!(await useConfirm().confirm(`Hapus supplier "${s.name}"? Pembelian lama tetap tersimpan.`))) return
  try {
    await $fetch(`/api/suppliers/${s.id}`, { method: 'DELETE' })
    await refreshSuppliers()
    if (form.value.supplier === s.name) form.value.supplier = suppliers.value?.[0]?.name || ''
  } catch (e) {
    useToast().error(e.data?.statusMessage || 'Gagal menghapus')
  }
}

function openCategories() {
  categoryForm.value = { name: '' }
  categoryError.value = ''
  showCategories.value = true
}
async function saveCategory() {
  categoryError.value = ''
  savingCategory.value = true
  try {
    const created = await $fetch('/api/expense-categories', { method: 'POST', body: categoryForm.value })
    await refreshCategories()
    form.value.category = created.key
    categoryForm.value = { name: '' }
    useToast().success(`Kategori "${created.name}" ditambahkan.`)
  } catch (e) {
    categoryError.value = e.data?.statusMessage || 'Gagal menambah kategori'
  } finally {
    savingCategory.value = false
  }
}
async function removeCategory(c) {
  if (!(await useConfirm().confirm(`Hapus kategori "${c.name}"?`))) return
  try {
    await $fetch(`/api/expense-categories/${c.id}`, { method: 'DELETE' })
    await refreshCategories()
    if (form.value.category === c.key) form.value.category = 'other'
  } catch (e) {
    useToast().error(e.data?.statusMessage || 'Gagal menghapus')
  }
}

function itemsFor(line) {
  return line.itemType === 'packaging' ? packagingItems.value || [] : materials.value || []
}
function selectedItem(line) {
  const list = itemsFor(line)
  const id = line.itemType === 'packaging' ? Number(line.packagingId) : Number(line.materialId)
  return list.find((i) => i.id === id) || null
}
function onTypeChange(line) {
  line.materialId = ''
  line.packagingId = ''
  line.unitPrice = 0
  if (form.value.lines?.length === 1) {
    form.value.category = line.itemType === 'packaging' ? 'packaging' : 'material'
  }
}
function onItemChange(line) {
  const item = selectedItem(line)
  if (item) {
    line.unitPrice = item.pricePerUnit
    const known = (suppliers.value || []).some((s) => s.name === item.supplier)
    if (known && !form.value.supplier) form.value.supplier = item.supplier
  }
}
function lineTotal(line) {
  return Math.round((Number(line.quantity) || 0) * (Number(line.unitPrice) || 0))
}
const grandTotal = computed(() => (form.value.lines || []).reduce((a, l) => a + lineTotal(l), 0))

async function save() {
  errorMsg.value = ''
  saving.value = true
  try {
    await $fetch('/api/purchases', { method: 'POST', body: form.value })
    showForm.value = false
    await refresh()
    useToast().success('Pembelian tersimpan. Stok bertambah dan pengeluaran tercatat.')
  } catch (e) {
    errorMsg.value = e.data?.statusMessage || 'Gagal menyimpan'
  } finally {
    saving.value = false
  }
}
async function remove(p) {
  if (!(await useConfirm().confirm('Hapus pembelian ini? Stok akan dikurangi lagi dan pengeluaran otomatis ikut dihapus.'))) return
  try {
    await $fetch(`/api/purchases/${p.id}`, { method: 'DELETE' })
    await refresh()
  } catch (e) {
    useToast().error(e.data?.statusMessage || 'Gagal menghapus')
  }
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between gap-2">
      <h1 class="text-xl font-bold">Pembelian Supplier</h1>
      <button class="btn-primary" @click="openAdd">
        <PlusIcon class="w-4 h-4" aria-hidden="true" /><span class="hidden sm:inline">Catat Pembelian</span><span class="sm:hidden">Catat</span>
      </button>
    </div>
    <p class="text-xs text-ink-500">
      Satu pembelian menambahkan stok material/packaging dan otomatis membuat pengeluaran dengan jumlah yang sama.
      Harga per unit barang ikut diperbarui dari harga beli terakhir (HPP ikut berubah).
    </p>

    <div class="panel hidden md:block">
      <div class="overflow-x-auto">
        <table class="table-std">
          <thead>
            <tr>
              <th>Tanggal</th>
              <th>Supplier</th>
              <th>Barang</th>
              <th class="text-right">Total</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in paged" :key="p.id">
              <td class="whitespace-nowrap font-mono text-xs">{{ formatDate(p.date) }}</td>
              <td class="font-medium">
                {{ p.supplier }}
                <div v-if="p.notes" class="text-xs text-ink-400">{{ p.notes }}</div>
              </td>
              <td class="text-sm text-ink-600">
                <div v-for="l in p.lines" :key="l.id">
                  {{ l.itemName }} - {{ formatNumber(l.quantity, 1) }} {{ l.unit }}
                </div>
              </td>
              <td class="num">{{ formatIDR(p.totalAmount) }}</td>
              <td class="text-right">
                <button class="btn-danger !py-1 !px-2 text-xs" @click="remove(p)"><TrashIcon class="w-3.5 h-3.5" aria-hidden="true" />Hapus</button>
              </td>
            </tr>
            <tr v-if="!total">
              <td colspan="5" class="text-center text-ink-500 py-6">Belum ada pembelian.</td>
            </tr>
          </tbody>
        </table>
      </div>
      <AppPagination
        v-model:page="page"
        v-model:pageSize="pageSize"
        :total-pages="totalPages"
        :total="total"
        :range-start="rangeStart"
        :range-end="rangeEnd"
      />
    </div>

    <div class="md:hidden space-y-2">
      <div v-for="p in paged" :key="p.id" class="panel p-3 space-y-1">
        <div class="flex items-start justify-between gap-2">
          <div>
            <div class="font-medium">{{ p.supplier }}</div>
            <div class="text-xs font-mono text-ink-500">{{ formatDate(p.date) }}</div>
          </div>
          <div class="font-mono font-semibold">{{ formatIDR(p.totalAmount) }}</div>
        </div>
        <div class="text-xs text-ink-500">
          <div v-for="l in p.lines" :key="l.id">{{ l.itemName }} - {{ formatNumber(l.quantity, 1) }} {{ l.unit }}</div>
        </div>
        <button class="btn-danger !py-1 !px-2 text-xs" @click="remove(p)"><TrashIcon class="w-3.5 h-3.5" aria-hidden="true" />Hapus</button>
      </div>
      <p v-if="!total" class="panel p-6 text-center text-sm text-ink-500">Belum ada pembelian.</p>
    </div>

    <AppModal v-if="showForm" title="Catat Pembelian Supplier" size="lg" @close="showForm = false">
      <form class="space-y-3" @submit.prevent="save">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div class="date-field">
            <label class="label">Tanggal</label>
            <input v-model="form.date" type="date" class="input" required />
          </div>
          <div class="min-w-0">
            <label class="label">Supplier</label>
            <div class="flex gap-2 min-w-0">
              <select v-model="form.supplier" class="input min-w-0" required>
                <option value="" disabled>Pilih supplier...</option>
                <option v-for="s in suppliers" :key="s.id" :value="s.name">{{ s.name }}</option>
              </select>
              <button type="button" class="btn-secondary shrink-0" title="Kelola supplier" @click="openSuppliers">
                <PlusIcon class="w-4 h-4" />
              </button>
            </div>
          </div>
          <div class="sm:col-span-2 min-w-0">
            <label class="label">Kategori pengeluaran</label>
            <div class="flex gap-2 min-w-0">
              <select v-model="form.category" class="input min-w-0" required>
                <option v-for="c in categories" :key="c.key" :value="c.key">{{ c.name }}</option>
              </select>
              <button type="button" class="btn-secondary shrink-0" title="Kelola kategori" @click="openCategories">
                <PlusIcon class="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
        <div>
          <label class="label">Catatan</label>
          <input v-model="form.notes" class="input" placeholder="opsional - no. invoice / ekspedisi" />
        </div>

        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <span class="label !mb-0">Barang</span>
            <button type="button" class="btn-secondary !py-1 text-xs" @click="form.lines.push(emptyLine())">
              <PlusIcon class="w-3.5 h-3.5" />Baris
            </button>
          </div>
          <div v-for="(line, i) in form.lines" :key="i" class="border border-ink-200 rounded-panel p-3 space-y-2">
            <div class="flex items-start gap-2">
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 flex-1">
                <div>
                  <label class="label">Jenis</label>
                  <select v-model="line.itemType" class="input !py-1" @change="onTypeChange(line)">
                    <option value="material">Material</option>
                    <option value="packaging">Packaging</option>
                  </select>
                </div>
                <div>
                  <label class="label">Item</label>
                  <select
                    v-if="line.itemType === 'material'"
                    v-model="line.materialId"
                    class="input !py-1"
                    required
                    @change="onItemChange(line)"
                  >
                    <option value="" disabled>Pilih material...</option>
                    <option v-for="m in materials" :key="m.id" :value="m.id">{{ m.name }} ({{ m.unit }})</option>
                  </select>
                  <select
                    v-else
                    v-model="line.packagingId"
                    class="input !py-1"
                    required
                    @change="onItemChange(line)"
                  >
                    <option value="" disabled>Pilih packaging...</option>
                    <option v-for="pk in packagingItems" :key="pk.id" :value="pk.id">{{ pk.name }} ({{ pk.unit }})</option>
                  </select>
                </div>
              </div>
              <button
                type="button"
                class="text-red-500 hover:text-red-700 p-1 mt-5 shrink-0"
                title="Hapus baris"
                @click="form.lines.splice(i, 1)"
              >
                <XMarkIcon class="w-5 h-5" />
              </button>
            </div>
            <div class="grid grid-cols-3 gap-2">
              <div>
                <label class="label">Qty ({{ selectedItem(line)?.unit || 'unit' }})</label>
                <input v-model.number="line.quantity" type="number" min="0" step="0.1" class="input-num !py-1 w-full" required />
              </div>
              <div>
                <label class="label">Harga / unit</label>
                <IdrInput v-model="line.unitPrice" required input-class="!py-1 w-full" />
              </div>
              <div>
                <label class="label">Subtotal</label>
                <div class="input-num !py-1 bg-ink-50">{{ formatIDR(lineTotal(line)) }}</div>
              </div>
            </div>
          </div>
        </div>

        <div class="flex items-center justify-between pt-1 border-t border-ink-200">
          <span class="text-sm text-ink-500">Total pengeluaran</span>
          <span class="font-mono text-lg font-bold">{{ formatIDR(grandTotal) }}</span>
        </div>
        <p v-if="errorMsg" class="text-sm text-red-600">{{ errorMsg }}</p>
        <div class="flex justify-end gap-2">
          <button type="button" class="btn-secondary" @click="showForm = false"><XMarkIcon class="w-4 h-4" />Batal</button>
          <button type="submit" class="btn-primary" :disabled="saving">
            <CheckIcon class="w-4 h-4" />{{ saving ? 'Menyimpan...' : 'Simpan Pembelian' }}
          </button>
        </div>
      </form>
    </AppModal>

    <AppModal v-if="showSuppliers" title="Supplier" nested @close="showSuppliers = false">
      <div class="space-y-4">
        <form class="space-y-3" @submit.prevent="saveSupplier">
          <div>
            <label class="label">Nama supplier baru</label>
            <input v-model="supplierForm.name" class="input" required placeholder="Tokopedia - 3DZaiku" />
          </div>
          <div>
            <label class="label">Catatan</label>
            <input v-model="supplierForm.notes" class="input" placeholder="opsional" />
          </div>
          <p v-if="supplierError" class="text-sm text-red-600">{{ supplierError }}</p>
          <div class="flex justify-end">
            <button type="submit" class="btn-primary" :disabled="savingSupplier">
              <CheckIcon class="w-4 h-4" />{{ savingSupplier ? 'Menyimpan...' : 'Tambah' }}
            </button>
          </div>
        </form>

        <div>
          <div class="label">Daftar supplier</div>
          <ul v-if="suppliers?.length" class="border border-ink-200 rounded-panel divide-y divide-ink-100 max-h-56 overflow-y-auto">
            <li v-for="s in suppliers" :key="s.id" class="flex items-center gap-2 px-3 py-2">
              <div class="min-w-0 flex-1">
                <div class="font-medium text-sm truncate">{{ s.name }}</div>
                <div v-if="s.notes" class="text-xs text-ink-400 truncate">{{ s.notes }}</div>
              </div>
              <button type="button" class="btn-danger !py-1 !px-2 text-xs" @click="removeSupplier(s)">
                <TrashIcon class="w-3.5 h-3.5" />
              </button>
            </li>
          </ul>
          <p v-else class="text-sm text-ink-500 py-3 text-center">Belum ada supplier. Tambahkan lewat form di atas.</p>
        </div>
      </div>
    </AppModal>

    <AppModal v-if="showCategories" title="Kategori Pengeluaran" nested @close="showCategories = false">
      <div class="space-y-4">
        <form class="space-y-3" @submit.prevent="saveCategory">
          <div>
            <label class="label">Nama kategori baru</label>
            <input v-model="categoryForm.name" class="input" required placeholder="Packaging / Iklan / Ongkir" />
          </div>
          <p v-if="categoryError" class="text-sm text-red-600">{{ categoryError }}</p>
          <div class="flex justify-end">
            <button type="submit" class="btn-primary" :disabled="savingCategory">
              <CheckIcon class="w-4 h-4" />{{ savingCategory ? 'Menyimpan...' : 'Tambah' }}
            </button>
          </div>
        </form>
        <div>
          <div class="label">Daftar kategori</div>
          <ul v-if="categories?.length" class="border border-ink-200 rounded-panel divide-y divide-ink-100 max-h-56 overflow-y-auto">
            <li v-for="c in categories" :key="c.id" class="flex items-center gap-2 px-3 py-2">
              <span class="text-sm font-medium">{{ c.name }}</span>
              <span v-if="c.isSystem" class="text-xs text-ink-400">bawaan</span>
              <button
                v-if="!c.isSystem"
                type="button"
                class="btn-danger !py-1 !px-2 text-xs ml-auto"
                @click="removeCategory(c)"
              >
                <TrashIcon class="w-3.5 h-3.5" />
              </button>
            </li>
          </ul>
        </div>
      </div>
    </AppModal>
  </div>
</template>
