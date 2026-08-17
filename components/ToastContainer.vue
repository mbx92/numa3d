<script setup>
import {
  CheckCircleIcon,
  ExclamationCircleIcon,
  InformationCircleIcon
} from '@heroicons/vue/24/outline'

const { toasts, config, dismiss, pauseAll, resumeAll } = useToast()

const typeMeta = {
  success: { icon: CheckCircleIcon, border: 'border-l-green-500', color: 'text-green-500' },
  error: { icon: ExclamationCircleIcon, border: 'border-l-red-500', color: 'text-red-500' },
  info: { icon: InformationCircleIcon, border: 'border-l-teal-500', color: 'text-teal-500' }
}

const isTop = computed(() => config.position !== 'bottom')
const shellClass = computed(() =>
  isTop.value
    ? 'fixed top-0 inset-x-0 z-[300] flex flex-col items-center px-3 pt-safe pointer-events-none'
    : 'fixed bottom-0 inset-x-0 z-[300] flex flex-col items-center px-3 pb-safe pointer-events-none'
)
const stackClass = computed(() =>
  [
    'w-full flex flex-col gap-2 pointer-events-auto',
    config.maxWidthClass || 'max-w-sm',
    isTop.value ? 'mt-3' : 'mb-3'
  ].join(' ')
)
</script>

<template>
  <!-- ClientOnly: Teleport ke body saat SSR membuat anchor-nya tidak cocok
       waktu hydration. Toast murni interaksi klien, jadi tidak perlu dirender di server. -->
  <ClientOnly>
    <Teleport to="body">
      <div
        :class="shellClass"
        aria-live="polite"
        @mouseenter="pauseAll()"
        @mouseleave="resumeAll()"
      >
        <div :class="stackClass">
          <TransitionGroup :name="isTop ? 'toast-top' : 'toast-bottom'">
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
.toast-top-enter-active,
.toast-top-leave-active,
.toast-bottom-enter-active,
.toast-bottom-leave-active {
  transition: all 0.2s ease;
}
.toast-top-enter-from,
.toast-top-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
.toast-bottom-enter-from,
.toast-bottom-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
.toast-top-move,
.toast-bottom-move {
  transition: transform 0.2s ease;
}
</style>
