<script setup>
import { ArrowDownTrayIcon } from '@heroicons/vue/24/outline'
import { fontOptionLabel } from '~/utils/keychainFonts.js'

const props = defineProps({
  modelValue: { type: String, default: '' },
  previewText: { type: String, default: 'NUMA 3D' },
  showPreview: { type: Boolean, default: true },
  showDownloaderLink: { type: Boolean, default: true }
})

const emit = defineEmits(['update:modelValue'])

const { data: installed, pending } = await useFetch('/api/fonts')

const options = computed(() => {
  const rows = (installed.value || []).map((f) => ({
    url: f.url,
    filename: f.filename,
    label: fontOptionLabel(f)
  }))
  if (props.modelValue && !rows.some((f) => f.url === props.modelValue)) {
    const filename = decodeURIComponent(props.modelValue.split('/').pop() || '')
    rows.unshift({
      url: props.modelValue,
      filename,
      label: fontOptionLabel({ filename })
    })
  }
  return rows
})

const selectedUrl = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v)
})

const previewStyleId = 'numa3d-keychain-font-preview'

watch(
  () => selectedUrl.value,
  (url) => {
    if (!import.meta.client || !url) return
    let style = document.getElementById(previewStyleId)
    if (!style) {
      style = document.createElement('style')
      style.id = previewStyleId
      document.head.appendChild(style)
    }
    const family = 'NumaKeychainPreview'
    style.textContent = `
      @font-face {
        font-family: '${family}';
        src: url('${url}');
        font-display: swap;
      }
    `
  },
  { immediate: true }
)

onUnmounted(() => {
  if (import.meta.client) document.getElementById(previewStyleId)?.remove()
})
</script>

<template>
  <div class="space-y-2">
    <label class="block space-y-1.5">
      <span class="text-xs font-medium text-ink-700">Font</span>
      <select v-model="selectedUrl" class="input text-sm" :disabled="pending || !options.length">
        <option v-if="!options.length" value="" disabled>Belum ada font lokal</option>
        <option v-for="font in options" :key="font.url" :value="font.url">
          {{ font.label }}
        </option>
      </select>
    </label>

    <div
      v-if="showPreview && selectedUrl"
      class="rounded-lg border border-ink-200 bg-ink-50 px-4 py-3 min-h-[4.5rem] flex items-center justify-center"
    >
      <p
        class="text-2xl text-center break-words max-w-full tracking-wide"
        style="font-family: 'NumaKeychainPreview', sans-serif"
      >
        {{ previewText || 'NUMA 3D' }}
      </p>
    </div>

    <p v-if="!options.length && !pending" class="text-[11px] text-ink-400">
      Unduh font dulu lewat
      <NuxtLink v-if="showDownloaderLink" to="/tools/font-downloader" class="text-accent-600 hover:underline">
        Font Downloader
      </NuxtLink>
      <template v-else>Font Downloader</template>.
    </p>
    <p v-else-if="showDownloaderLink" class="text-[11px] text-ink-400">
      Butuh font lain?
      <NuxtLink to="/tools/font-downloader" class="inline-flex items-center gap-0.5 text-accent-600 hover:underline">
        <ArrowDownTrayIcon class="w-3.5 h-3.5" />
        Font Downloader
      </NuxtLink>
    </p>
  </div>
</template>
