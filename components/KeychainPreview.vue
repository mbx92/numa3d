<script setup>
// Preview keychain — centering benar, cavity terlihat (rim berlubang + lantai gelap).
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

const props = defineProps({
  parts: { type: Array, required: true } // [{ geometry, color, line? }]
})

const container = ref(null)
const loading = ref(true)
const error = ref('')

let renderer, scene, camera, orbit, resizeObserver, intersectionObserver, rootGroup
let visible = true

function render() {
  if (!renderer || !scene || !camera || !visible) return
  renderer.render(scene, camera)
}

function getBox(object) {
  object.updateMatrixWorld(true)
  return new THREE.Box3().setFromObject(object)
}

function centerAtOrigin(group) {
  const box = getBox(group)
  const center = box.getCenter(new THREE.Vector3())
  group.position.sub(center)
  group.updateMatrixWorld(true)
}

function fitCameraToBox(box) {
  const el = container.value
  if (!el || !camera || !orbit) return

  const size = box.getSize(new THREE.Vector3())
  const maxDim = Math.max(size.x, size.y, size.z, 0.001)
  const aspect = Math.max(el.clientWidth, 1) / Math.max(el.clientHeight, 1)
  const fovRad = (camera.fov * Math.PI) / 180
  const fitH = maxDim / (2 * Math.tan(fovRad / 2))
  const fitW = fitH / aspect
  const distance = Math.max(fitH, fitW) * 1.35

  camera.position.set(distance * 0.72, distance * 0.58, distance * 0.95)
  camera.near = Math.max(distance / 300, 0.01)
  camera.far = distance * 300
  camera.updateProjectionMatrix()

  orbit.target.set(0, 0, 0)
  orbit.update()
}

function clearScene() {
  if (!rootGroup) return
  scene.remove(rootGroup)
  rootGroup.traverse((o) => {
    o.material?.dispose()
  })
  rootGroup = null
}

function mountParts() {
  clearScene()
  rootGroup = new THREE.Group()

  for (let i = 0; i < (props.parts || []).length; i++) {
    const part = props.parts[i]
    if (!part?.geometry?.attributes?.position?.count) continue
    if (part.line) {
      const mat = new THREE.LineBasicMaterial({ color: part.color || '#1f2937' })
      const line = new THREE.LineSegments(part.geometry, mat)
      line.renderOrder = i + 1
      rootGroup.add(line)
      continue
    }
    const mat = new THREE.MeshLambertMaterial({
      color: part.color || '#f97316',
      side: THREE.FrontSide
    })
    const mesh = new THREE.Mesh(part.geometry, mat)
    mesh.renderOrder = i + 1
    rootGroup.add(mesh)
  }

  if (!rootGroup.children.length) throw new Error('Preview kosong')

  centerAtOrigin(rootGroup)
  scene.add(rootGroup)

  const box = getBox(rootGroup)
  fitCameraToBox(box)
  render()
}

function resize() {
  const el = container.value
  if (!el || !renderer || !camera) return
  const w = Math.max(el.clientWidth, 1)
  const h = Math.max(el.clientHeight, 1)
  camera.aspect = w / h
  camera.updateProjectionMatrix()
  renderer.setSize(w, h, false)
  if (rootGroup) {
    const box = getBox(rootGroup)
    fitCameraToBox(box)
  }
  render()
}

function scheduleMount() {
  requestAnimationFrame(() => {
    resize()
    if (props.parts?.length) {
      try {
        mountParts()
      } catch (e) {
        error.value = e?.message || 'Gagal memuat preview'
      }
    }
  })
}

async function init() {
  const el = container.value
  if (!el) return
  loading.value = true
  error.value = ''
  try {
    if (!renderer) {
      scene = new THREE.Scene()
      scene.background = new THREE.Color(0xe8eaed)

      camera = new THREE.PerspectiveCamera(38, 1, 0.01, 5000)

      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance'
      })
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))
      const canvas = renderer.domElement
      canvas.style.display = 'block'
      canvas.style.width = '100%'
      canvas.style.height = '100%'
      el.appendChild(canvas)

      orbit = new OrbitControls(camera, canvas)
      orbit.enableDamping = false
      orbit.addEventListener('change', render)

      scene.add(new THREE.AmbientLight(0xffffff, 0.6))
      const key = new THREE.DirectionalLight(0xffffff, 1.15)
      key.position.set(3, 5, 4)
      scene.add(key)
      const fill = new THREE.DirectionalLight(0xc7d2fe, 0.5)
      fill.position.set(-4, 2, -3)
      scene.add(fill)
      const rim = new THREE.DirectionalLight(0xffffff, 0.35)
      rim.position.set(0, -2, 2)
      scene.add(rim)

      resizeObserver = new ResizeObserver(() => scheduleMount())
      resizeObserver.observe(el)

      intersectionObserver = new IntersectionObserver(
        (entries) => {
          visible = entries[0]?.isIntersecting ?? true
          if (visible) render()
        },
        { threshold: 0.05 }
      )
      intersectionObserver.observe(el)
    }
    await nextTick()
    scheduleMount()
  } catch (e) {
    error.value = e?.message || 'Gagal memuat preview'
  } finally {
    loading.value = false
  }
}

watch(
  () => props.parts,
  () => {
    if (!renderer) return
    scheduleMount()
  },
  { deep: true }
)

onMounted(init)

onUnmounted(() => {
  intersectionObserver?.disconnect()
  resizeObserver?.disconnect()
  clearScene()
  orbit?.dispose()
  renderer?.dispose()
  renderer?.domElement?.remove()
})
</script>

<template>
  <div class="relative w-full h-full min-h-0 bg-ink-50 overflow-hidden">
    <div ref="container" class="absolute inset-0" />
    <div v-if="loading" class="absolute inset-0 flex items-center justify-center text-sm text-ink-500">Memuat…</div>
    <div v-if="error" class="absolute inset-0 flex items-center justify-center text-sm text-red-600 p-3 text-center">{{ error }}</div>
  </div>
</template>
