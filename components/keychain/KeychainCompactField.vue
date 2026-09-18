<script setup>
defineProps({
  label: { type: String, required: true },
  unit: { type: String, default: 'mm' },
  hint: { type: String, default: '' }
})
</script>

<template>
  <div class="space-y-1">
    <div class="flex items-center justify-between gap-2">
      <div class="flex items-center gap-1 min-w-0">
        <span class="text-xs text-ink-600 truncate">{{ label }}</span>
        <InfoTooltip v-if="hint" :label="`Informasi ${label}`">{{ hint }}</InfoTooltip>
      </div>
      <span v-if="unit" class="text-[10px] font-mono text-ink-400 shrink-0">{{ unit }}</span>
    </div>
    <slot />
  </div>
</template>
