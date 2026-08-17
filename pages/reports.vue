<script setup>
import { CalendarDaysIcon, ArrowPathIcon } from '@heroicons/vue/24/outline'
import { categoryNameOf } from '~/utils/expenseCategory.js'

const filters = ref({ dateFrom: monthStartStr(), dateTo: todayStr() })
const query = computed(() => {
  const q = {}
  if (filters.value.dateFrom) q.dateFrom = filters.value.dateFrom
  if (filters.value.dateTo) q.dateTo = filters.value.dateTo
  return q
})

const { data: summary } = await useFetch('/api/reports/summary', { query })
const { data: byProduct } = await useFetch('/api/reports/products', { query })
const { data: byChannel } = await useFetch('/api/reports/channels', { query })
const { data: byExpense } = await useFetch('/api/reports/expenses', { query })
const { data: monthly } = await useFetch('/api/reports/monthly', { query: { months: 12 } })
const { data: expenseCategories } = await useFetch('/api/expense-categories')

const tabs = [
  { key: 'summary', label: 'Laba Rugi' },
  { key: 'products', label: 'Per Produk' },
  { key: 'channels', label: 'Per Channel' },
  { key: 'expenses', label: 'Pengeluaran' },
  { key: 'monthly', label: 'Tren Bulanan' }
]
const tab = ref('summary')

function setThisMonth() {
  filters.value = { dateFrom: monthStartStr(), dateTo: todayStr() }
}
function setLast30() {
  const d = new Date()
  d.setDate(d.getDate() - 29)
  filters.value = {
    dateFrom: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
    dateTo: todayStr()
  }
}
function setThisYear() {
  filters.value = { dateFrom: `${new Date().getFullYear()}-01-01`, dateTo: todayStr() }
}

const channelLabel = {
  tokopedia: 'Tokopedia',
  shopee: 'Shopee',
  tiktok_shop: 'TikTok Shop',
  instagram: 'Instagram',
  whatsapp: 'WhatsApp',
  direct: 'Langsung',
  other: 'Lainnya'
}

function expenseCatName(key) {
  return categoryNameOf(expenseCategories.value, key)
}

const productPager = usePagination(computed(() => byProduct.value || []), 10)
watch(query, productPager.reset, { deep: true })

const maxMonthly = computed(() =>
  Math.max(...(monthly.value || []).map((m) => Math.abs(m.netRevenue)), 1)
)
function monthLabel(key) {
  const [y, m] = key.split('-')
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('id-ID', { month: 'short', year: '2-digit' })
}
</script>

<template>
  <div class="space-y-4">
    <h1 class="text-xl font-bold">Laporan</h1>

    <!-- Rentang tanggal -->
    <div class="panel p-3 flex flex-wrap items-end gap-2">
      <div class="flex-1 min-w-[8rem]">
        <label class="label">Dari</label>
        <input v-model="filters.dateFrom" type="date" class="input !py-1.5" />
      </div>
      <div class="flex-1 min-w-[8rem]">
        <label class="label">Sampai</label>
        <input v-model="filters.dateTo" type="date" class="input !py-1.5" />
      </div>
      <div class="flex gap-2 w-full sm:w-auto">
        <button class="btn-secondary !py-1.5 text-xs flex-1" @click="setThisMonth"><CalendarDaysIcon class="w-3.5 h-3.5" />Bulan ini</button>
        <button class="btn-secondary !py-1.5 text-xs flex-1" @click="setLast30"><ArrowPathIcon class="w-3.5 h-3.5" />30 hari</button>
        <button class="btn-secondary !py-1.5 text-xs flex-1" @click="setThisYear">Tahun ini</button>
      </div>
    </div>

    <!-- Tab -->
    <div class="flex gap-1 overflow-x-auto border-b border-ink-200">
      <button
        v-for="t in tabs"
        :key="t.key"
        class="px-3 py-2 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors"
        :class="tab === t.key ? 'border-accent-500 text-accent-600' : 'border-transparent text-ink-500 hover:text-ink-800'"
        @click="tab = t.key"
      >
        {{ t.label }}
      </button>
    </div>

    <!-- Laba rugi -->
    <div v-if="tab === 'summary'" class="space-y-3">
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
        <div class="panel p-3">
          <div class="text-xs text-ink-500 uppercase font-semibold">Revenue bersih</div>
          <div class="font-mono text-lg sm:text-xl font-semibold text-teal-600">{{ formatIDR(summary?.netRevenue) }}</div>
          <div class="text-xs text-ink-400">{{ formatNumber(summary?.unitsSold) }} unit · {{ summary?.orderCount }} transaksi</div>
        </div>
        <div class="panel p-3">
          <div class="text-xs text-ink-500 uppercase font-semibold">Laba kotor</div>
          <div class="font-mono text-lg sm:text-xl font-semibold">{{ formatIDR(summary?.grossProfit) }}</div>
          <div class="text-xs text-ink-400">{{ summary?.grossProfitPercent }}% dari revenue bersih</div>
        </div>
        <div class="panel p-3">
          <div class="text-xs text-ink-500 uppercase font-semibold">Biaya operasional</div>
          <div class="font-mono text-lg sm:text-xl font-semibold text-red-600">{{ formatIDR(summary?.operatingExpenses) }}</div>
          <div class="text-xs text-ink-400">di luar pembelian material</div>
        </div>
        <div class="panel p-3">
          <div class="text-xs text-ink-500 uppercase font-semibold">Laba bersih</div>
          <div
            class="font-mono text-lg sm:text-xl font-semibold"
            :class="(summary?.netProfit ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'"
          >
            {{ formatIDR(summary?.netProfit) }}
          </div>
          <div class="text-xs text-ink-400">{{ summary?.netProfitPercent }}% dari revenue bersih</div>
        </div>
      </div>

      <div class="panel">
        <div class="panel-header"><span class="panel-title">Rincian Laba Rugi</span></div>
        <table class="table-std">
          <tbody>
            <tr>
              <td>Revenue kotor</td>
              <td class="num">{{ formatIDR(summary?.grossRevenue) }}</td>
            </tr>
            <tr>
              <td class="pl-6 text-ink-500">− Fee marketplace</td>
              <td class="num text-red-600">{{ formatIDR(summary?.marketplaceFees) }}</td>
            </tr>
            <tr class="bg-ink-50 font-medium">
              <td>Revenue bersih</td>
              <td class="num text-teal-600">{{ formatIDR(summary?.netRevenue) }}</td>
            </tr>
            <tr>
              <td class="pl-6 text-ink-500">− HPP unit terjual</td>
              <td class="num text-red-600">{{ formatIDR(summary?.cogs) }}</td>
            </tr>
            <tr class="bg-ink-50 font-medium">
              <td>Laba kotor</td>
              <td class="num">{{ formatIDR(summary?.grossProfit) }}</td>
            </tr>
            <tr>
              <td class="pl-6 text-ink-500">− Biaya operasional</td>
              <td class="num text-red-600">{{ formatIDR(summary?.operatingExpenses) }}</td>
            </tr>
            <tr class="bg-ink-50 font-semibold">
              <td>Laba bersih</td>
              <td class="num text-base" :class="(summary?.netProfit ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'">
                {{ formatIDR(summary?.netProfit) }}
              </td>
            </tr>
          </tbody>
        </table>
        <div class="p-3 space-y-2 border-t border-ink-200 text-xs text-ink-500">
          <p>
            Pembelian material periode ini <span class="font-mono">{{ formatIDR(summary?.materialPurchases) }}</span>
            tidak dikurangkan dari laba karena biaya material sudah termasuk dalam HPP per unit yang terjual —
            mengurangkan keduanya akan menghitung biaya material dua kali.
          </p>
          <p>
            Pembelian mesin <span class="font-mono">{{ formatIDR(summary?.machinePurchases) }}</span>
            juga tidak dikurangkan dari laba (aset; masuk HPP lewat depresiasi). Tetap terhitung di kas keluar.
          </p>
          <p>
            Total kas keluar periode ini (pembelian material + biaya operasional):
            <span class="font-mono font-semibold text-ink-700">{{ formatIDR(summary?.totalCashOut) }}</span>
          </p>
        </div>
      </div>
    </div>

    <!-- Per produk -->
    <div v-else-if="tab === 'products'" class="panel">
      <div class="overflow-x-auto">
        <table class="table-std min-w-[52rem]">
          <thead>
            <tr>
              <th>Produk</th>
              <th class="text-right">Unit</th>
              <th class="text-right">Harga rata²</th>
              <th class="text-right">Revenue bersih</th>
              <th class="text-right">Total HPP</th>
              <th class="text-right">Margin bersih</th>
              <th class="text-right">Margin %</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in productPager.paged.value" :key="r.productId">
              <td class="font-medium">
                <NuxtLink :to="`/products/${r.productId}`" class="hover:text-accent-600">{{ r.productName }}</NuxtLink>
                <div class="text-xs text-ink-400">{{ r.orders }} transaksi · HPP {{ formatIDR(r.hppPerUnit) }}/unit</div>
              </td>
              <td class="num">{{ formatNumber(r.units) }}</td>
              <td class="num">{{ formatIDR(r.avgSalePrice) }}</td>
              <td class="num">{{ formatIDR(r.netRevenue) }}</td>
              <td class="num">{{ formatIDR(r.totalHpp) }}</td>
              <td class="num" :class="r.netMargin >= 0 ? 'text-green-600' : 'text-red-600'">{{ formatIDR(r.netMargin) }}</td>
              <td class="num" :class="r.netMargin >= 0 ? 'text-green-600' : 'text-red-600'">{{ r.netMarginPercent }}%</td>
            </tr>
            <tr v-if="!productPager.total.value">
              <td colspan="7" class="text-center text-ink-500 py-6">Tidak ada penjualan pada rentang ini.</td>
            </tr>
          </tbody>
        </table>
      </div>
      <AppPagination
        v-model:page="productPager.page.value"
        v-model:pageSize="productPager.pageSize.value"
        :total-pages="productPager.totalPages.value"
        :total="productPager.total.value"
        :range-start="productPager.rangeStart.value"
        :range-end="productPager.rangeEnd.value"
      />
    </div>

    <!-- Per channel -->
    <div v-else-if="tab === 'channels'" class="panel overflow-x-auto">
      <table class="table-std min-w-[44rem]">
        <thead>
          <tr>
            <th>Channel</th>
            <th class="text-right">Transaksi</th>
            <th class="text-right">Unit</th>
            <th class="text-right">Nilai rata²</th>
            <th class="text-right">Fee</th>
            <th class="text-right">Margin bersih</th>
            <th class="text-right">Margin %</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="c in byChannel" :key="c.channel">
            <td class="font-medium">{{ channelLabel[c.channel] || c.channel }}</td>
            <td class="num">{{ c.orders }}</td>
            <td class="num">{{ formatNumber(c.units) }}</td>
            <td class="num">{{ formatIDR(c.avgOrderValue) }}</td>
            <td class="num text-red-600">{{ formatIDR(c.feeAmount) }}</td>
            <td class="num" :class="c.netMargin >= 0 ? 'text-green-600' : 'text-red-600'">{{ formatIDR(c.netMargin) }}</td>
            <td class="num" :class="c.netMargin >= 0 ? 'text-green-600' : 'text-red-600'">{{ c.netMarginPercent }}%</td>
          </tr>
          <tr v-if="!byChannel?.length">
            <td colspan="7" class="text-center text-ink-500 py-6">Tidak ada penjualan pada rentang ini.</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Pengeluaran per kategori -->
    <div v-else-if="tab === 'expenses'" class="panel">
      <div class="panel-header">
        <span class="panel-title">Pengeluaran per Kategori</span>
        <span class="font-mono font-semibold text-red-600">{{ formatIDR(byExpense?.total) }}</span>
      </div>
      <div class="p-4 space-y-3">
        <div v-for="c in byExpense?.categories" :key="c.category" class="space-y-1">
          <div class="flex items-center justify-between text-sm gap-2">
            <span class="font-medium">{{ expenseCatName(c.category) }}</span>
            <span class="font-mono">{{ formatIDR(c.amount) }} <span class="text-ink-400">({{ c.percent }}%)</span></span>
          </div>
          <div class="h-2 rounded-full bg-ink-100 overflow-hidden">
            <div class="h-full bg-accent-500 rounded-full" :style="{ width: c.percent + '%' }"></div>
          </div>
          <div class="text-xs text-ink-400">{{ c.count }} entri</div>
        </div>
        <p v-if="!byExpense?.categories?.length" class="text-center text-ink-500 py-6 text-sm">
          Tidak ada pengeluaran pada rentang ini.
        </p>
      </div>
    </div>

    <!-- Tren bulanan -->
    <div v-else-if="tab === 'monthly'" class="space-y-3">
      <p class="text-xs text-ink-500">12 bulan terakhir (tidak mengikuti filter tanggal di atas).</p>
      <div class="panel p-4 space-y-2">
        <div v-for="m in monthly" :key="m.month" class="space-y-1">
          <div class="flex items-center justify-between text-sm gap-2">
            <span class="font-medium w-16 shrink-0">{{ monthLabel(m.month) }}</span>
            <span class="font-mono text-xs text-ink-500 flex-1 text-right">{{ formatIDR(m.netRevenue) }}</span>
            <span
              class="font-mono text-xs w-28 text-right shrink-0"
              :class="m.netProfit >= 0 ? 'text-green-600' : 'text-red-600'"
            >
              {{ formatIDR(m.netProfit) }}
            </span>
          </div>
          <div class="h-2 rounded-full bg-ink-100 overflow-hidden">
            <div
              class="h-full bg-teal-500 rounded-full"
              :style="{ width: Math.round((Math.abs(m.netRevenue) / maxMonthly) * 100) + '%' }"
            ></div>
          </div>
        </div>
      </div>
      <div class="panel overflow-x-auto">
        <table class="table-std min-w-[40rem]">
          <thead>
            <tr>
              <th>Bulan</th>
              <th class="text-right">Unit</th>
              <th class="text-right">Revenue bersih</th>
              <th class="text-right">HPP</th>
              <th class="text-right">Operasional</th>
              <th class="text-right">Laba bersih</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="m in monthly" :key="m.month">
              <td class="font-medium whitespace-nowrap">{{ monthLabel(m.month) }}</td>
              <td class="num">{{ formatNumber(m.units) }}</td>
              <td class="num">{{ formatIDR(m.netRevenue) }}</td>
              <td class="num">{{ formatIDR(m.cogs) }}</td>
              <td class="num text-red-600">{{ formatIDR(m.operatingExpenses) }}</td>
              <td class="num" :class="m.netProfit >= 0 ? 'text-green-600' : 'text-red-600'">{{ formatIDR(m.netProfit) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
