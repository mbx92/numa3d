<script setup>
import { ArrowRightEndOnRectangleIcon } from '@heroicons/vue/24/outline'

definePageMeta({ layout: false })

const form = ref({ username: '', password: '' })
const errorMsg = ref('')
const loading = ref(false)

async function submit() {
  errorMsg.value = ''
  loading.value = true
  try {
    const res = await $fetch('/api/auth/login', { method: 'POST', body: form.value })
    useState('authUser').value = res.user
    await navigateTo('/')
  } catch (e) {
    errorMsg.value = e.data?.statusMessage || 'Gagal login'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-ink-900 p-4 pt-safe pb-safe">
    <div class="panel w-full max-w-sm">
      <div class="px-6 pt-6 flex items-center gap-2">
        <img src="/logo-mark.svg" alt="" class="w-7 h-7" />
        <span class="font-bold tracking-wide text-lg">NUMA3D</span>
        <span class="text-[10px] uppercase tracking-widest text-ink-400 ml-auto">Workshop</span>
      </div>
      <form class="p-6 space-y-4" @submit.prevent="submit">
        <div>
          <label class="label">Username</label>
          <input v-model="form.username" class="input" required autocomplete="username" />
        </div>
        <div>
          <label class="label">Password</label>
          <input v-model="form.password" type="password" class="input" required autocomplete="current-password" />
        </div>
        <p v-if="errorMsg" class="text-sm text-red-600">{{ errorMsg }}</p>
        <button type="submit" class="btn-primary w-full justify-center" :disabled="loading">
          <ArrowRightEndOnRectangleIcon class="w-4 h-4" />{{ loading ? 'Masuk…' : 'Masuk' }}
        </button>
      </form>
    </div>
  </div>
</template>
