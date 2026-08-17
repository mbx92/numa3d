<script setup>
import {
  Squares2X2Icon,
  CircleStackIcon,
  CpuChipIcon,
  ArchiveBoxIcon,
  CubeIcon,
  BuildingStorefrontIcon,
  BanknotesIcon,
  ShoppingCartIcon,
  TruckIcon,
  ChartBarIcon,
  WalletIcon,
  Cog6ToothIcon,
  UsersIcon,
  UserIcon,
  ClipboardDocumentListIcon,
  Bars3Icon,
  XMarkIcon,
  ArrowRightStartOnRectangleIcon
} from '@heroicons/vue/24/outline'

const authUser = useState('authUser')
const isAdmin = computed(() => authUser.value?.role === 'admin')

const baseNav = [
  { to: '/', label: 'Dashboard', icon: Squares2X2Icon },
  { to: '/materials', label: 'Material', icon: CircleStackIcon },
  { to: '/machines', label: 'Mesin', icon: CpuChipIcon },
  { to: '/packaging', label: 'Packaging', icon: ArchiveBoxIcon },
  { to: '/products', label: 'Produk & HPP', icon: CubeIcon },
  { to: '/catalog', label: 'Katalog', icon: BuildingStorefrontIcon },
  { to: '/purchases', label: 'Pembelian', icon: TruckIcon },
  { to: '/expenses', label: 'Pengeluaran', icon: BanknotesIcon },
  { to: '/sales', label: 'Penjualan', icon: ShoppingCartIcon },
  { to: '/reports', label: 'Laporan', icon: ChartBarIcon },
  { to: '/capital', label: 'Modal', icon: WalletIcon },
  { to: '/settings', label: 'Pengaturan', icon: Cog6ToothIcon }
]
const nav = computed(() =>
  isAdmin.value
    ? [
        ...baseNav,
        { to: '/users', label: 'User', icon: UsersIcon },
        { to: '/audit-log', label: 'Log Aktivitas', icon: ClipboardDocumentListIcon }
      ]
    : baseNav
)

const roleLabel = { admin: 'Admin', staff: 'Staff' }

// Daftar menu sudah terlalu panjang untuk topbar geser di layar kecil,
// jadi di mobile dipakai drawer yang tertutup otomatis saat pindah halaman.
const drawerOpen = ref(false)
const route = useRoute()
watch(() => route.fullPath, () => (drawerOpen.value = false))
watch(drawerOpen, (open) => {
  if (import.meta.client) document.body.style.overflow = open ? 'hidden' : ''
})
onUnmounted(() => {
  if (import.meta.client) document.body.style.overflow = ''
})

async function logout() {
  await $fetch('/api/auth/logout', { method: 'POST' })
  authUser.value = null
  await navigateTo('/login')
}
</script>

<template>
  <div class="min-h-screen md:flex">
    <!-- Topbar (mobile) — pt-safe agar hamburger tidak tertutup status bar di PWA standalone -->
    <header
      class="md:hidden sticky top-0 z-40 flex items-center gap-2 px-3 pt-safe min-h-topbar-safe bg-ink-900 text-ink-100 border-b border-ink-700"
    >
      <button class="p-2 -ml-2 rounded hover:bg-ink-800" aria-label="Buka menu" @click="drawerOpen = true">
        <Bars3Icon class="w-6 h-6" />
      </button>
      <img src="/logo-mark.svg" alt="" class="w-6 h-6" />
      <span class="font-bold tracking-wide">NUMA3D</span>
      <span v-if="authUser" class="ml-auto text-xs text-ink-400 truncate max-w-[8rem]">{{ authUser.username }}</span>
    </header>

    <!-- Drawer overlay (mobile) -->
    <Teleport to="body">
      <div v-if="drawerOpen" class="md:hidden fixed inset-0 z-50 flex">
        <div class="absolute inset-0 bg-ink-950/60" @click="drawerOpen = false"></div>
        <aside class="relative bg-ink-900 text-ink-100 w-72 max-w-[85vw] h-full flex flex-col pt-safe pb-safe">
          <div class="px-4 py-4 flex items-center gap-2 border-b border-ink-700">
            <img src="/logo-mark.svg" alt="" class="w-6 h-6" />
            <span class="font-bold tracking-wide">NUMA3D</span>
            <button class="ml-auto p-1 rounded hover:bg-ink-800" aria-label="Tutup menu" @click="drawerOpen = false">
              <XMarkIcon class="w-5 h-5" />
            </button>
          </div>
          <nav class="flex-1 overflow-y-auto">
            <NuxtLink
              v-for="item in nav"
              :key="item.to"
              :to="item.to"
              class="flex items-center gap-3 px-4 py-3 text-sm border-l-2 border-transparent text-ink-300 hover:text-white hover:bg-ink-800 transition-colors"
              active-class="!border-accent-500 !text-white bg-ink-800"
            >
              <component :is="item.icon" class="w-5 h-5 shrink-0" />
              {{ item.label }}
            </NuxtLink>
          </nav>
          <div class="border-t border-ink-700">
            <div v-if="authUser" class="flex items-center gap-3 px-4 py-3">
              <div
                class="w-9 h-9 shrink-0 rounded-full bg-ink-800 border border-ink-700 flex items-center justify-center text-ink-300"
              >
                <UserIcon class="w-5 h-5" />
              </div>
              <div class="min-w-0 flex-1">
                <p class="text-sm font-medium text-ink-100 truncate">{{ authUser.username }}</p>
                <span
                  class="badge text-[10px] mt-0.5"
                  :class="isAdmin ? 'bg-accent-500/20 text-accent-300' : 'bg-ink-700 text-ink-300'"
                >
                  {{ roleLabel[authUser.role] }}
                </span>
              </div>
              <button
                class="shrink-0 inline-flex items-center gap-1.5 px-2 py-1.5 rounded text-xs text-ink-300 hover:text-white hover:bg-ink-800 transition-colors"
                title="Keluar"
                @click="logout"
              >
                <ArrowRightStartOnRectangleIcon class="w-5 h-5" />
                <span class="hidden sm:inline">Keluar</span>
              </button>
            </div>
          </div>
        </aside>
      </div>
    </Teleport>

    <!-- Sidebar (desktop / tablet standalone) -->
    <aside class="hidden md:flex bg-ink-900 text-ink-100 w-56 h-screen sticky top-0 shrink-0 flex-col pt-safe pb-safe">
      <div class="px-4 py-4 flex items-center gap-2 border-b border-ink-700">
        <img src="/logo-mark.svg" alt="" class="w-6 h-6" />
        <span class="font-bold tracking-wide">NUMA3D</span>
        <span class="text-[10px] uppercase tracking-widest text-ink-400 ml-auto">Workshop</span>
      </div>
      <nav class="flex flex-col overflow-y-auto flex-1">
        <NuxtLink
          v-for="item in nav"
          :key="item.to"
          :to="item.to"
          class="flex items-center gap-2.5 px-4 py-3 text-sm whitespace-nowrap border-l-2 border-transparent text-ink-300 hover:text-white hover:bg-ink-800 transition-colors"
          active-class="!border-accent-500 !text-white bg-ink-800"
        >
          <component :is="item.icon" class="w-5 h-5 shrink-0" />
          {{ item.label }}
        </NuxtLink>
        <div class="mt-auto sticky bottom-0 bg-ink-900 border-t border-ink-700">
          <div v-if="authUser" class="flex items-center gap-2 px-3 py-3">
            <div
              class="w-9 h-9 shrink-0 rounded-full bg-ink-800 border border-ink-700 flex items-center justify-center text-ink-300"
            >
              <UserIcon class="w-5 h-5" />
            </div>
            <div class="min-w-0 flex-1">
              <p class="text-sm font-medium text-ink-100 truncate">{{ authUser.username }}</p>
              <span
                class="badge text-[10px] mt-0.5"
                :class="isAdmin ? 'bg-accent-500/20 text-accent-300' : 'bg-ink-700 text-ink-300'"
              >
                {{ roleLabel[authUser.role] }}
              </span>
            </div>
            <button
              class="shrink-0 p-1.5 rounded text-ink-300 hover:text-white hover:bg-ink-800 transition-colors"
              title="Keluar"
              @click="logout"
            >
              <ArrowRightStartOnRectangleIcon class="w-5 h-5" />
            </button>
          </div>
        </div>
      </nav>
    </aside>

    <main class="flex-1 w-full min-w-0 p-3 sm:p-4 md:p-6">
      <slot />
    </main>
  </div>
</template>
