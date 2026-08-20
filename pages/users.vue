<script setup>
import { PlusIcon, PencilSquareIcon, TrashIcon, CheckIcon, XMarkIcon } from '@heroicons/vue/24/outline'

const { data: users, refresh } = await useFetch('/api/users')
const authUser = useState('authUser')

const { page, pageSize, paged, total, totalPages, rangeStart, rangeEnd } = usePagination(
  computed(() => users.value || []),
  10
)

const roleLabel = { admin: 'Admin', staff: 'Staff' }
const roleBadge = { admin: 'bg-accent-100 text-accent-700', staff: 'bg-ink-100 text-ink-600' }

const showForm = ref(false)
const editing = ref(null)
const form = ref({})
const errorMsg = ref('')

function openAdd() {
  editing.value = null
  form.value = { username: '', password: '', role: 'staff' }
  errorMsg.value = ''
  showForm.value = true
}
function openEdit(u) {
  editing.value = u
  form.value = { username: u.username, password: '', role: u.role }
  errorMsg.value = ''
  showForm.value = true
}
async function save() {
  errorMsg.value = ''
  try {
    if (editing.value) {
      await $fetch(`/api/users/${editing.value.id}`, { method: 'PUT', body: form.value })
    } else {
      await $fetch('/api/users', { method: 'POST', body: form.value })
    }
    showForm.value = false
    await refresh()
  } catch (e) {
    errorMsg.value = e.data?.statusMessage || 'Gagal menyimpan'
  }
}
async function remove(u) {
  if (!(await useConfirm().confirm(`Hapus user "${u.username}"?`))) return
  try {
    await $fetch(`/api/users/${u.id}`, { method: 'DELETE' })
    await refresh()
  } catch (e) {
    useToast().error(e.data?.statusMessage || 'Gagal menghapus')
  }
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between gap-2">
      <h1 class="text-xl font-bold">User</h1>
      <button class="btn-primary" @click="openAdd">
        <PlusIcon class="w-4 h-4" /><span class="hidden sm:inline">Tambah User</span><span class="sm:hidden">Tambah</span>
      </button>
    </div>

    <p class="text-xs text-ink-500">
      Admin: akses penuh. Staff: hanya bisa mencatat Pengeluaran & Penjualan — sisanya (Material, Mesin,
      Packaging, Produk, Pengaturan, User) tampil read-only.
    </p>

    <div class="panel">
      <div class="overflow-x-auto">
      <table class="table-std">
        <thead>
          <tr>
            <th>Username</th>
            <th>Role</th>
            <th>Dibuat</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="u in paged" :key="u.id">
            <td class="font-medium">
              {{ u.username }}
              <span v-if="u.id === authUser?.id" class="text-xs text-ink-400">(kamu)</span>
            </td>
            <td><span class="badge" :class="roleBadge[u.role]">{{ roleLabel[u.role] }}</span></td>
            <td class="text-sm text-ink-500">{{ formatDate(u.createdAt) }}</td>
            <td class="whitespace-nowrap text-right">
              <button class="btn-secondary" @click="openEdit(u)"><PencilSquareIcon class="w-3.5 h-3.5" />Edit</button>
              <button
                class="btn-danger ml-1"
                :disabled="u.id === authUser?.id"
                @click="remove(u)"
              >
                <TrashIcon class="w-3.5 h-3.5" />Hapus
              </button>
            </td>
          </tr>
          <tr v-if="!total">
            <td colspan="4" class="text-center text-ink-500 py-6">Belum ada user.</td>
          </tr>
        </tbody>
      </table>
      </div>
      <AppPagination
        v-model:page="page"
        v-model:pageSize="pageSize"
        :total-pages="totalPages"
        :total="total"
        :range-start="rangeStart"
        :range-end="rangeEnd"
      />
    </div>

    <AppModal v-if="showForm" :title="editing ? 'Edit User' : 'Tambah User'" @close="showForm = false">
      <form class="space-y-3" @submit.prevent="save">
        <div>
          <label class="label">Username</label>
          <input v-model="form.username" class="input" required placeholder="staff1" />
        </div>
        <div>
          <label class="label">{{ editing ? 'Password baru (kosongkan jika tidak diganti)' : 'Password' }}</label>
          <input v-model="form.password" type="password" class="input" :required="!editing" placeholder="Minimal 6 karakter" />
        </div>
        <div>
          <label class="label">Role</label>
          <select v-model="form.role" class="input">
            <option value="staff">Staff</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <p v-if="errorMsg" class="text-sm text-red-600">{{ errorMsg }}</p>
        <div class="flex justify-end gap-2 pt-2">
          <button type="button" class="btn-secondary" @click="showForm = false"><XMarkIcon class="w-4 h-4" />Batal</button>
          <button type="submit" class="btn-primary"><CheckIcon class="w-4 h-4" />Simpan</button>
        </div>
      </form>
    </AppModal>
  </div>
</template>
