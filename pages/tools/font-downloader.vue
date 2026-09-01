<script setup>
definePageMeta({
  layout: 'tool',
  toolTitle: 'Font Downloader'
})

import {
  MagnifyingGlassIcon,
  ArrowDownTrayIcon,
  TrashIcon,
  ArrowPathIcon,
  DocumentTextIcon,
  ChevronLeftIcon,
  ChevronRightIcon
} from '@heroicons/vue/24/outline'
import { formatFontFilename } from '~/utils/keychainFonts.js'

const isAdmin = computed(() => useState('authUser').value?.role === 'admin')
const toast = useToast()
const confirm = useConfirm()

const googlePreview = useGoogleFontPreview()
const localPreview = useLocalFontPreview()

const { data: installed, refresh: refreshInstalled } = await useFetch('/api/fonts')

const CATALOG_PAGE_SIZE = 10
const previewText = ref('NUMA 3D')

const search = ref('')
const searchDebounced = ref('')
const catalogPage = ref(1)
let searchTimer
watch(search, (v) => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    searchDebounced.value = v.trim()
  }, 280)
})

watch(searchDebounced, () => {
  catalogPage.value = 1
  clearHover()
})

const catalogUrl = computed(() => {
  const params = new URLSearchParams({
    limit: String(CATALOG_PAGE_SIZE),
    offset: String((catalogPage.value - 1) * CATALOG_PAGE_SIZE)
  })
  if (searchDebounced.value) params.set('q', searchDebounced.value)
  return `/api/fonts/catalog?${params}`
})
const { data: catalogData, pending: catalogPending, refresh: refreshCatalog } = await useFetch(catalogUrl, {
  watch: [catalogUrl]
})

const catalogFonts = computed(() => catalogData.value?.fonts || [])
const catalogTotal = computed(() => catalogData.value?.total ?? 0)
const catalogTotalPages = computed(() => Math.max(1, Math.ceil(catalogTotal.value / CATALOG_PAGE_SIZE)))
const catalogCanPrev = computed(() => catalogPage.value > 1)
const catalogCanNext = computed(() => catalogPage.value < catalogTotalPages.value)

function catalogPrevPage() {
  if (!catalogCanPrev.value) return
  catalogPage.value -= 1
  clearHover()
}

function catalogNextPage() {
  if (!catalogCanNext.value) return
  catalogPage.value += 1
  clearHover()
}

watch(
  catalogFonts,
  (fonts) => {
    if (!fonts.length) return
    googlePreview.loadFamilies(fonts.map((f) => f.family))
  },
  { immediate: true }
)

// --- Hover preview ---
const hoverFont = ref(null)
const hoverDetail = ref(null)
const hoverAnchor = ref(null)
const hoverVariant = ref('400')
const hoverLoading = ref(false)
const familyCache = new Map()

let hoverEnterTimer = null
let hoverLeaveTimer = null

function clearHover() {
  hoverFont.value = null
  hoverDetail.value = null
  hoverAnchor.value = null
}

async function loadFamilyDetail(family) {
  const key = family.family
  if (familyCache.has(key)) return familyCache.get(key)
  const detail = await $fetch('/api/fonts/family', { query: { family: key } })
  familyCache.set(key, detail)
  return detail
}

async function showHover(font, el) {
  hoverFont.value = font
  hoverAnchor.value = el.getBoundingClientRect()
  hoverVariant.value = font.variants?.includes('400') ? '400' : font.variants?.[0] || '400'
  hoverLoading.value = true
  try {
    hoverDetail.value = await loadFamilyDetail(font)
    if (!hoverDetail.value.variants.includes(hoverVariant.value)) {
      hoverVariant.value = hoverDetail.value.variants[0] || '400'
    }
    await googlePreview.loadFamily(font.family, hoverVariant.value)
  } catch (e) {
    if (hoverFont.value?.family === font.family) clearHover()
    toast.error(e.data?.statusMessage || e.message || 'Gagal memuat preview')
  } finally {
    hoverLoading.value = false
  }
}

function onRowEnter(font, event) {
  clearTimeout(hoverLeaveTimer)
  clearTimeout(hoverEnterTimer)
  hoverEnterTimer = setTimeout(() => {
    showHover(font, event.currentTarget)
  }, 120)
}

function onRowLeave() {
  clearTimeout(hoverEnterTimer)
  hoverLeaveTimer = setTimeout(clearHover, 180)
}

function onCardEnter() {
  clearTimeout(hoverLeaveTimer)
}

function onCardLeave() {
  hoverLeaveTimer = setTimeout(clearHover, 180)
}

watch(hoverVariant, async (variant) => {
  if (!hoverFont.value?.family) return
  await googlePreview.loadFamily(hoverFont.value.family, variant)
})

watch(catalogPage, clearHover)

const downloading = ref(false)

async function downloadHoverFont() {
  if (!hoverDetail.value || !hoverVariant.value) return
  downloading.value = true
  try {
    const result = await $fetch('/api/fonts/download', {
      method: 'POST',
      body: {
        family: hoverDetail.value.family,
        variant: hoverVariant.value
      }
    })
    await refreshInstalled()
    toast.success(
      result.skipped
        ? `Font sudah ada: ${result.filename}`
        : `Font terunduh: ${result.filename}`
    )
  } catch (e) {
    toast.error(e.data?.statusMessage || e.message || 'Gagal mengunduh font')
  } finally {
    downloading.value = false
  }
}

function formatSize(bytes) {
  if (bytes >= 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB'
  if (bytes >= 1024) return (bytes / 1024).toFixed(0) + ' KB'
  return bytes + ' B'
}

function localFontLabel(filename) {
  return formatFontFilename(filename)
}

function localFontFamilyId(filename) {
  return `LocalFont_${filename.replace(/[^a-zA-Z0-9]/g, '_')}`
}

watch(
  installed,
  (fonts) => {
    if (!fonts?.length) return
    fonts.forEach((f) => localPreview.loadFontUrl(f.url, localFontFamilyId(f.filename)))
  },
  { immediate: true }
)

async function deleteFont(filename) {
  const ok = await confirm.confirm(`Hapus font "${filename}" dari server?`, {
    title: 'Hapus font',
    confirmText: 'Hapus'
  })
  if (!ok) return
  try {
    await $fetch(`/api/fonts/${encodeURIComponent(filename)}`, { method: 'DELETE' })
    await refreshInstalled()
    toast.success('Font dihapus')
  } catch (e) {
    toast.error(e.data?.statusMessage || e.message || 'Gagal menghapus font')
  }
}

onUnmounted(() => {
  clearTimeout(hoverEnterTimer)
  clearTimeout(hoverLeaveTimer)
})
</script>

<template>
  <div class="max-w-5xl mx-auto space-y-4">
    <div>
      <h1 class="text-xl font-bold">Font Downloader</h1>
      <p class="text-sm text-ink-500 mt-1">
        Arahkan kursor ke font untuk preview · unduh ke
        <code class="text-xs bg-ink-100 px-1 rounded">public/fonts/</code>
      </p>
    </div>

    <div class="grid lg:grid-cols-5 gap-4">
      <!-- Katalog Google Fonts -->
      <div class="lg:col-span-2 flex flex-col gap-2 min-h-[28rem]">
        <div class="panel flex flex-col flex-1 min-h-0">
          <div class="panel-header">
            <span class="panel-title">Google Fonts</span>
            <button type="button" class="btn-secondary text-xs py-1.5 px-2" @click="refreshCatalog()">
              <ArrowPathIcon class="w-4 h-4" :class="catalogPending ? 'animate-spin' : ''" />
            </button>
          </div>
          <div class="p-3 border-b border-ink-200">
            <div class="relative">
              <MagnifyingGlassIcon class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
              <input
                v-model="search"
                type="search"
                class="input pl-9"
                placeholder="Saring font…"
                autocomplete="off"
              />
            </div>
            <p class="text-xs text-ink-400 mt-2">
              Hover untuk preview · {{ CATALOG_PAGE_SIZE }} per halaman
              <span v-if="searchDebounced"> · {{ catalogTotal }} hasil</span>
            </p>
            <div class="mt-2">
              <label class="label">Teks preview</label>
              <input v-model="previewText" class="input text-sm" maxlength="40" placeholder="NUMA 3D" />
            </div>
          </div>
          <div class="flex-1 overflow-y-auto divide-y divide-ink-100">
            <p v-if="catalogPending && !catalogFonts.length" class="p-4 text-sm text-ink-500">Memuat katalog…</p>
            <p v-else-if="searchDebounced && !catalogFonts.length" class="p-4 text-sm text-ink-500">
              Tidak ada hasil untuk "{{ searchDebounced }}".
            </p>
            <div
              v-for="font in catalogFonts"
              :key="font.family"
              class="px-4 py-3 cursor-default transition-colors"
              :class="hoverFont?.family === font.family ? 'bg-accent-50/70' : 'hover:bg-ink-50'"
              @mouseenter="onRowEnter(font, $event)"
              @mouseleave="onRowLeave"
            >
              <p class="text-xl leading-tight truncate text-ink-900" :style="googlePreview.styleFor(font.family)">
                {{ font.family }}
              </p>
              <p class="text-[11px] text-ink-400 mt-1 font-sans truncate">NUMA 3D · Aa Bb 123</p>
              <p class="text-xs text-ink-500 mt-0.5 font-sans">{{ font.category }} · {{ font.variants.length }} varian</p>
            </div>
          </div>
        </div>

        <div class="panel px-3 py-2.5 flex items-center justify-between gap-2">
          <button
            type="button"
            class="btn-secondary text-sm flex-1"
            :disabled="!catalogCanPrev || catalogPending"
            @click="catalogPrevPage"
          >
            <ChevronLeftIcon class="w-4 h-4" />
            Kembali
          </button>
          <span class="text-xs text-ink-500 shrink-0 tabular-nums px-1">
            {{ catalogPage }} / {{ catalogTotalPages }}
          </span>
          <button
            type="button"
            class="btn-secondary text-sm flex-1"
            :disabled="!catalogCanNext || catalogPending"
            @click="catalogNextPage"
          >
            Berikutnya
            <ChevronRightIcon class="w-4 h-4" />
          </button>
        </div>
      </div>

      <!-- Font terpasang -->
      <div class="lg:col-span-3">
        <div class="panel min-h-[28rem] flex flex-col">
          <div class="panel-header">
            <span class="panel-title">Font lokal</span>
            <button type="button" class="btn-secondary text-xs py-1.5 px-2" @click="refreshInstalled()">
              <ArrowPathIcon class="w-4 h-4" />
            </button>
          </div>
          <div v-if="!installed?.length" class="flex-1 flex items-center justify-center p-8 text-sm text-ink-500 text-center">
            <div>
              <p>Belum ada font di <code class="text-xs bg-ink-100 px-1 rounded">public/fonts/</code>.</p>
              <p class="text-xs text-ink-400 mt-2">Hover font di katalog lalu unduh ke server.</p>
            </div>
          </div>
          <ul v-else class="divide-y divide-ink-100 overflow-y-auto flex-1">
            <li v-for="font in installed" :key="font.filename" class="px-4 py-3 space-y-2">
              <div class="flex items-center gap-3">
                <DocumentTextIcon class="w-5 h-5 text-ink-400 shrink-0" />
                <div class="min-w-0 flex-1">
                  <div class="font-mono text-sm truncate">{{ font.filename }}</div>
                  <div class="text-xs text-ink-500">{{ formatSize(font.size) }}</div>
                </div>
                <a :href="font.url" class="btn-secondary text-xs py-1.5 px-2 shrink-0" download>
                  <ArrowDownTrayIcon class="w-4 h-4" />
                </a>
                <button
                  v-if="isAdmin"
                  type="button"
                  class="btn-danger text-xs py-1.5 px-2 shrink-0"
                  title="Hapus"
                  @click="deleteFont(font.filename)"
                >
                  <TrashIcon class="w-4 h-4" />
                </button>
              </div>
              <div class="rounded-lg border border-ink-100 bg-ink-50 px-3 py-2">
                <p class="text-xl truncate" :style="localPreview.styleFor(localFontFamilyId(font.filename))">
                  {{ localFontLabel(font.filename) }}
                </p>
                <p
                  class="text-sm text-ink-500 truncate mt-0.5"
                  :style="localPreview.styleFor(localFontFamilyId(font.filename))"
                >
                  {{ previewText || 'NUMA 3D' }} · Aa Bb Cc 0123
                </p>
              </div>
            </li>
          </ul>
        </div>
      </div>
    </div>

    <FontsFontCatalogHoverCard
      :font="hoverFont"
      :detail="hoverDetail"
      :loading="hoverLoading"
      :anchor="hoverAnchor"
      :preview-text="previewText || 'NUMA 3D'"
      :selected-variant="hoverVariant"
      :is-admin="isAdmin"
      :downloading="downloading"
      @update:selected-variant="hoverVariant = $event"
      @download="downloadHoverFont"
      @mouseenter="onCardEnter"
      @mouseleave="onCardLeave"
    />
  </div>
</template>
