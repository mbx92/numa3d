<script setup>
import { ArrowTopRightOnSquareIcon } from '@heroicons/vue/24/outline'
import { navSections, isNavActive } from '~/utils/nav.js'

defineProps({
  compact: { type: Boolean, default: false }
})

const route = useRoute()
const { openToolInNewTab, toolLinkAttrs } = useStandaloneDisplay()
</script>

<template>
  <template v-for="(section, si) in navSections" :key="section.label || `section-${si}`">
    <p
      v-if="section.label"
      class="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-ink-500 select-none"
      :class="si > 0 ? 'mt-1 border-t border-ink-800/80' : ''"
    >
      {{ section.label }}
    </p>
    <NuxtLink
      v-for="item in section.items"
      :key="item.to"
      :to="item.to"
      v-bind="item.newTab ? toolLinkAttrs : {}"
      class="flex items-center gap-2.5 px-4 py-2.5 text-sm border-l-2 border-transparent text-ink-300 hover:text-white hover:bg-ink-800 transition-colors"
      :class="[
        compact ? 'py-3' : '',
        isNavActive(route.path, item.to) ? '!border-accent-500 !text-white bg-ink-800' : ''
      ]"
    >
      <component :is="item.icon" class="w-5 h-5 shrink-0" />
      <span class="truncate">{{ item.label }}</span>
      <ArrowTopRightOnSquareIcon
        v-if="item.newTab && openToolInNewTab"
        class="w-3.5 h-3.5 ml-auto shrink-0 opacity-50"
      />
    </NuxtLink>
  </template>
</template>
