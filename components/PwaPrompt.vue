<script setup>
import { ArrowDownTrayIcon, ShareIcon, XMarkIcon } from '@heroicons/vue/24/outline'

const STORAGE_KEY = 'numa3d-pwa-prompt-dismissed'
const dismissed = ref(true)
const isIos = ref(false)
const isStandalone = ref(false)

const { $pwa } = useNuxtApp()

const canNativeInstall = computed(() => Boolean($pwa?.showInstallPrompt) && !dismissed.value)
const showIosHint = computed(() => isIos.value && !isStandalone.value && !dismissed.value)
const visible = computed(() => canNativeInstall.value || showIosHint.value)
const needRefresh = computed(() => Boolean($pwa?.needRefresh))

function dismiss() {
  dismissed.value = true
  if (import.meta.client) localStorage.setItem(STORAGE_KEY, '1')
  $pwa?.cancelInstall?.()
}

async function install() {
  await $pwa?.install?.()
}

function reloadApp() {
  $pwa?.updateServiceWorker?.(true)
}

onMounted(() => {
  const ua = navigator.userAgent || ''
  isIos.value = /iphone|ipad|ipod/i.test(ua)
  isStandalone.value =
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  dismissed.value = localStorage.getItem(STORAGE_KEY) === '1'
})
</script>

<template>
  <div class="contents">
    <div
      v-if="needRefresh"
      class="fixed bottom-4 left-3 right-3 sm:left-auto sm:right-4 sm:max-w-sm z-[91] panel p-3 shadow-lg mb-[env(safe-area-inset-bottom,0px)]"
    >
      <div class="text-sm font-semibold">Versi baru Numa3D</div>
      <p class="text-xs text-ink-500 mt-0.5">Muat ulang untuk memakai pembaruan.</p>
      <div class="flex gap-2 mt-2">
        <button type="button" class="btn-primary !py-1 !px-2 text-xs" @click="reloadApp">Muat ulang</button>
        <button type="button" class="btn-secondary !py-1 !px-2 text-xs" @click="$pwa?.cancelPrompt?.()">Nanti</button>
      </div>
    </div>

    <div
      v-else-if="visible"
      class="fixed bottom-4 left-3 right-3 sm:left-auto sm:right-4 sm:max-w-sm z-[90] panel p-3 shadow-lg mb-[env(safe-area-inset-bottom,0px)]"
    >
      <div class="flex items-start gap-3">
        <img src="/pwa-192x192.png" alt="" class="w-10 h-10 rounded-panel shrink-0" />
        <div class="min-w-0 flex-1">
          <div class="text-sm font-semibold">Pasang Numa3D</div>
          <p v-if="canNativeInstall" class="text-xs text-ink-500 mt-0.5">
            Tambahkan ke layar utama supaya cepat dibuka seperti aplikasi.
          </p>
          <p v-else class="text-xs text-ink-500 mt-0.5">
            Di Safari: ketuk
            <ShareIcon class="w-3.5 h-3.5 inline -mt-0.5" />
            lalu <span class="font-medium">Add to Home Screen</span>.
          </p>
          <div class="flex flex-wrap gap-2 mt-2">
            <button v-if="canNativeInstall" type="button" class="btn-primary !py-1 !px-2 text-xs" @click="install">
              <ArrowDownTrayIcon class="w-3.5 h-3.5" />Pasang
            </button>
            <button type="button" class="btn-secondary !py-1 !px-2 text-xs" @click="dismiss">Nanti</button>
          </div>
        </div>
        <button type="button" class="text-ink-400 hover:text-ink-700 p-0.5" aria-label="Tutup" @click="dismiss">
          <XMarkIcon class="w-4 h-4" />
        </button>
      </div>
    </div>
  </div>
</template>
