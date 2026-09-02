<script setup>
import {
  ArrowPathIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  Squares2X2Icon
} from '@heroicons/vue/24/outline'

const props = defineProps({
  viewTabs: { type: Array, default: () => [] },
  activeView: { type: String, default: 'assembly' },
  partLegend: { type: Array, default: () => [] },
  selectedPartId: { type: String, default: '' },
  explodeFactor: { type: Number, default: 0 },
  autoExplode: { type: Boolean, default: false },
  showAssemblyControls: { type: Boolean, default: false },
  showGrid: { type: Boolean, default: true },
  filename: { type: String, default: '' },
  disabled: { type: Boolean, default: false }
})

const emit = defineEmits([
  'update:activeView',
  'update:selectedPartId',
  'update:explodeFactor',
  'update:autoExplode',
  'update:showGrid',
  'reset-positions'
])

const bounds = ref(null)
const panel = ref(null)
const minimized = ref(false)
const pos = ref({ x: 12, y: 12 })
const dragging = ref(false)

let dragState = null

const activeViewTab = computed(() => props.viewTabs.find((tab) => tab.id === props.activeView))
const activeViewLabel = computed(() => activeViewTab.value?.label || 'Preview')

const panelStyle = computed(() => ({
  left: `${pos.value.x}px`,
  top: `${pos.value.y}px`
}))

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), Math.max(min, max))
}

function clampPosition() {
  const boundsEl = bounds.value
  const panelEl = panel.value
  if (!boundsEl || !panelEl) return
  const pad = 8
  const maxX = Math.max(pad, boundsEl.clientWidth - panelEl.offsetWidth - pad)
  const maxY = Math.max(pad, boundsEl.clientHeight - panelEl.offsetHeight - pad)
  pos.value = {
    x: clamp(pos.value.x, pad, maxX),
    y: clamp(pos.value.y, pad, maxY)
  }
}

function pickView(id) {
  if (props.disabled) return
  emit('update:activeView', id)
}

function pickPart(id) {
  if (props.disabled) return
  emit('update:selectedPartId', props.selectedPartId === id ? '' : id)
}

function tabSwatchStyle(tab) {
  if (Array.isArray(tab.colors) && tab.colors.length > 1) {
    const stops = tab.colors.map((c, i) => `${c} ${(i / (tab.colors.length - 1)) * 100}%`).join(', ')
    return { background: `linear-gradient(135deg, ${stops})` }
  }
  return { backgroundColor: tab.color || tab.colors?.[0] || '#cbd5e1' }
}

function resetPositions() {
  if (props.disabled) return
  emit('reset-positions')
}

function toggleMinimized() {
  minimized.value = !minimized.value
  nextTick(clampPosition)
}

function canStartDrag(event) {
  if (props.disabled) return false
  if (event.button !== 0) return false
  const target = event.target
  if (!(target instanceof Element)) return false
  return Boolean(target.closest('[data-legend-drag]'))
}

function onDragStart(event) {
  if (!canStartDrag(event)) return
  event.preventDefault()
  dragState = {
    startX: event.clientX,
    startY: event.clientY,
    originX: pos.value.x,
    originY: pos.value.y,
    pointerId: event.pointerId
  }
  dragging.value = true
  window.addEventListener('pointermove', onDragMove)
  window.addEventListener('pointerup', onDragEnd)
  window.addEventListener('pointercancel', onDragEnd)
}

function onDragMove(event) {
  if (!dragState) return
  const dx = event.clientX - dragState.startX
  const dy = event.clientY - dragState.startY
  pos.value = {
    x: dragState.originX + dx,
    y: dragState.originY + dy
  }
  clampPosition()
}

function onDragEnd() {
  dragState = null
  dragging.value = false
  window.removeEventListener('pointermove', onDragMove)
  window.removeEventListener('pointerup', onDragEnd)
  window.removeEventListener('pointercancel', onDragEnd)
}

let resizeObserver = null

onMounted(() => {
  nextTick(clampPosition)
  if (bounds.value && typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => clampPosition())
    resizeObserver.observe(bounds.value)
  }
})

onUnmounted(() => {
  onDragEnd()
  resizeObserver?.disconnect()
})
</script>

<template>
  <div ref="bounds" class="pointer-events-none absolute inset-0 z-10">
    <div
      ref="panel"
      class="pointer-events-auto absolute rounded-xl border border-ink-200/90 bg-white/92 backdrop-blur-md shadow-lg text-[11px] overflow-hidden transition-shadow"
      :class="[
        dragging ? 'shadow-xl ring-1 ring-accent-200/60' : '',
        minimized ? 'w-[11.5rem]' : 'w-[15rem] sm:w-[17rem]'
      ]"
      :style="panelStyle"
    >
      <div
        data-legend-drag
        class="flex items-center gap-2 border-b border-ink-100 bg-ink-50/90 px-2 py-1.5 select-none"
        :class="dragging ? 'cursor-grabbing' : 'cursor-grab'"
        @pointerdown="onDragStart"
      >
        <span class="flex flex-col gap-0.5 shrink-0 text-ink-300" aria-hidden="true">
          <span class="block h-0.5 w-3.5 rounded-full bg-current" />
          <span class="block h-0.5 w-3.5 rounded-full bg-current" />
        </span>
        <span class="min-w-0 flex-1 truncate text-[10px] font-semibold text-ink-600">
          {{ minimized ? activeViewLabel : 'Legend preview' }}
        </span>
        <button
          type="button"
          class="shrink-0 rounded-md p-1 text-ink-500 transition-colors hover:bg-white hover:text-ink-800"
          :aria-expanded="!minimized"
          :aria-label="minimized ? 'Buka legend' : 'Minimize legend'"
          @pointerdown.stop
          @click.stop="toggleMinimized"
        >
          <ChevronUpIcon v-if="!minimized" class="h-4 w-4" />
          <ChevronDownIcon v-else class="h-4 w-4" />
        </button>
      </div>

      <template v-if="!minimized">
        <div class="px-2.5 py-2 border-b border-ink-100">
          <p class="text-[9px] font-semibold uppercase tracking-wider text-ink-400">Tampilan</p>
          <ul class="mt-1.5 space-y-0.5" role="tablist" aria-label="Preview model">
            <li v-for="tab in viewTabs" :key="tab.id">
              <button
                type="button"
                role="tab"
                :aria-selected="activeView === tab.id"
                :disabled="disabled"
                class="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors disabled:opacity-40"
                :class="activeView === tab.id ? 'bg-ink-800 text-white' : 'text-ink-700 hover:bg-ink-50'"
                @click="pickView(tab.id)"
              >
                <span
                  class="h-3.5 w-3.5 shrink-0 rounded-full border border-black/10 shadow-inner ring-1 ring-black/5"
                  :style="tabSwatchStyle(tab)"
                />
                <span class="min-w-0 flex-1 truncate font-medium">{{ tab.label }}</span>
              </button>
            </li>
          </ul>
        </div>

        <div v-if="showAssemblyControls && partLegend.length" class="px-2.5 py-2 border-b border-ink-100">
          <p class="text-[9px] font-semibold uppercase tracking-wider text-ink-400">Komponen</p>
          <ul class="mt-1.5 max-h-[9.5rem] overflow-y-auto space-y-0.5 pr-0.5" role="listbox" aria-label="Komponen perakitan">
            <li v-for="part in partLegend" :key="part.id">
              <button
                type="button"
                role="option"
                :aria-selected="selectedPartId === part.id"
                :disabled="disabled"
                class="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors disabled:opacity-40"
                :class="
                  selectedPartId === part.id
                    ? 'bg-accent-50 text-accent-900 ring-1 ring-accent-200'
                    : 'text-ink-700 hover:bg-ink-50'
                "
                @click="pickPart(part.id)"
              >
                <span
                  class="h-3.5 w-3.5 shrink-0 rounded-md border border-black/10 shadow-inner"
                  :style="{ backgroundColor: part.color }"
                />
                <span class="min-w-0 flex-1 truncate">{{ part.label }}</span>
              </button>
            </li>
          </ul>
          <p class="mt-1.5 text-[9px] leading-snug text-ink-400">
            Klik part di scene atau legend · tarik part terpilih untuk geser
          </p>
        </div>

        <div v-if="showAssemblyControls" class="px-2.5 py-2 space-y-2 border-b border-ink-100">
          <div>
            <div class="flex items-center justify-between gap-2">
              <span class="text-[9px] font-semibold uppercase tracking-wider text-ink-400">Explode</span>
              <button
                type="button"
                class="rounded-md border px-2 py-0.5 text-[10px] font-medium transition-colors"
                :class="
                  autoExplode
                    ? 'border-accent-400 bg-accent-50 text-accent-800'
                    : 'border-ink-200 bg-white text-ink-600 hover:bg-ink-50'
                "
                :disabled="disabled"
                @click="emit('update:autoExplode', !autoExplode)"
              >
                {{ autoExplode ? 'Stop anim' : 'Animasi' }}
              </button>
            </div>
            <input
              :value="explodeFactor"
              type="range"
              min="0"
              max="1"
              step="0.01"
              class="mt-1.5 w-full accent-accent-600"
              :disabled="disabled || autoExplode"
              @input="emit('update:explodeFactor', Number($event.target.value))"
            />
          </div>
          <button
            type="button"
            class="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-ink-200 bg-white px-2 py-1.5 text-[10px] font-medium text-ink-700 transition-colors hover:bg-ink-50 disabled:opacity-40"
            :disabled="disabled"
            @click="resetPositions"
          >
            <ArrowPathIcon class="h-3.5 w-3.5" />
            Reset posisi
          </button>
        </div>

        <div class="px-2.5 py-2">
          <button
            type="button"
            class="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-[10px] font-medium transition-colors disabled:opacity-40"
            :class="
              showGrid
                ? 'border-ink-300 bg-ink-100 text-ink-800'
                : 'border-ink-200 bg-white text-ink-600 hover:bg-ink-50'
            "
            :disabled="disabled"
            :aria-pressed="showGrid"
            @click="emit('update:showGrid', !showGrid)"
          >
            <Squares2X2Icon class="h-3.5 w-3.5" />
            Grid {{ showGrid ? 'on' : 'off' }}
          </button>
        </div>

        <p v-if="filename" class="px-2.5 py-1.5 text-[9px] font-mono text-ink-400 truncate border-t border-ink-100 bg-ink-50/50">
          {{ filename }}
        </p>
      </template>

      <div v-else class="flex items-center gap-2 px-2.5 py-2">
        <span
          v-if="activeViewTab"
          class="h-4 w-4 shrink-0 rounded-full border border-black/10 shadow-inner"
          :style="tabSwatchStyle(activeViewTab)"
        />
        <span class="min-w-0 flex-1 truncate text-[10px] text-ink-500">{{ filename || activeViewLabel }}</span>
      </div>
    </div>

    <div class="pointer-events-none absolute inset-0 flex flex-col justify-end p-2 sm:p-3">
      <slot name="footer" />
    </div>
  </div>
</template>
