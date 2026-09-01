<script setup>
import { getKeychainTypography, KEYCHAIN_TYPOGRAPHY_LIST, typographyPreviewStyle } from '~/utils/keychainTypography.js'

const modelValue = defineModel({ type: String, default: 'straight' })

const options = KEYCHAIN_TYPOGRAPHY_LIST

function previewStyle(id) {
  return typographyPreviewStyle(id)
}

function select(id) {
  modelValue.value = id
}
</script>

<template>
  <div class="space-y-2">
    <span class="text-xs font-medium text-ink-700">Model typography</span>
    <div class="grid grid-cols-3 gap-2">
      <button
        v-for="opt in options"
        :key="opt.id"
        type="button"
        class="rounded-lg border px-2 py-2.5 text-left transition-colors"
        :class="
          modelValue === opt.id
            ? 'border-accent-400 bg-accent-50 ring-1 ring-accent-300'
            : 'border-ink-200 bg-white hover:border-ink-300 hover:bg-ink-50'
        "
        :title="opt.description"
        @click="select(opt.id)"
      >
        <div
          class="text-sm font-bold leading-none truncate mb-1.5"
          :style="previewStyle(opt.id)"
        >
          ABC
        </div>
        <div class="text-[10px] font-medium text-ink-800 leading-tight">{{ opt.name }}</div>
      </button>
    </div>
    <p class="text-[11px] text-ink-400">{{ getKeychainTypography(modelValue).description }}</p>
  </div>
</template>
