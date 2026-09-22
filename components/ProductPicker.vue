<script setup>
import { ChevronDownIcon, CubeTransparentIcon, MagnifyingGlassIcon, XMarkIcon } from '@heroicons/vue/24/outline'
import { productKindBadge, productKindLabel } from '#shared/utils/productKind.js'

const props = defineProps({
  products: { type: Array, default: () => [] },
  placeholder: { type: String, default: 'Pilih produk' },
  clearable: { type: Boolean, default: false },
  clearLabel: { type: String, default: 'Tanpa produk' },
  disabled: { type: Boolean, default: false },
  showCategory: { type: Boolean, default: true }
})

const model = defineModel({ type: [Number, String], default: '' })
const open = ref(false)
const search = ref('')
const searchInput = ref(null)

const selected = computed(() => props.products.find((product) => Number(product.id) === Number(model.value)) || null)
const filtered = computed(() => {
  const query = search.value.trim().toLowerCase()
  if (!query) return props.products
  return props.products.filter((product) => [
    product.name,
    product.description,
    productKindLabel[product.kind || 'normal'],
    product.previewFilename
  ].some((value) => String(value || '').toLowerCase().includes(query)))
})

function productMeta(product) {
  if (product.availableStock != null) return `Stok bebas ${formatNumber(product.availableStock)}`
  if (product.stockQuantity != null) return `Stok ${formatNumber(product.stockQuantity)}`
  return product.previewFilename || ''
}

async function showPicker() {
  if (props.disabled || !props.products.length) return
  search.value = ''
  open.value = true
  await nextTick()
  searchInput.value?.focus()
}

function choose(product) {
  model.value = product?.id ?? ''
  open.value = false
}
</script>

<template>
  <div>
    <button
      type="button"
      class="flex min-h-14 w-full items-center gap-2.5 rounded-lg border border-ink-200 bg-white p-1.5 text-left transition-colors hover:border-ink-300 hover:bg-ink-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40 disabled:cursor-not-allowed disabled:opacity-60"
      :disabled="disabled || !products.length"
      aria-haspopup="dialog"
      :aria-expanded="open"
      @click="showPicker"
    >
      <span class="h-11 w-14 shrink-0 overflow-hidden rounded-md border border-ink-200 bg-ink-50">
        <ProductModelThumbnail
          v-if="selected?.previewFileId"
          :key="selected.previewFileId"
          :src="`/api/files/${selected.previewFileId}`"
          :filename="selected.previewFilename"
          :fallback-src="selected.imageKey ? `/api/products/${selected.id}/image` : ''"
        />
        <img v-else-if="selected?.imageKey" :src="`/api/products/${selected.id}/image`" alt="" class="h-full w-full object-cover" />
        <span v-else class="flex h-full items-center justify-center text-ink-300"><CubeTransparentIcon class="h-6 w-6" /></span>
      </span>
      <span class="min-w-0 flex-1">
        <span class="block truncate text-sm font-semibold" :class="selected ? 'text-ink-900' : 'text-ink-500'">
          {{ selected?.name || (model ? placeholder : (clearable ? clearLabel : placeholder)) }}
        </span>
        <span v-if="selected" class="mt-0.5 flex min-w-0 items-center gap-1.5">
          <span v-if="showCategory" class="badge shrink-0 text-[9px]" :class="productKindBadge[selected.kind || 'normal']">{{ productKindLabel[selected.kind || 'normal'] }}</span>
          <span v-if="productMeta(selected)" class="truncate text-[10px] text-ink-400">{{ productMeta(selected) }}</span>
        </span>
        <span v-else class="block text-[10px] text-ink-400">Klik untuk membuka katalog produk</span>
      </span>
      <ChevronDownIcon class="h-4 w-4 shrink-0 text-ink-400" />
    </button>

    <Teleport to="body">
      <div
        v-if="open"
        class="fixed inset-0 z-[150] flex items-end justify-center bg-ink-950/35 backdrop-blur-[1px] sm:items-center sm:p-4"
        @click.self="open = false"
        @keydown.esc="open = false"
      >
        <div role="dialog" aria-modal="true" aria-label="Pilih produk" class="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-t-2xl border border-ink-200 bg-white shadow-2xl sm:rounded-2xl">
          <div class="flex items-center gap-3 border-b border-ink-100 p-4">
            <div class="min-w-0 flex-1">
              <p class="font-semibold text-ink-900">Pilih produk</p>
              <p class="text-xs text-ink-500">Pilih dari katalog berdasarkan gambar atau model 3D.</p>
            </div>
            <button type="button" class="rounded-md p-1 text-ink-400 hover:bg-ink-100 hover:text-ink-700" aria-label="Tutup" @click="open = false">
              <XMarkIcon class="h-5 w-5" />
            </button>
          </div>

          <div class="border-b border-ink-100 p-3 sm:p-4">
            <label class="relative block">
              <MagnifyingGlassIcon class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
              <input ref="searchInput" v-model="search" type="search" class="input pl-9" placeholder="Cari nama, kategori, atau deskripsi produk…" />
            </label>
          </div>

          <div class="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
            <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              <button
                v-if="clearable"
                type="button"
                class="group overflow-hidden rounded-xl border bg-white text-left transition-all hover:-translate-y-0.5 hover:border-accent-400 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/50"
                :class="!model ? 'border-accent-500 ring-2 ring-accent-500/20' : 'border-ink-200'"
                @click="choose(null)"
              >
                <div class="flex aspect-[4/3] items-center justify-center border-b border-ink-100 bg-ink-50 text-ink-300">
                  <XMarkIcon class="h-9 w-9" />
                </div>
                <div class="p-2.5 sm:p-3"><p class="text-sm font-semibold text-ink-700">{{ clearLabel }}</p></div>
              </button>

              <button
                v-for="product in filtered"
                :key="product.id"
                type="button"
                class="group overflow-hidden rounded-xl border bg-white text-left transition-all hover:-translate-y-0.5 hover:border-accent-400 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/50"
                :class="Number(model) === Number(product.id) ? 'border-accent-500 ring-2 ring-accent-500/20' : 'border-ink-200'"
                @click="choose(product)"
              >
                <div class="aspect-[4/3] overflow-hidden border-b border-ink-100 bg-ink-50">
                  <ProductModelThumbnail
                    v-if="product.previewFileId"
                    :src="`/api/files/${product.previewFileId}`"
                    :filename="product.previewFilename"
                    :fallback-src="product.imageKey ? `/api/products/${product.id}/image` : ''"
                  />
                  <img v-else-if="product.imageKey" :src="`/api/products/${product.id}/image`" alt="" loading="lazy" class="h-full w-full object-cover transition-transform group-hover:scale-[1.03]" />
                  <div v-else class="flex h-full items-center justify-center text-ink-300"><CubeTransparentIcon class="h-10 w-10" /></div>
                </div>
                <div class="space-y-1.5 p-2.5 sm:p-3">
                  <p class="line-clamp-2 text-sm font-semibold leading-snug text-ink-900">{{ product.name }}</p>
                  <div class="flex min-w-0 items-center gap-1.5">
                    <span v-if="showCategory" class="badge shrink-0 text-[9px]" :class="productKindBadge[product.kind || 'normal']">{{ productKindLabel[product.kind || 'normal'] }}</span>
                    <span v-if="productMeta(product)" class="truncate text-[10px] text-ink-400">{{ productMeta(product) }}</span>
                  </div>
                </div>
              </button>
            </div>
            <p v-if="!filtered.length" class="py-10 text-center text-sm text-ink-500">Produk tidak ditemukan.</p>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
