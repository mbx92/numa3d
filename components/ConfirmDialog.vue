<script setup>
import { XMarkIcon, TrashIcon, CheckIcon } from '@heroicons/vue/24/outline'

const { state, respond } = useConfirm()

function onKeydown(e) {
  if (state.visible && e.key === 'Escape') respond(false)
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <div v-if="state.visible" class="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div class="absolute inset-0 bg-ink-950/50" @click="respond(false)"></div>
      <div class="relative panel w-full max-w-sm">
        <div class="panel-header">
          <span class="panel-title">{{ state.title }}</span>
        </div>
        <div class="p-4 text-sm text-ink-700 whitespace-pre-line">{{ state.message }}</div>
        <div class="px-4 pb-4 flex justify-end gap-2">
          <button class="btn-secondary" @click="respond(false)"><XMarkIcon class="w-4 h-4" />{{ state.cancelText }}</button>
          <button
            class="btn"
            :class="state.danger ? 'bg-red-600 text-white hover:bg-red-700' : 'btn-primary'"
            autofocus
            @click="respond(true)"
          >
            <component :is="state.danger ? TrashIcon : CheckIcon" class="w-4 h-4" />{{ state.confirmText }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
