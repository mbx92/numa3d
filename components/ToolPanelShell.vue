<script setup>
import { ArrowPathIcon, ChevronDownIcon, ChevronUpIcon } from '@heroicons/vue/24/outline'
import { useUiLayout } from '~/composables/useUiLayout.js'

const props = defineProps({
  panels: { type: Array, required: true },
  activePanel: { type: String, required: true },
  activePanelMeta: { type: Object, default: null },
  generating: { type: Boolean, default: false },
  result: { type: Object, default: null }
})

const emit = defineEmits(['update:activePanel', 'select', 'generate'])

const { layoutConfig } = useUiLayout()

const navRef = ref(null)
const mobileCollapsed = ref(false)

function selectPanel(id) {
  emit('select', id)
}

function onGenerate() {
  emit('generate')
}

function toggleMobileCollapsed() {
  mobileCollapsed.value = !mobileCollapsed.value
}

watch(
  () => layoutConfig.value.panelCollapsedDefault,
  (value) => {
    mobileCollapsed.value = value
  },
  { immediate: true }
)

watch(
  () => props.activePanel,
  () => {
    nextTick(() => {
      const nav = navRef.value
      if (!nav) return
      nav.querySelector('[aria-selected="true"]')?.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' })
    })
  }
)

const navClass = computed(() => {
  const cfg = layoutConfig.value
  const vertical = cfg.rail === 'vertical'
  return [
    cfg.navOrder,
    'z-20 shrink-0 gap-0.5 md:gap-1 px-1 py-1.5 border-b border-ink-200 bg-ink-50/95 backdrop-blur-sm md:bg-ink-50 shadow-sm md:shadow-none',
    vertical
      ? 'flex md:flex-col md:items-center md:py-3 md:w-[3.75rem] md:border-b-0 md:border-r md:static md:self-start md:h-full md:max-h-full'
      : 'flex sticky top-0',
    cfg.tabScroll
      ? 'overflow-x-auto md:overflow-visible [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden'
      : '',
    cfg.mobileChrome && mobileCollapsed.value ? 'max-md:hidden' : ''
  ]
})

const asideClass = computed(() => {
  const cfg = layoutConfig.value
  return [
    cfg.asideOrder,
    'flex flex-col flex-1 min-h-0 md:flex-none shrink-0 border-b md:border-b-0 md:border-r border-ink-200 bg-white md:max-h-full',
    cfg.flyoutClass,
    cfg.mobileChrome && mobileCollapsed.value ? 'max-md:hidden' : ''
  ]
})

const collapsedClass = computed(() => [
  layoutConfig.value.collapsedOrder,
  layoutConfig.value.mobileChrome ? 'md:hidden' : 'hidden'
])
</script>

<template>
  <div class="contents">
    <div
      v-if="layoutConfig.mobileChrome && mobileCollapsed"
      :class="collapsedClass"
      class="shrink-0 flex items-center gap-2 px-2 py-2 border-b border-ink-200 bg-ink-50/95 backdrop-blur-sm shadow-sm"
    >
      <button
        type="button"
        class="shrink-0 rounded-lg p-1.5 text-ink-500 hover:bg-white hover:text-ink-800"
        aria-label="Buka panel pengaturan"
        @click="toggleMobileCollapsed"
      >
        <ChevronDownIcon class="h-5 w-5" />
      </button>
      <component
        :is="activePanelMeta?.icon"
        v-if="activePanelMeta?.icon"
        class="h-5 w-5 shrink-0 text-accent-600"
      />
      <span class="min-w-0 flex-1 truncate text-xs font-semibold text-ink-800">
        {{ activePanelMeta?.label || 'Panel' }}
      </span>
      <button
        type="button"
        class="btn-primary shrink-0 text-xs py-1 px-2"
        :disabled="generating"
        @click="onGenerate"
      >
        <ArrowPathIcon class="w-3.5 h-3.5" :class="generating ? 'animate-spin' : ''" />
        Generate
      </button>
    </div>

    <nav
      ref="navRef"
      :class="navClass"
      aria-label="Panel alat"
      role="tablist"
    >
      <button
        v-for="panel in panels"
        :key="panel.id"
        type="button"
        role="tab"
        :aria-selected="activePanel === panel.id"
        :disabled="panel.needsResult && !result"
        class="flex items-center justify-center gap-0.5 shrink-0 min-w-[3.75rem] md:min-w-0 md:w-full px-2 py-2 md:px-2 md:py-2.5 rounded-lg text-[10px] font-medium transition-colors disabled:opacity-35 disabled:cursor-not-allowed"
        :class="[
          layoutConfig.rail === 'vertical' ? 'md:flex-col' : 'flex-col',
          activePanel === panel.id
            ? 'bg-white text-accent-700 shadow-sm ring-1 ring-ink-200'
            : 'text-ink-500 hover:bg-white/70 hover:text-ink-700 disabled:hover:bg-transparent disabled:hover:text-ink-500'
        ]"
        @click="selectPanel(panel.id)"
      >
        <component :is="panel.icon" class="w-5 h-5 shrink-0" />
        <span class="leading-none whitespace-nowrap">{{ panel.label }}</span>
      </button>
      <div class="hidden md:block flex-1" />
      <button
        type="button"
        class="hidden md:flex flex-col items-center justify-center gap-0.5 w-full px-2 py-2.5 rounded-lg text-[10px] font-medium text-white bg-accent-500 hover:bg-accent-600 disabled:opacity-60"
        :disabled="generating"
        @click="onGenerate"
      >
        <ArrowPathIcon class="w-5 h-5" :class="generating ? 'animate-spin' : ''" />
        <span>{{ generating ? '…' : 'Generate' }}</span>
      </button>
    </nav>

    <aside :class="asideClass">
      <header class="shrink-0 z-10 flex items-center justify-between gap-2 px-3 py-2.5 border-b border-ink-100 bg-white/95 backdrop-blur-sm">
        <h2 class="text-xs font-semibold text-ink-800">{{ activePanelMeta?.label }}</h2>
        <div class="flex items-center gap-1.5 shrink-0">
          <button
            v-if="layoutConfig.mobileChrome"
            type="button"
            class="md:hidden rounded-lg p-1.5 text-ink-500 hover:bg-ink-100 hover:text-ink-800"
            aria-label="Minimize panel pengaturan"
            @click="toggleMobileCollapsed"
          >
            <ChevronUpIcon class="h-4 w-4" />
          </button>
          <button
            type="button"
            class="md:hidden btn-primary text-xs py-1 px-2"
            :disabled="generating"
            @click="onGenerate"
          >
            <ArrowPathIcon class="w-3.5 h-3.5" :class="generating ? 'animate-spin' : ''" />
            Generate
          </button>
        </div>
      </header>

      <div class="flex-1 min-h-0 overflow-y-auto overscroll-y-contain">
        <div class="p-4 space-y-4">
          <slot />
        </div>
      </div>
    </aside>
  </div>
</template>
