<script setup>
import {
  ArrowLeftIcon,
  CubeTransparentIcon,
  Squares2X2Icon,
  UserIcon,
  ArrowRightStartOnRectangleIcon
} from '@heroicons/vue/24/outline'

const route = useRoute()
const authUser = useState('authUser')

const toolTitle = computed(() => route.meta.toolTitle || 'Tools')
const toolBeta = computed(() => !!route.meta.toolBeta)
const fullBleed = computed(() => !!route.meta.toolFullBleed)

const backLink = computed(() => {
  if (route.path.startsWith('/tools/') && route.path !== '/tools' && route.path !== '/tools/') {
    return { to: '/tools', label: 'Tools' }
  }
  return { to: '/', label: 'Dashboard' }
})

async function logout() {
  await $fetch('/api/auth/logout', { method: 'POST' })
  authUser.value = null
  await navigateTo('/login')
}
</script>

<template>
  <div class="h-screen flex flex-col bg-ink-100 overflow-hidden pt-safe">
    <header
      class="shrink-0 flex items-center gap-2 px-3 sm:px-4 h-12 border-b border-ink-200 bg-white"
    >
      <NuxtLink
        :to="backLink.to"
        class="inline-flex items-center gap-1.5 text-sm text-ink-600 hover:text-ink-900 shrink-0"
      >
        <ArrowLeftIcon class="w-4 h-4" />
        <span class="hidden sm:inline">{{ backLink.label }}</span>
      </NuxtLink>

      <div class="w-px h-5 bg-ink-200 shrink-0" />

      <NuxtLink to="/tools" class="inline-flex items-center gap-2 min-w-0 shrink-0">
        <img src="/logo-mark.svg" alt="" class="w-5 h-5" />
        <span class="text-sm font-bold tracking-wide text-ink-900 hidden sm:inline">NUMA3D</span>
      </NuxtLink>

      <span class="text-ink-300 hidden sm:inline">/</span>
      <h1 class="text-sm font-semibold text-ink-800 truncate min-w-0">{{ toolTitle }}</h1>
      <span
        v-if="toolBeta"
        class="badge text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-800 ring-1 ring-amber-200/80 shrink-0"
      >
        Beta
      </span>

      <div class="ml-auto flex items-center gap-1 sm:gap-2 shrink-0">
        <NuxtLink to="/gallery" class="btn-secondary text-xs py-1.5 px-2 hidden md:inline-flex">
          <CubeTransparentIcon class="w-4 h-4" />
          Galeri
        </NuxtLink>
        <NuxtLink to="/" class="btn-secondary text-xs py-1.5 px-2 hidden lg:inline-flex" title="Dashboard">
          <Squares2X2Icon class="w-4 h-4" />
        </NuxtLink>
        <span v-if="authUser" class="hidden md:inline text-xs text-ink-500 truncate max-w-[6rem]">
          {{ authUser.username }}
        </span>
        <button
          type="button"
          class="p-1.5 rounded text-ink-500 hover:text-ink-800 hover:bg-ink-100"
          title="Keluar"
          @click="logout"
        >
          <ArrowRightStartOnRectangleIcon class="w-5 h-5" />
        </button>
      </div>
    </header>

    <main class="flex-1 min-h-0 overflow-hidden" :class="fullBleed ? '' : 'overflow-y-auto p-4 md:p-6'">
      <slot />
    </main>
  </div>
</template>
