<script setup>
import { PhotoIcon, ArrowUpTrayIcon, TrashIcon } from '@heroicons/vue/24/outline'

// Pratinjau + unggah gambar untuk satu entitas (material/produk).
// `src` di-cache-bust dengan versi lokal agar gambar baru langsung tampil
// setelah unggah, tanpa terganggu cache browser pada URL yang sama.
const props = defineProps({
  src: { type: String, default: '' },
  hasImage: { type: Boolean, default: false },
  uploadUrl: { type: String, required: true },
  editable: { type: Boolean, default: true },
  size: { type: String, default: 'w-28 h-28' }
})
const emit = defineEmits(['changed'])

const input = ref(null)
const busy = ref(false)
const errorMsg = ref('')
const version = ref(0)
const present = ref(props.hasImage)

const displaySrc = computed(() => (present.value ? `${props.src}?v=${version.value}` : ''))

async function onPick(e) {
  const file = e.target.files?.[0]
  if (!file) return
  busy.value = true
  errorMsg.value = ''
  const form = new FormData()
  form.append('image', file)
  try {
    await $fetch(props.uploadUrl, { method: 'POST', body: form })
    present.value = true
    version.value++
    emit('changed')
  } catch (err) {
    errorMsg.value = err.data?.statusMessage || 'Gagal mengunggah gambar'
  } finally {
    busy.value = false
    if (input.value) input.value.value = ''
  }
}

async function removeImage() {
  if (!(await useConfirm().confirm('Hapus gambar ini?'))) return
  busy.value = true
  try {
    await $fetch(props.uploadUrl, { method: 'DELETE' })
    present.value = false
    emit('changed')
  } catch (err) {
    useToast().error(err.data?.statusMessage || 'Gagal menghapus gambar')
  } finally {
    busy.value = false
  }
}

watch(
  () => props.hasImage,
  (v) => (present.value = v)
)
</script>

<template>
  <div class="space-y-2">
    <div
      class="rounded-panel border border-ink-200 bg-ink-50 overflow-hidden flex items-center justify-center shrink-0"
      :class="size"
    >
      <img v-if="present" :src="displaySrc" alt="" class="w-full h-full object-cover" />
      <PhotoIcon v-else class="w-8 h-8 text-ink-300" />
    </div>
    <div v-if="editable" class="flex items-center gap-2">
      <label class="btn-secondary cursor-pointer">
        <ArrowUpTrayIcon class="w-3.5 h-3.5" />{{ busy ? 'Memproses…' : present ? 'Ganti' : 'Upload' }}
        <input
          ref="input"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          class="hidden"
          :disabled="busy"
          @change="onPick"
        />
      </label>
      <button v-if="present" type="button" class="btn-danger" :disabled="busy" @click="removeImage">
        <TrashIcon class="w-4 h-4" />Hapus
      </button>
    </div>
    <p v-if="errorMsg" class="text-xs text-red-600">{{ errorMsg }}</p>
    <p v-else-if="editable" class="text-xs text-ink-400">JPG/PNG/WebP, maks 5 MB</p>
  </div>
</template>
