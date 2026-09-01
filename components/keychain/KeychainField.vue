<script setup>
defineProps({
  label: { type: String, required: true },
  hint: { type: String, default: '' },
  warning: { type: String, default: '' },
  unit: { type: String, default: '' },
  icon: { type: [Object, Function], default: null },
  compact: { type: Boolean, default: false }
})
</script>

<template>
  <label class="block" :class="compact ? 'space-y-1' : 'space-y-1.5'">
    <div class="flex items-center gap-2 min-h-7">
      <span
        v-if="icon"
        class="inline-flex items-center justify-center w-7 h-7 rounded-md bg-ink-100 text-ink-500 shrink-0"
        aria-hidden="true"
      >
        <component :is="icon" class="w-4 h-4" />
      </span>
      <span class="text-xs font-medium text-ink-700 flex-1 leading-tight">{{ label }}</span>
      <span
        v-if="unit"
        class="text-[10px] font-mono font-semibold uppercase tracking-wide text-ink-400 bg-ink-50 border border-ink-100 px-1.5 py-0.5 rounded shrink-0"
      >
        {{ unit }}
      </span>
    </div>
    <div :class="icon ? 'pl-9' : ''">
      <slot />
      <p v-if="hint" class="text-[11px] text-ink-500 leading-snug mt-1">{{ hint }}</p>
      <p v-if="warning" class="text-[11px] text-amber-700 leading-snug mt-1">{{ warning }}</p>
    </div>
  </label>
</template>
