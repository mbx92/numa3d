<script setup>
// Preview file 3D (STL/OBJ/3MF/GLB/GLTF) dengan Three.js + OrbitControls.
// Hanya jalan di client — pakai <ClientOnly> di pemanggil.
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { ThreeMFLoader } from 'three/examples/jsm/loaders/3MFLoader.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

const props = defineProps({
  src: { type: String, required: true },
  filename: { type: String, required: true }
})

const container = ref(null)
const loading = ref(true)
const error = ref('')

let renderer, scene, camera, controls, animId, resizeObserver

function buildObject(ext, loader, data) {
  if (ext === 'stl') {
    const geometry = loader.parse(data)
    geometry.computeVertexNormals()
    return new THREE.Mesh(
      geometry,
      // DoubleSide: banyak STL hasil ekspor punya winding normal tidak
      // konsisten — tanpa ini sebagian permukaan tampak bolong.
      new THREE.MeshStandardMaterial({
        color: 0xf97316,
        roughness: 0.55,
        metalness: 0.1,
        side: THREE.DoubleSide
      })
    )
  }
  if (ext === 'obj') return loader.parse(new TextDecoder().decode(data))
  if (ext === '3mf') return loader.parse(data)
  return null // gltf/glb ditangani async di loadModel
}

async function loadModel() {
  const ext = (props.filename.split('.').pop() || '').toLowerCase()
  const res = await fetch(props.src)
  if (!res.ok) throw new Error('Gagal mengunduh file dari server')
  const data = await res.arrayBuffer()

  if (ext === 'glb' || ext === 'gltf') {
    const gltf = await new GLTFLoader().parseAsync(data, '')
    return gltf.scene
  }
  const loaders = { stl: new STLLoader(), obj: new OBJLoader(), '3mf': new ThreeMFLoader() }
  const loader = loaders[ext]
  if (!loader) throw new Error(`Format .${ext} tidak didukung untuk preview`)
  return buildObject(ext, loader, data)
}

function fitCameraTo(object) {
  const box = new THREE.Box3().setFromObject(object)
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  // Geser model ke tengah, alas menempel grid (y = 0)
  object.position.sub(center)
  object.position.y += size.y / 2

  const maxDim = Math.max(size.x, size.y, size.z) || 1
  const dist = maxDim * 1.8
  camera.position.set(dist, dist * 0.8, dist)
  camera.near = maxDim / 100
  camera.far = maxDim * 100
  camera.updateProjectionMatrix()
  controls.target.set(0, size.y / 2, 0)
  controls.update()

  const grid = new THREE.GridHelper(maxDim * 3, 30, 0x999999, 0xdddddd)
  scene.add(grid)
}

onMounted(async () => {
  const el = container.value
  scene = new THREE.Scene()
  scene.background = new THREE.Color(0xf4f4f5)
  camera = new THREE.PerspectiveCamera(45, el.clientWidth / el.clientHeight, 0.1, 1000)

  try {
    renderer = new THREE.WebGLRenderer({ antialias: true })
  } catch {
    // WebGL tidak tersedia (mis. hardware acceleration mati) — jangan
    // biarkan error ini menumbangkan seluruh halaman detail produk.
    loading.value = false
    error.value = 'Browser tidak mendukung WebGL — preview 3D tidak tersedia.'
    return
  }
  renderer.setPixelRatio(window.devicePixelRatio)
  renderer.setSize(el.clientWidth, el.clientHeight)
  el.appendChild(renderer.domElement)

  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true

  scene.add(new THREE.HemisphereLight(0xffffff, 0x666666, 1.2))
  const dir = new THREE.DirectionalLight(0xffffff, 1.5)
  dir.position.set(1, 2, 1.5)
  scene.add(dir)

  try {
    const object = await loadModel()
    scene.add(object)
    fitCameraTo(object)
  } catch (e) {
    error.value = e.message || 'Gagal memuat model'
  } finally {
    loading.value = false
  }

  const animate = () => {
    animId = requestAnimationFrame(animate)
    controls.update()
    renderer.render(scene, camera)
  }
  animate()

  resizeObserver = new ResizeObserver(() => {
    if (!el.clientWidth || !el.clientHeight) return
    camera.aspect = el.clientWidth / el.clientHeight
    camera.updateProjectionMatrix()
    renderer.setSize(el.clientWidth, el.clientHeight)
  })
  resizeObserver.observe(el)
})

onUnmounted(() => {
  cancelAnimationFrame(animId)
  resizeObserver?.disconnect()
  controls?.dispose()
  renderer?.dispose()
  scene?.traverse((obj) => {
    obj.geometry?.dispose()
    if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose())
    else obj.material?.dispose()
  })
})
</script>

<template>
  <div class="relative w-full h-full min-h-[320px]">
    <div ref="container" class="absolute inset-0"></div>
    <div v-if="loading" class="absolute inset-0 flex items-center justify-center text-sm text-ink-500 bg-ink-50">
      Memuat model…
    </div>
    <div v-if="error" class="absolute inset-0 flex items-center justify-center text-sm text-red-600 bg-ink-50 p-4 text-center">
      {{ error }}
    </div>
    <div v-if="!loading && !error" class="absolute bottom-2 left-2 text-xs text-ink-400 bg-white/70 rounded px-2 py-0.5">
      Drag: putar · Scroll: zoom · Klik kanan: geser
    </div>
  </div>
</template>
