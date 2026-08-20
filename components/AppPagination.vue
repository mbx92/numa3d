<script setup>
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/vue/24/outline'

const props = defineProps({
  page: { type: Number, required: true },
  pageSize: { type: Number, required: true },
  totalPages: { type: Number, required: true },
  total: { type: Number, required: true },
  rangeStart: { type: Number, required: true },
  rangeEnd: { type: Number, required: true },
  pageSizeOptions: { type: Array, default: () => [10, 25, 50, 100] }
})
const emit = defineEmits(['update:page', 'update:pageSize'])

// Tampilkan maksimal 5 nomor halaman di sekitar halaman aktif; sisanya
// dijangkau lewat tombol panah agar tidak meluber di layar sempit.
const pageNumbers = computed(() => {
  const span = 5
  let start = Math.max(props.page - Math.floor(span / 2), 1)
  const end = Math.min(start + span - 1, props.totalPages)
  start = Math.max(Math.min(start, end - span + 1), 1)
  const out = []
  for (let i = start; i <= end; i++) out.push(i)
  return out
})

function go(p) {
  if (p >= 1 && p <= props.totalPages && p !== props.page) emit('update:page', p)
}
</script>

<template>
  <div
    v-if="total > 0"
    class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-3 py-2.5 border-t border-ink-200 text-sm"
  >
    <div class="flex items-center gap-2 text-ink-500 order-2 sm:order-1">
      <span class="whitespace-nowrap">{{ rangeStart }}–{{ rangeEnd }} dari {{ total }}</span>
      <select
        :value="pageSize"
        class="input !px-2 !w-auto text-xs"
        @change="emit('update:pageSize', Number($event.target.value))"
      >
        <option v-for="n in pageSizeOptions" :key="n" :value="n">{{ n }} / hal</option>
      </select>
    </div>

    <div v-if="totalPages > 1" class="flex items-center gap-1 order-1 sm:order-2">
      <button
        class="btn-secondary"
        :disabled="page === 1"
        aria-label="Halaman sebelumnya"
        @click="go(page - 1)"
      >
        <ChevronLeftIcon class="w-4 h-4" />
      </button>
      <button
        v-for="n in pageNumbers"
        :key="n"
        class="h-10 min-w-10 px-3 rounded-panel text-sm font-medium transition-colors"
        :class="n === page ? 'bg-accent-500 text-white' : 'text-ink-600 hover:bg-ink-100'"
        @click="go(n)"
      >
        {{ n }}
      </button>
      <button
        class="btn-secondary"
        :disabled="page === totalPages"
        aria-label="Halaman berikutnya"
        @click="go(page + 1)"
      >
        <ChevronRightIcon class="w-4 h-4" />
      </button>
    </div>
  </div>
</template>
