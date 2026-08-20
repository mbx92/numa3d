<script setup>
const { data: logs } = await useFetch('/api/audit-logs')

const entityLabel = {
  auth: 'Login',
  material: 'Material',
  machine: 'Mesin',
  packaging: 'Packaging',
  product: 'Produk',
  product_recipe: 'Recipe',
  product_file: 'File 3D',
  settings: 'Pengaturan',
  user: 'User',
  expense: 'Pengeluaran',
  sale: 'Penjualan'
}
const actionBadge = {
  create: 'bg-green-100 text-green-700',
  update: 'bg-accent-100 text-accent-700',
  delete: 'bg-red-100 text-red-700',
  login: 'bg-teal-500/10 text-teal-600',
  login_failed: 'bg-amber-100 text-amber-700',
  login_blocked: 'bg-red-100 text-red-700'
}
const actionLabel = {
  create: 'Tambah',
  update: 'Ubah',
  delete: 'Hapus',
  login: 'Login',
  login_failed: 'Login gagal',
  login_blocked: 'Diblokir'
}

const entityFilter = ref('')
const filteredLogs = computed(() => {
  if (!entityFilter.value) return logs.value || []
  return (logs.value || []).filter((l) => l.entity === entityFilter.value)
})
const { page, pageSize, paged, total, totalPages, rangeStart, rangeEnd, reset } = usePagination(
  filteredLogs,
  25
)
watch(entityFilter, reset)

// Percobaan login gagal/diblokir yang menumpuk adalah sinyal yang perlu dilihat
// duluan, jadi diringkas di atas tabel.
const failedLoginCount = computed(
  () => (logs.value || []).filter((l) => l.action === 'login_failed' || l.action === 'login_blocked').length
)

function formatTime(value) {
  return new Date(value).toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between flex-wrap gap-2">
      <h1 class="text-xl font-bold">Log Aktivitas</h1>
      <select v-model="entityFilter" class="input w-full sm:w-44">
        <option value="">Semua kategori</option>
        <option v-for="(label, key) in entityLabel" :key="key" :value="key">{{ label }}</option>
      </select>
    </div>

    <p class="text-xs text-ink-500">
      200 aktivitas terakhir di seluruh sistem — perubahan data dan percobaan login.
    </p>

    <div
      v-if="failedLoginCount"
      class="panel p-3 flex items-center justify-between gap-2 border-l-4 border-l-amber-500"
    >
      <span class="text-sm text-ink-600">Percobaan login gagal / diblokir dalam log ini</span>
      <span class="font-mono font-semibold text-amber-600">{{ failedLoginCount }}</span>
    </div>

    <!-- Kartu (mobile) -->
    <div class="md:hidden space-y-2">
      <div v-for="l in paged" :key="l.id" class="panel p-3 space-y-1">
        <div class="flex items-start justify-between gap-2">
          <span class="badge shrink-0" :class="actionBadge[l.action]">{{ actionLabel[l.action] || l.action }}</span>
          <span class="font-mono text-xs text-ink-500">{{ formatTime(l.createdAt) }}</span>
        </div>
        <div class="text-sm break-words">{{ l.summary }}</div>
        <div class="text-xs text-ink-400">
          {{ l.username }} · {{ entityLabel[l.entity] || l.entity }}
        </div>
      </div>
      <p v-if="!total" class="panel p-6 text-center text-sm text-ink-500">Belum ada aktivitas tercatat.</p>
      <div v-else class="panel">
        <AppPagination
          v-model:page="page"
          v-model:pageSize="pageSize"
          :total-pages="totalPages"
          :total="total"
          :range-start="rangeStart"
          :range-end="rangeEnd"
        />
      </div>
    </div>

    <div class="panel hidden md:block">
      <div class="overflow-x-auto">
        <table class="table-std">
          <thead>
            <tr>
              <th>Waktu</th>
              <th>User</th>
              <th>Aksi</th>
              <th>Kategori</th>
              <th>Ringkasan</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="l in paged" :key="l.id">
              <td class="whitespace-nowrap font-mono text-xs text-ink-500">{{ formatTime(l.createdAt) }}</td>
              <td class="font-medium">{{ l.username }}</td>
              <td><span class="badge whitespace-nowrap" :class="actionBadge[l.action]">{{ actionLabel[l.action] || l.action }}</span></td>
              <td class="text-ink-500">{{ entityLabel[l.entity] || l.entity }}</td>
              <td>{{ l.summary }}</td>
            </tr>
            <tr v-if="!total">
              <td colspan="5" class="text-center text-ink-500 py-6">Belum ada aktivitas tercatat.</td>
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
  </div>
</template>
