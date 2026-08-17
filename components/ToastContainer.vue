<script setup>
import {
  CheckCircleIcon,
  ExclamationCircleIcon,
  InformationCircleIcon
} from '@heroicons/vue/24/outline'

const { toasts, dismiss, pauseAll, resumeAll } = useToast()

const typeMeta = {
  success: { icon: CheckCircleIcon, border: 'border-l-green-500', color: 'text-green-500' },
  error: { icon: ExclamationCircleIcon, border: 'border-l-red-500', color: 'text-red-500' },
  info: { icon: InformationCircleIcon, border: 'border-l-teal-500', color: 'text-teal-500' }
}
</script>

<template>
  <!-- ClientOnly: Teleport ke body saat SSR membuat anchor-nya tidak cocok
       waktu hydration. Toast murni interaksi klien, jadi tidak perlu dirender di server. -->
  <ClientOnly>
    <Teleport to="body">
      <div
        class="fixed top-0 inset-x-0 z-[300] flex flex-col items-center gap-2 px-3 pt-safe pointer-events-none"
        aria-live="polite"
        @mouseenter="pauseAll()"
        @mouseleave="resumeAll()"
      >
        <div class="w-full max-w-sm mt-3 flex flex-col gap-2 pointer-events-auto">
          <TransitionGroup name="toast">
            <div
              v-for="t in toasts"
              :key="t.id"
              class="panel px-3.5 py-3 shadow-lg flex items-start gap-3 border-l-4"
              :class="typeMeta[t.type]?.border ?? typeMeta.info.border"
            >
              <component
                :is="typeMeta[t.type]?.icon ?? typeMeta.info.icon"
                class="w-5 h-5 shrink-0 mt-0.5"
                :class="typeMeta[t.type]?.color ?? typeMeta.info.color"
              />
              <div class="flex-1 min-w-0">
                <p v-if="t.title" class="text-sm font-semibold text-ink-900 leading-snug">{{ t.title }}</p>
                <p class="text-sm text-ink-700 leading-snug">{{ t.message }}</p>
              </div>
              <button
                class="text-ink-400 hover:text-ink-700 text-lg leading-none shrink-0"
                aria-label="Tutup notifikasi"
                @click="dismiss(t.id)"
              >&times;</button>
            </div>
          </TransitionGroup>
        </div>
      </div>
    </Teleport>
  </ClientOnly>
</template>

<style scoped>
.toast-enter-active,
.toast-leave-active {
  transition: all 0.2s ease;
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
.toast-move {
  transition: transform 0.2s ease;
}
</style>
