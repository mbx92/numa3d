import { computed, ref, watch } from 'vue'

// Paginasi sisi-klien untuk daftar yang sudah dimuat penuh. Volume data
// aplikasi ini kecil (skala satu workshop), jadi tidak perlu paginasi server.
// `source` boleh ref/computed; halaman otomatis balik ke 1 saat data berubah
// (mis. setelah filter/pencarian) agar tidak terjebak di halaman kosong.
export function usePagination(source, perPage = 10) {
  const page = ref(1)
  const pageSize = ref(perPage)

  const items = computed(() => source.value || [])
  const total = computed(() => items.value.length)
  const totalPages = computed(() => Math.max(Math.ceil(total.value / pageSize.value), 1))

  watch([total, pageSize], () => {
    if (page.value > totalPages.value) page.value = totalPages.value
  })

  const paged = computed(() => {
    const start = (page.value - 1) * pageSize.value
    return items.value.slice(start, start + pageSize.value)
  })

  const rangeStart = computed(() => (total.value ? (page.value - 1) * pageSize.value + 1 : 0))
  const rangeEnd = computed(() => Math.min(page.value * pageSize.value, total.value))

  function reset() {
    page.value = 1
  }

  return { page, pageSize, paged, total, totalPages, rangeStart, rangeEnd, reset }
}
