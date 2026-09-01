<script setup>
definePageMeta({
  layout: 'tool',
  toolTitle: 'Tools'
})

import { SparklesIcon, ArrowRightIcon } from '@heroicons/vue/24/outline'

const tools = [
  {
    to: '/tools/keychain',
    title: 'Keychain Generator',
    description: 'Buat keychain 2-part (base + teks insert) dengan theme, warna, dan export 3MF/STL.',
    icon: SparklesIcon,
    tags: ['3MF', 'STL', 'Multi-color']
  }
]
</script>

<template>
  <div class="max-w-4xl mx-auto space-y-4">
    <div>
      <h1 class="text-xl font-bold">Tools</h1>
      <p class="text-sm text-ink-500 mt-1">Utilitas desain &amp; generate model 3D untuk produksi.</p>
    </div>

    <div class="grid sm:grid-cols-2 gap-3">
      <NuxtLink
        v-for="tool in tools"
        :key="tool.to"
        :to="tool.to"
        class="panel p-4 flex flex-col gap-3 transition-colors hover:border-accent-300 hover:bg-accent-50/40 group"
      >
        <div class="flex items-start gap-3">
          <div
            class="w-10 h-10 shrink-0 rounded-panel bg-accent-500/10 text-accent-600 flex items-center justify-center"
          >
            <component :is="tool.icon" class="w-5 h-5" />
          </div>
          <div class="min-w-0 flex-1">
            <h2 class="font-semibold text-ink-900 group-hover:text-accent-700">{{ tool.title }}</h2>
            <p class="text-sm text-ink-500 mt-1 leading-relaxed">{{ tool.description }}</p>
          </div>
        </div>
        <div class="flex items-center justify-between gap-2 mt-auto pt-1">
          <div class="flex flex-wrap gap-1.5">
            <span
              v-for="tag in tool.tags"
              :key="tag"
              class="badge text-[10px] bg-ink-100 text-ink-600"
            >
              {{ tag }}
            </span>
          </div>
          <span class="inline-flex items-center gap-1 text-xs font-medium text-accent-600">
            Buka
            <ArrowRightIcon class="w-3.5 h-3.5" />
          </span>
        </div>
      </NuxtLink>
    </div>
  </div>
</template>
