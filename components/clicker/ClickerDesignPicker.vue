<script setup>
import { SHAPE_MODES, DISPLAY_MODES } from '~/utils/clickerPresets.js'

const shapeMode = defineModel('shapeMode', { type: String, default: 'rect' })
const text = defineModel('text', { type: String, default: '' })
const fontUrl = defineModel('fontUrl', { type: String, default: '' })
const svgContent = defineModel('svgContent', { type: String, default: '' })
const maxSizeMm = defineModel('maxSizeMm', { type: Number, default: 40 })
const displayMode = defineModel('displayMode', { type: String, default: 'preview' })
const keyringEnabled = defineModel('keyringEnabled', { type: Boolean, default: false })

const modes = SHAPE_MODES
const displayModes = DISPLAY_MODES
</script>

<template>
  <div class="space-y-3">
    <div>
      <span class="text-xs font-medium text-ink-700">Bentuk lid</span>
      <div class="grid grid-cols-3 gap-1.5 mt-1.5">
        <button
          v-for="m in modes"
          :key="m.id"
          type="button"
          class="rounded-lg border px-2 py-2 text-left transition-colors"
          :class="
            shapeMode === m.id
              ? 'border-accent-400 bg-accent-50 ring-1 ring-accent-200'
              : 'border-ink-200 hover:border-ink-300'
          "
          @click="shapeMode = m.id"
        >
          <span class="block text-xs font-medium text-ink-800">{{ m.label }}</span>
          <span class="block text-[10px] text-ink-400 leading-snug mt-0.5">{{ m.description }}</span>
        </button>
      </div>
    </div>

    <template v-if="shapeMode === 'text'">
      <label class="block space-y-1">
        <span class="text-xs font-medium text-ink-700">Teks lid</span>
        <input v-model="text" class="input text-sm font-semibold" maxlength="16" placeholder="CLICK" />
      </label>
      <KeychainFontPicker v-model="fontUrl" :preview-text="text || 'CLICK'" :show-downloader-link="false" />
    </template>

    <KeychainSvgUpload
      v-if="shapeMode === 'svg'"
      v-model:svg-content="svgContent"
      :svg-size-mm="maxSizeMm"
      :svg-gap-mm="0"
      @update:svg-size-mm="maxSizeMm = $event"
    />

    <label v-if="shapeMode !== 'rect'" class="block space-y-1">
      <span class="text-xs font-medium text-ink-700">Ukuran maks. (mm)</span>
      <div class="flex items-center gap-2">
        <input v-model.number="maxSizeMm" type="range" min="20" max="80" step="1" class="flex-1" />
        <span class="text-xs font-mono w-10 text-right">{{ maxSizeMm }}</span>
      </div>
      <p class="text-[10px] text-ink-400">Seperti MakerWorld — skala otomatis 20–80 mm.</p>
    </label>

    <label class="block space-y-1">
      <span class="text-xs font-medium text-ink-700">Mode tampilan</span>
      <select v-model="displayMode" class="input text-sm">
        <option v-for="d in displayModes" :key="d.id" :value="d.id">{{ d.label }} — {{ d.description }}</option>
      </select>
    </label>

    <label class="flex items-center gap-2 cursor-pointer">
      <input v-model="keyringEnabled" type="checkbox" class="rounded border-ink-300" />
      <span class="text-xs text-ink-700">Tambah loop keyring di base</span>
    </label>
  </div>
</template>
