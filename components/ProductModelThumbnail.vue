<script setup>
import * as THREE from 'three'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { ThreeMFLoader } from 'three/examples/jsm/loaders/3MFLoader.js'
import { CubeTransparentIcon } from '@heroicons/vue/24/outline'

const props = defineProps({
  src: { type: String, required: true },
  filename: { type: String, required: true },
  fallbackSrc: { type: String, default: '' }
})

const root = ref(null)
const thumbnail = ref('')
const loading = ref(true)
const failed = ref(false)
let observer
let controller
let started = false

function disposeObject(object) {
  object?.traverse((child) => {
    child.geometry?.dispose()
    const materials = Array.isArray(child.material) ? child.material : [child.material]
    materials.filter(Boolean).forEach((material) => material.dispose())
  })
}

function modelFrom(bytes, extension) {
  if (extension === 'stl') {
    const geometry = new STLLoader().parse(bytes)
    geometry.computeVertexNormals()
    return new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.62, metalness: 0.04 }))
  }
  if (extension === '3mf') return new ThreeMFLoader().parse(bytes)
  throw new Error('Format preview tidak didukung')
}

async function renderThumbnail() {
  if (started) return
  started = true
  controller = new AbortController()
  let renderer
  let model
  try {
    const response = await fetch(props.src, { signal: controller.signal })
    if (!response.ok) throw new Error('Model tidak dapat dimuat')
    const bytes = await response.arrayBuffer()
    const extension = String(props.filename).split('.').pop()?.toLowerCase()
    model = modelFrom(bytes, extension)

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0xf4f4f5)
    const oriented = new THREE.Group()
    oriented.rotation.x = -Math.PI / 2
    oriented.add(model)
    scene.add(oriented)

    oriented.updateMatrixWorld(true)
    let box = new THREE.Box3().setFromObject(oriented)
    const center = box.getCenter(new THREE.Vector3())
    oriented.position.sub(center)
    oriented.updateMatrixWorld(true)
    box = new THREE.Box3().setFromObject(oriented)
    const size = box.getSize(new THREE.Vector3())
    const maxDimension = Math.max(size.x, size.y, size.z, 1)

    const camera = new THREE.PerspectiveCamera(36, 4 / 3, maxDimension / 100, maxDimension * 100)
    const distance = maxDimension * 2.15
    camera.position.set(distance, distance * 0.72, distance)
    camera.lookAt(0, 0, 0)
    scene.add(new THREE.HemisphereLight(0xffffff, 0x64748b, 1.65))
    const light = new THREE.DirectionalLight(0xffffff, 1.8)
    light.position.set(distance, distance * 1.2, distance * 0.5)
    scene.add(light)

    renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
    renderer.setPixelRatio(1)
    renderer.setSize(320, 240, false)
    renderer.render(scene, camera)
    thumbnail.value = renderer.domElement.toDataURL('image/png')
  } catch (error) {
    if (error?.name !== 'AbortError') failed.value = true
  } finally {
    loading.value = false
    disposeObject(model)
    renderer?.dispose()
    renderer?.forceContextLoss()
  }
}

onMounted(() => {
  if (!('IntersectionObserver' in window)) {
    renderThumbnail()
    return
  }
  observer = new IntersectionObserver((entries) => {
    if (!entries.some((entry) => entry.isIntersecting)) return
    observer.disconnect()
    renderThumbnail()
  }, { rootMargin: '160px' })
  observer.observe(root.value)
})

onUnmounted(() => {
  observer?.disconnect()
  controller?.abort()
})
</script>

<template>
  <div ref="root" class="relative h-full w-full overflow-hidden bg-ink-50">
    <img v-if="thumbnail" :src="thumbnail" :alt="`Preview 3D ${filename}`" class="h-full w-full object-cover" />
    <img v-else-if="failed && fallbackSrc" :src="fallbackSrc" alt="" class="h-full w-full object-cover" />
    <div v-else class="flex h-full w-full items-center justify-center text-ink-300">
      <span v-if="loading" class="h-5 w-5 animate-spin rounded-full border-2 border-ink-200 border-t-accent-500" />
      <CubeTransparentIcon v-else class="h-10 w-10" />
    </div>
    <span v-if="thumbnail" class="absolute bottom-1.5 right-1.5 rounded bg-ink-900/70 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white">3D</span>
  </div>
</template>
