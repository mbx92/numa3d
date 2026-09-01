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
      <span class="text-xs text-ink-600 truncate">{{ label }}</span>
      <span v-if="unit" class="text-[10px] font-mono text-ink-400 shrink-0">{{ unit }}</span>
    </div>
    <slot />
    <p v-if="hint" class="text-[10px] text-ink-400 leading-snug">{{ hint }}</p>
  </div>
</template>
