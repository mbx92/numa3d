<script setup>
import { ArrowLeftIcon, PrinterIcon, ArrowDownTrayIcon, ShareIcon } from '@heroicons/vue/24/outline'

definePageMeta({ layout: 'print' })

const route = useRoute()
const { data: invoice, error } = await useFetch(`/api/sales/${route.params.id}`)

useHead({
  title: computed(() => (invoice.value ? `Invoice ${invoice.value.invoiceNumber}` : 'Invoice'))
})

const pdfBusy = ref(false)
const shareBusy = ref(false)
const shareInfo = ref(null)

function printInvoice() {
  if (import.meta.client) window.print()
}

async function downloadPdf(url, filename) {
  pdfBusy.value = true
  try {
    const blob = await $fetch(url, { responseType: 'blob' })
    const href = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = href
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(href)
  } catch (e) {
    useToast().error(e.data?.statusMessage || 'Gagal mengunduh PDF')
  } finally {
    pdfBusy.value = false
  }
}

async function shareInvoice() {
  shareBusy.value = true
  try {
    const res = await $fetch(`/api/sales/${route.params.id}/share`, { method: 'POST' })
    const url = `${window.location.origin}${res.path}`
    shareInfo.value = { url, expiresAt: res.expiresAt, reused: res.reused }
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Invoice ${invoice.value?.invoiceNumber || ''}`,
          text: `Invoice ${invoice.value?.invoiceNumber || ''}`,
          url
        })
        return
      } catch (e) {
        if (e?.name === 'AbortError') return
      }
    }
    await navigator.clipboard.writeText(url)
    useToast().success('Tautan invoice disalin.')
  } catch (e) {
    useToast().error(e.data?.statusMessage || 'Gagal membuat tautan')
  } finally {
    shareBusy.value = false
  }
}

function formatShareExpiry(value) {
  const dt = new Date(value)
  if (Number.isNaN(dt.getTime())) return formatDate(value)
  return dt.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })
}

async function copyShareUrl() {
  if (!shareInfo.value?.url) return
  await navigator.clipboard.writeText(shareInfo.value.url)
  useToast().success('Tautan disalin.')
}
</script>

<template>
  <div class="min-h-screen bg-ink-100 print:bg-white">
    <div class="no-print sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 px-4 py-3 bg-ink-900 text-ink-100 print:hidden">
      <NuxtLink to="/sales" class="inline-flex items-center gap-1 text-sm hover:text-white">
        <ArrowLeftIcon class="w-4 h-4" /> Penjualan
      </NuxtLink>
      <div class="flex flex-wrap items-center gap-2">
        <button class="btn-secondary !text-ink-800" type="button" @click="printInvoice">
          <PrinterIcon class="w-4 h-4" />Cetak
        </button>
        <button
          class="btn-secondary !text-ink-800"
          type="button"
          :disabled="pdfBusy || !invoice"
          @click="downloadPdf(`/api/sales/${route.params.id}/pdf`, `${invoice?.invoiceNumber || 'invoice'}.pdf`)"
        >
          <ArrowDownTrayIcon class="w-4 h-4" />{{ pdfBusy ? 'Mengunduh…' : 'PDF' }}
        </button>
        <button class="btn-primary" type="button" :disabled="shareBusy || !invoice" @click="shareInvoice">
          <ShareIcon class="w-4 h-4" />{{ shareBusy ? 'Membuat…' : 'Bagikan' }}
        </button>
      </div>
    </div>

    <p v-if="error" class="p-6 text-sm text-red-600">{{ error.data?.statusMessage || 'Invoice tidak ditemukan' }}</p>

    <div v-if="shareInfo" class="no-print mx-auto mt-4 w-[210mm] max-w-full px-4 print:hidden">
      <div class="rounded-panel border border-ink-200 bg-white p-3 text-sm space-y-2">
        <div class="text-xs font-semibold uppercase tracking-wide text-ink-500">Tautan publik</div>
        <div class="flex gap-2">
          <input :value="shareInfo.url" readonly class="input font-mono text-xs" @focus="$event.target.select()" />
          <button type="button" class="btn-secondary shrink-0" @click="copyShareUrl">Salin</button>
        </div>
        <p class="text-xs text-ink-500">Berlaku sampai {{ formatShareExpiry(shareInfo.expiresAt) }}.</p>
      </div>
    </div>

    <InvoiceSheet v-if="invoice" :invoice="invoice" />
  </div>
</template>
