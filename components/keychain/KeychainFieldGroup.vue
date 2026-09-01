<script setup>
defineProps({
  title: { type: String, required: true },
  description: { type: String, default: '' },
  icon: { type: [Object, Function], default: null },
  linked: { type: Boolean, default: false }
})
</script>

<template>
  <section
    class="rounded-panel border overflow-hidden"
    :class="linked ? 'border-accent-200/70 bg-accent-50/20' : 'border-ink-200/80 bg-white'"
  >
    <header
      class="flex items-start gap-2.5 px-3 py-2.5 border-b"
      :class="linked ? 'bg-accent-50/60 border-accent-100' : 'bg-ink-50/80 border-ink-100'"
    >
      <component :is="icon" v-if="icon" class="w-4 h-4 text-accent-600 mt-0.5 shrink-0" aria-hidden="true" />
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2 flex-wrap">
          <h3 class="text-xs font-semibold text-ink-800">{{ title }}</h3>
          <span
            v-if="linked"
            class="text-[10px] font-medium uppercase tracking-wide text-accent-700 bg-accent-100/80 px-1.5 py-0.5 rounded"
          >
            Terhubung
          </span>
        </div>
        <p v-if="description" class="text-[11px] text-ink-500 mt-0.5 leading-relaxed">{{ description }}</p>
      </div>
    </header>
    <div class="p-3 space-y-3">
      <slot />
    </div>
  </section>
</template>
