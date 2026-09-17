<script setup>
import { PlusIcon, PencilSquareIcon, TrashIcon } from '@heroicons/vue/24/outline'

defineProps({ types: { type: Array, default: () => [] } })
const emit = defineEmits(['changed', 'created'])
const name = ref('')
const editingId = ref(null)
const busy = ref(false)
const error = ref('')

function edit(type) { editingId.value = type.id; name.value = type.name; error.value = '' }
function reset() { editingId.value = null; name.value = ''; error.value = '' }
async function save() {
  if (busy.value) return
  busy.value = true; error.value = ''
  try {
    const editing = editingId.value
    const type = await $fetch(editing ? `/api/filament-types/${editing}` : '/api/filament-types', { method: editing ? 'PUT' : 'POST', body: { name: name.value } })
    reset()
    emit('changed')
    if (!editing) emit('created', type)
  } catch (e) { error.value = e.data?.statusMessage || 'Gagal menyimpan jenis filament' }
  finally { busy.value = false }
}
async function remove(type) {
  if (busy.value || !(await useConfirm().confirm(`Hapus jenis filament "${type.name}"?`))) return
  busy.value = true; error.value = ''
  try {
    await $fetch(`/api/filament-types/${type.id}`, { method: 'DELETE' })
    if (editingId.value === type.id) reset()
    emit('changed')
  } catch (e) { error.value = e.data?.statusMessage || 'Gagal menghapus jenis filament' }
  finally { busy.value = false }
}
</script>

<template>
  <div class="space-y-3">
    <form class="space-y-2" @submit.prevent="save">
      <label class="block">
        <span class="label">{{ editingId ? 'Ubah jenis filament' : 'Jenis filament baru' }}</span>
        <input v-model="name" class="input" required maxlength="60" placeholder="Contoh: PLA Silk, PETG, TPU" :disabled="busy" />
      </label>
      <div class="flex gap-2">
        <button class="btn-primary" :disabled="busy"><PlusIcon v-if="!editingId" class="w-4 h-4" />{{ busy ? 'Menyimpan…' : editingId ? 'Simpan perubahan' : 'Tambah jenis' }}</button>
        <button v-if="editingId" type="button" class="btn-secondary" :disabled="busy" @click="reset">Batal</button>
      </div>
    </form>
    <p v-if="error" role="alert" class="text-sm text-red-600">{{ error }}</p>
    <ul class="divide-y divide-ink-100">
      <li v-for="type in types" :key="type.id" class="flex items-center gap-2 py-2">
        <span class="flex-1 text-sm break-words">{{ type.name }}</span>
        <button type="button" class="btn-secondary" :disabled="busy" :aria-label="`Edit ${type.name}`" @click="edit(type)"><PencilSquareIcon class="w-4 h-4" /></button>
        <button type="button" class="btn-danger" :disabled="busy" :aria-label="`Hapus ${type.name}`" @click="remove(type)"><TrashIcon class="w-4 h-4" /></button>
      </li>
    </ul>
    <p v-if="!types.length" class="text-sm text-ink-500">Belum ada jenis filament.</p>
  </div>
</template>
