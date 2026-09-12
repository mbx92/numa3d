<script setup>
import {
  SparklesIcon,
  ArrowRightIcon,
  ArrowTopRightOnSquareIcon,
  ArrowDownTrayIcon,
  CursorArrowRaysIcon,
  LightBulbIcon,
  CodeBracketIcon,
  CubeTransparentIcon,
  PhotoIcon,
  QrCodeIcon
} from '@heroicons/vue/24/outline'

definePageMeta({
  layout: 'tool',
  toolTitle: 'Tools'
})

const tools = [
  {
    to: '/tools/qr-plate',
    title: 'QR Plate Generator',
    description: 'Pelat QR berbingkai: satu QR, atau Wi-Fi plus WhatsApp dari foto JPEG. Ekspor 3MF, STL, GLB, dan OpenSCAD.',
    icon: markRaw(QrCodeIcon),
    tags: ['QR', '3MF', 'STL', 'SCAD']
  },
  {
    to: '/tools/code-studio',
    title: 'Code Studio',
    description: 'Kode parametrik menjadi solid 3D: bentuk dasar, operasi potong, preview, dan ekspor STL/3MF/GLB.',
    icon: markRaw(CodeBracketIcon),
    tags: ['Code → 3D', 'Parametrik', 'Manifold'],
    beta: true
  },
  {
    to: '/tools/keychain',
    title: 'Keychain Generator',
    description: 'Buat keychain 2-part (base + teks insert) dengan theme, warna, dan export 3MF/STL.',
    icon: markRaw(SparklesIcon),
    tags: ['3MF', 'STL', 'Multi-color']
  },
  {
    to: '/tools/clicker',
    title: 'Clicker Generator',
    description: 'Base + lid clicker MX — desain dari teks/SVG, preview/print mode, export 3MF/STL.',
    icon: markRaw(CursorArrowRaysIcon),
    tags: ['Switch', '3MF', 'STL']
  },
  {
    to: '/tools/mesh-clicker',
    title: 'Mesh → Clicker',
    description: 'Ubah model .3mf/.stl dari Galeri jadi clicker: potong atas/bawah → lid/base + socket MX.',
    icon: markRaw(CubeTransparentIcon),
    tags: ['Galeri', '3MF', 'STL', 'Switch'],
    beta: true
  },
  {
    to: '/tools/lightbox',
    title: 'Lightbox Generator',
    description: 'Lightbox LED dari gambar/teks/SVG — multi-layer warna, cavity LED, export 3MF.',
    icon: markRaw(LightBulbIcon),
    tags: ['LED', '3MF', 'AMS']
  },
  {
    to: '/tools/font-downloader',
    title: 'Font Downloader',
    description: 'Cari Google Fonts, unduh file TTF, atau simpan ke server untuk keychain dan tools lain.',
    icon: markRaw(ArrowDownTrayIcon),
    tags: ['Google Fonts', 'TTF', 'Keychain']
  },
  {
    to: '/tools/png-to-svg',
    title: 'PNG → SVG',
    description: 'Ubah logo PNG/JPG jadi path vektor — unduh SVG lalu unggah ke Keychain, Clicker, atau Lightbox.',
    icon: markRaw(PhotoIcon),
    tags: ['Vektor', 'SVG', 'Logo']
  }
]

const { openToolInNewTab, toolLinkAttrs } = useStandaloneDisplay()
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
        v-bind="toolLinkAttrs"
        class="panel p-4 flex flex-col gap-3 transition-colors hover:border-accent-300 hover:bg-accent-50/40 group"
      >
        <div class="flex items-start gap-3">
          <div
            class="w-10 h-10 shrink-0 rounded-panel bg-accent-500/10 text-accent-600 flex items-center justify-center"
          >
            <component :is="tool.icon" class="w-5 h-5" />
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2 flex-wrap">
              <h2 class="font-semibold text-ink-900 group-hover:text-accent-700">{{ tool.title }}</h2>
              <span
                v-if="tool.beta"
                class="badge text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-800 ring-1 ring-amber-200/80"
              >
                Beta
              </span>
            </div>
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
            <ArrowTopRightOnSquareIcon v-if="openToolInNewTab" class="w-3.5 h-3.5" />
            <ArrowRightIcon v-else class="w-3.5 h-3.5" />
          </span>
        </div>
      </NuxtLink>
    </div>
  </div>
</template>
