<script setup>
import { ArrowLeftIcon, PrinterIcon } from '@heroicons/vue/24/outline'

definePageMeta({ layout: 'print' })

const route = useRoute()
const { data: invoice, error } = await useFetch(`/api/sales/${route.params.id}`)

useHead({
  title: computed(() => (invoice.value ? `Invoice ${invoice.value.invoiceNumber}` : 'Invoice'))
})

function printInvoice() {
  if (import.meta.client) window.print()
}
</script>

<template>
  <div class="min-h-screen bg-ink-100 print:bg-white">
    <div class="no-print sticky top-0 z-10 flex items-center justify-between gap-2 px-4 py-3 bg-ink-900 text-ink-100 print:hidden">
      <NuxtLink to="/sales" class="inline-flex items-center gap-1 text-sm hover:text-white">
        <ArrowLeftIcon class="w-4 h-4" /> Penjualan
      </NuxtLink>
      <button class="btn-primary" @click="printInvoice">
        <PrinterIcon class="w-4 h-4" />Cetak / PDF
      </button>
    </div>

    <p v-if="error" class="p-6 text-sm text-red-600">{{ error.data?.statusMessage || 'Invoice tidak ditemukan' }}</p>

    <article v-else-if="invoice" class="invoice-sheet mx-auto my-6 w-[210mm] max-w-full bg-white p-8 shadow-sm print:my-0 print:shadow-none print:w-full">
      <header class="flex items-start justify-between gap-4 border-b border-ink-200 pb-4">
        <div class="flex items-start gap-3">
          <img src="/logo-mark.svg" alt="" class="w-10 h-10" />
          <div>
            <h1 class="text-lg font-bold tracking-wide">{{ invoice.business.name }}</h1>
            <p v-if="invoice.business.address" class="text-sm text-ink-600 whitespace-pre-line">{{ invoice.business.address }}</p>
            <p v-if="invoice.business.phone" class="text-sm text-ink-600">{{ invoice.business.phone }}</p>
          </div>
        </div>
        <div class="text-right">
          <div class="text-xs font-semibold uppercase tracking-wide text-ink-500">Invoice</div>
          <div class="font-mono text-lg font-semibold">{{ invoice.invoiceNumber }}</div>
          <div class="text-sm text-ink-600 mt-1">{{ formatDate(invoice.date) }}</div>
        </div>
      </header>

      <section class="grid grid-cols-2 gap-4 py-4 text-sm">
        <div>
          <div class="text-xs font-semibold uppercase tracking-wide text-ink-500">Kepada</div>
          <div class="font-medium mt-1">{{ invoice.customerName }}</div>
        </div>
        <div class="text-right">
          <div class="text-xs font-semibold uppercase tracking-wide text-ink-500">Channel</div>
          <div class="mt-1">{{ invoice.channelLabel }}</div>
        </div>
      </section>

      <table class="w-full text-sm border-t border-ink-200">
        <thead>
          <tr class="text-left text-xs uppercase tracking-wide text-ink-500">
            <th class="py-2 pr-2">Item</th>
            <th class="py-2 px-2 text-right">Qty</th>
            <th class="py-2 px-2 text-right">Harga</th>
            <th class="py-2 pl-2 text-right">Jumlah</th>
          </tr>
        </thead>
        <tbody>
          <tr class="border-t border-ink-100">
            <td class="py-3 pr-2">
              {{ invoice.item.name }}
              <span v-if="invoice.isCustom" class="text-xs text-ink-400"> · custom</span>
            </td>
            <td class="py-3 px-2 text-right font-mono">{{ invoice.item.quantity }}</td>
            <td class="py-3 px-2 text-right font-mono">{{ formatIDR(invoice.item.unitPrice) }}</td>
            <td class="py-3 pl-2 text-right font-mono">{{ formatIDR(invoice.item.amount) }}</td>
          </tr>
        </tbody>
      </table>

      <div class="flex justify-end pt-4">
        <dl class="w-56 text-sm space-y-1">
          <div class="flex justify-between gap-4">
            <dt class="text-ink-500">Subtotal</dt>
            <dd class="font-mono">{{ formatIDR(invoice.subtotal) }}</dd>
          </div>
          <div class="flex justify-between gap-4 border-t border-ink-200 pt-2 font-semibold">
            <dt>Total</dt>
            <dd class="font-mono text-base">{{ formatIDR(invoice.total) }}</dd>
          </div>
        </dl>
      </div>

      <p v-if="invoice.notes" class="mt-6 text-xs text-ink-500">Catatan: {{ invoice.notes }}</p>
      <p class="mt-8 text-sm text-ink-600">{{ invoice.business.footer }}</p>
    </article>
  </div>
</template>

<style scoped>
@media print {
  .invoice-sheet {
    margin: 0;
    box-shadow: none;
    width: auto;
    max-width: none;
  }
}
</style>
