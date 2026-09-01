<script setup>
import { pruneAccentIndices, toggleAccentIndex, isAccentIndex } from '~/utils/keychainAccent.js'

const props = defineProps({
  text: { type: String, default: '' },
  letterColor: { type: String, default: '#f0f0f0' },
  accentColor: { type: String, default: '#f5a623' },
  hint: { type: String, default: 'Klik huruf untuk tandai / hapus aksen warna.' }
})

const accentIndices = defineModel('accentIndices', { type: Array, default: () => [] })

const tokens = computed(() => [...props.text].map((ch, index) => ({ ch, index })))

watch(
  () => props.text,
  (value) => {
    const pruned = pruneAccentIndices(value, accentIndices.value)
    if (pruned.length !== accentIndices.value.length || pruned.some((v, i) => v !== accentIndices.value[i])) {
      accentIndices.value = pruned
    }
  }
)

function onToggle(index, ch) {
  if (ch === ' ') return
  accentIndices.value = toggleAccentIndex(accentIndices.value, index, props.text)
}
</script>

<template>
  <div v-if="text" class="rounded-lg border border-ink-100 bg-ink-50/80 p-2.5 space-y-2">
    <p class="text-[10px] font-medium text-ink-500 uppercase tracking-wide">Pilih huruf aksen</p>
    <div class="flex flex-wrap gap-1 font-bold text-lg tracking-wide leading-none">
      <button
        v-for="token in tokens"
        :key="token.index"
        type="button"
        class="inline-flex items-center justify-center min-w-[1.25rem] px-1 py-1 rounded transition-transform hover:scale-105 disabled:opacity-40 disabled:cursor-default disabled:hover:scale-100"
        :class="
          isAccentIndex(accentIndices, token.index)
            ? 'ring-2 ring-offset-1 shadow-sm text-[1.35rem] -translate-y-0.5'
            : token.ch === ' '
              ? 'cursor-default text-lg'
              : 'ring-1 ring-ink-200/80 text-lg'
        "
        :style="
          isAccentIndex(accentIndices, token.index)
            ? { color: accentColor, '--tw-ring-color': accentColor }
            : token.ch !== ' '
              ? { color: letterColor }
              : { color: '#cbd5e1' }
        "
        :disabled="token.ch === ' '"
        :title="
          token.ch === ' '
            ? 'Spasi'
            : isAccentIndex(accentIndices, token.index)
              ? `Hapus aksen: ${token.ch}`
              : `Jadikan aksen: ${token.ch}`
        "
        @click="onToggle(token.index, token.ch)"
      >
        {{ token.ch === ' ' ? '·' : token.ch }}
      </button>
    </div>
    <p class="text-[11px] text-ink-500">
      {{ hint }}
      <span v-if="accentIndices.length" class="text-ink-400">
        Huruf aksen otomatis lebih besar di model 3D.
      </span>
    </p>
  </div>
</template>
