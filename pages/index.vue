<script setup>
import { ArrowPathIcon, ArrowTrendingUpIcon, ArrowTrendingDownIcon } from '@heroicons/vue/24/outline'
import { categoryBadgeClass } from '~/utils/expenseCategory.js'

const { data, refresh, status } = await useFetch('/api/dashboard')

const channelLabel = {
  tokopedia: 'Tokopedia',
  shopee: 'Shopee',
  tiktok_shop: 'TikTok Shop',
  instagram: 'Instagram',
  whatsapp: 'WhatsApp',
  direct: 'Langsung',
  other: 'Lainnya'
}

const monthLabel = computed(() => {
  const key = data.value?.month
  if (!key) return ''
  const [y, m] = key.split('-')
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })
})

function deltaClass(n) {
  if (n > 0) return 'text-green-600'
  if (n < 0) return 'text-red-600'
  return 'text-ink-400'
}
function signedPct(n) {
  if (n == null) return '—'
  const v = Number(n) || 0
  return (v > 0 ? '+' : '') + v + '%'
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between gap-2">
      <div>
        <h1 class="text-xl font-bold">Dashboard</h1>
        <p class="text-xs text-ink-500">
          {{ monthLabel }} · {{ formatDate(data?.range?.from) }} – {{ formatDate(data?.range?.to) }}
          <span class="text-ink-400"> (vs periode sama bulan lalu)</span>
        </p>
      </div>
      <div class="flex items-center gap-2">
        <NuxtLink to="/reports" class="btn-secondary !py-1.5 text-xs">Laporan</NuxtLink>
        <button class="btn-secondary !py-1.5" :disabled="status === 'pending'" @click="refresh()">
          <ArrowPathIcon class="w-4 h-4" />
        </button>
      </div>
    </div>

    <div class="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
      <div class="panel p-3 sm:p-4">
        <div class="text-xs font-semibold uppercase tracking-wide text-ink-500">Penjualan bersih</div>
        <div class="mt-1 text-lg sm:text-2xl font-mono font-semibold text-teal-700">{{ formatIDR(data?.pl?.netRevenue) }}</div>
        <div class="mt-1 flex items-center gap-1 text-xs" :class="deltaClass(data?.vsPrev?.netRevenue)">
          <ArrowTrendingUpIcon v-if="(data?.vsPrev?.netRevenue || 0) >= 0" class="w-3.5 h-3.5" />
          <ArrowTrendingDownIcon v-else class="w-3.5 h-3.5" />
          {{ signedPct(data?.vsPrev?.netRevenue) }}
          <span class="text-ink-400 font-normal">{{ data?.pl?.orderCount || 0 }} order · {{ data?.pl?.unitsSold || 0 }} unit</span>
        </div>
      </div>
      <div class="panel p-3 sm:p-4">
        <div class="text-xs font-semibold uppercase tracking-wide text-ink-500">Laba bersih</div>
        <div
          class="mt-1 text-lg sm:text-2xl font-mono font-semibold"
          :class="(data?.pl?.netProfit || 0) >= 0 ? 'text-green-700' : 'text-red-600'"
        >
          {{ formatIDR(data?.pl?.netProfit) }}
        </div>
        <div class="mt-1 text-xs" :class="deltaClass(data?.vsPrev?.netProfit)">
          {{ signedPct(data?.vsPrev?.netProfit) }}
          <span class="text-ink-400">margin {{ data?.pl?.netProfitPercent || 0 }}%</span>
        </div>
      </div>
      <div class="panel p-3 sm:p-4">
        <div class="text-xs font-semibold uppercase tracking-wide text-ink-500">Kas keluar</div>
        <div class="mt-1 text-lg sm:text-2xl font-mono font-semibold text-red-600">{{ formatIDR(data?.pl?.totalCashOut) }}</div>
        <div class="mt-1 text-xs text-ink-500">
          Operasional {{ formatIDR(data?.pl?.operatingExpenses) }}
          · Material {{ formatIDR(data?.pl?.materialPurchases) }}
        </div>
      </div>
      <div class="panel p-3 sm:p-4">
        <div class="text-xs font-semibold uppercase tracking-wide text-ink-500">Estimasi kas</div>
        <div class="mt-1 text-lg sm:text-2xl font-mono font-semibold text-ink-900">{{ formatIDR(data?.capital?.estimatedCash) }}</div>
        <div class="mt-1 text-xs text-ink-500">Modal bersih {{ formatIDR(data?.capital?.netCapital) }}</div>
      </div>
    </div>

    <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
      <div class="panel p-3">
        <div class="text-[10px] uppercase font-semibold text-ink-400">Omzet kotor</div>
        <div class="font-mono font-semibold">{{ formatIDR(data?.pl?.grossRevenue) }}</div>
      </div>
      <div class="panel p-3">
        <div class="text-[10px] uppercase font-semibold text-ink-400">Fee marketplace</div>
        <div class="font-mono font-semibold">{{ formatIDR(data?.pl?.marketplaceFees) }}</div>
      </div>
      <div class="panel p-3">
        <div class="text-[10px] uppercase font-semibold text-ink-400">HPP (COGS)</div>
        <div class="font-mono font-semibold">{{ formatIDR(data?.pl?.cogs) }}</div>
      </div>
      <div class="panel p-3">
        <div class="text-[10px] uppercase font-semibold text-ink-400">Laba kotor</div>
        <div class="font-mono font-semibold" :class="(data?.pl?.grossProfit || 0) >= 0 ? 'text-green-700' : 'text-red-600'">
          {{ formatIDR(data?.pl?.grossProfit) }}
          <span class="text-xs text-ink-400 font-normal">{{ data?.pl?.grossProfitPercent || 0 }}%</span>
        </div>
      </div>
      <div class="panel p-3">
        <div class="text-[10px] uppercase font-semibold text-ink-400">Pembelian stok</div>
        <div class="font-mono font-semibold">{{ formatIDR(data?.purchases?.amount) }}</div>
        <div class="text-xs text-ink-400">{{ data?.purchases?.count || 0 }} transaksi</div>
      </div>
      <div class="panel p-3">
        <div class="text-[10px] uppercase font-semibold text-ink-400">Katalog</div>
        <div class="font-mono font-semibold">{{ data?.inventory?.productsActive || 0 }} aktif</div>
        <div class="text-xs text-ink-400">
          {{ data?.inventory?.productsDraft || 0 }} draft · {{ data?.inventory?.productsRnd || 0 }} R&amp;D · {{ data?.inventory?.series || 0 }} series · {{ data?.inventory?.machines || 0 }} mesin
        </div>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-3">
      <div class="panel">
        <div class="panel-header">
          <span class="panel-title">Top produk (margin)</span>
          <NuxtLink to="/reports" class="text-xs text-accent-600 hover:underline">Semua</NuxtLink>
        </div>
        <table v-if="data?.topProducts?.length" class="table-std">
          <thead>
            <tr>
              <th>Produk</th>
              <th class="text-right">Unit</th>
              <th class="text-right">Bersih</th>
              <th class="text-right">Margin</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in data.topProducts" :key="p.productId">
              <td class="font-medium">{{ p.productName }}</td>
              <td class="num">{{ p.units }}</td>
              <td class="num">{{ formatIDR(p.netRevenue) }}</td>
              <td class="num" :class="p.margin >= 0 ? 'text-green-600' : 'text-red-600'">{{ formatIDR(p.margin) }}</td>
            </tr>
          </tbody>
        </table>
        <p v-else class="p-4 text-sm text-ink-500">Belum ada penjualan bulan ini.</p>
      </div>

      <div class="panel">
        <div class="panel-header">
          <span class="panel-title">Penjualan per channel</span>
        </div>
        <div v-if="data?.channels?.length" class="p-4 space-y-3">
          <div v-for="c in data.channels" :key="c.channel" class="space-y-1">
            <div class="flex items-center justify-between text-sm gap-2">
              <span class="font-medium">{{ channelLabel[c.channel] || c.channel }}</span>
              <span class="font-mono text-xs">{{ formatIDR(c.netRevenue) }} · {{ c.units }} unit</span>
            </div>
            <div class="h-2 rounded-full bg-ink-100 overflow-hidden">
              <div
                class="h-full bg-accent-500 rounded-full"
                :style="{ width: Math.max(4, Math.round((c.netRevenue / (data.pl?.netRevenue || 1)) * 100)) + '%' }"
              />
            </div>
          </div>
        </div>
        <p v-else class="p-4 text-sm text-ink-500">Belum ada penjualan.</p>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-3">
      <div class="panel">
        <div class="panel-header">
          <span class="panel-title">Pengeluaran per kategori</span>
          <NuxtLink to="/expenses" class="text-xs text-accent-600 hover:underline">Pengeluaran</NuxtLink>
        </div>
        <div v-if="data?.expensesByCategory?.length" class="p-4 space-y-3">
          <div v-for="c in data.expensesByCategory" :key="c.category" class="space-y-1">
            <div class="flex items-center justify-between text-sm gap-2">
              <span class="badge" :class="categoryBadgeClass(c.category)">{{ c.name }}</span>
              <span class="font-mono text-xs">{{ formatIDR(c.amount) }} · {{ c.count }}x</span>
            </div>
            <div class="h-2 rounded-full bg-ink-100 overflow-hidden">
              <div class="h-full bg-red-400/80 rounded-full" :style="{ width: Math.max(4, c.percent) + '%' }" />
            </div>
          </div>
        </div>
        <p v-else class="p-4 text-sm text-ink-500">Belum ada pengeluaran bulan ini.</p>
      </div>

      <div class="panel">
        <div class="panel-header">
          <span class="panel-title">Stok rendah</span>
          <span class="text-xs text-ink-400">{{ data?.inventory?.materials }} material · {{ data?.inventory?.packaging }} packaging</span>
        </div>
        <div class="p-4 space-y-2 text-sm">
          <template v-if="data?.lowMaterials?.length || data?.lowPackaging?.length">
            <NuxtLink
              v-for="m in data.lowMaterials"
              :key="'m' + m.id"
              to="/materials"
              class="flex items-center justify-between hover:bg-ink-50 -mx-1 px-1 rounded"
            >
              <span>{{ m.name }}</span>
              <span class="badge bg-amber-100 text-amber-800 font-mono">{{ formatNumber(m.stockQuantity, 1) }} {{ m.unit }}</span>
            </NuxtLink>
            <NuxtLink
              v-for="p in data.lowPackaging"
              :key="'p' + p.id"
              to="/packaging"
              class="flex items-center justify-between hover:bg-ink-50 -mx-1 px-1 rounded"
            >
              <span>{{ p.name }} <span class="text-ink-400">(packaging)</span></span>
              <span class="badge bg-amber-100 text-amber-800 font-mono">{{ formatNumber(p.stockQuantity, 1) }} {{ p.unit }}</span>
            </NuxtLink>
          </template>
          <p v-else class="text-ink-500">Semua stok aman.</p>
        </div>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-3">
      <div class="panel">
        <div class="panel-header">
          <span class="panel-title">Penjualan terbaru</span>
          <NuxtLink to="/sales" class="text-xs text-accent-600 hover:underline">Semua</NuxtLink>
        </div>
        <table v-if="data?.recentSales?.length" class="table-std">
          <thead>
            <tr>
              <th>Tanggal</th>
              <th>Produk</th>
              <th>Channel</th>
              <th class="text-right">Bersih</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="s in data.recentSales" :key="s.id">
              <td class="whitespace-nowrap font-mono text-xs">{{ formatDate(s.date) }}</td>
              <td>{{ s.productName }} <span class="text-ink-400">×{{ s.quantity }}</span></td>
              <td><span class="badge bg-ink-100 text-ink-600">{{ channelLabel[s.channel] || s.channel }}</span></td>
              <td class="num">{{ formatIDR(s.netRevenue) }}</td>
            </tr>
          </tbody>
        </table>
        <p v-else class="p-4 text-sm text-ink-500">Belum ada penjualan.</p>
      </div>

      <div class="panel">
        <div class="panel-header">
          <span class="panel-title">Pengeluaran terbaru</span>
          <NuxtLink to="/expenses" class="text-xs text-accent-600 hover:underline">Semua</NuxtLink>
        </div>
        <table v-if="data?.recentExpenses?.length" class="table-std">
          <thead>
            <tr>
              <th>Tanggal</th>
              <th>Deskripsi</th>
              <th class="text-right">Jumlah</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="e in data.recentExpenses" :key="e.id">
              <td class="whitespace-nowrap font-mono text-xs">{{ formatDate(e.date) }}</td>
              <td>
                <div class="truncate max-w-[220px] sm:max-w-none">{{ e.description }}</div>
                <span class="badge" :class="categoryBadgeClass(e.category)">{{ e.categoryName || e.category }}</span>
              </td>
              <td class="num text-red-600">{{ formatIDR(e.amount) }}</td>
            </tr>
          </tbody>
        </table>
        <p v-else class="p-4 text-sm text-ink-500">Belum ada pengeluaran.</p>
      </div>
    </div>
  </div>
</template>
