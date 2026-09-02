<script setup>
// Preview keychain — centering benar, cavity terlihat (rim berlubang + lantai gelap).
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

const props = defineProps({
  parts: { type: Array, required: true }, // [{ geometry, color, line?, role? }]
  showGrid: { type: Boolean, default: false },
  simulateClick: { type: Boolean, default: false },
  interactiveClick: { type: Boolean, default: false },
  clickRole: { type: String, default: 'lid' },
  clickTravelMm: { type: Number, default: 4 }
})

const container = ref(null)
const loading = ref(true)
const error = ref('')

let renderer, scene, camera, orbit, resizeObserver, intersectionObserver, rootGroup, clickGroup, gridHelper, animId
let visible = true
let manualPressed = false
let manualPress = 0

function shouldAnimateClick() {
  return props.simulateClick || manualPressed || manualPress > 0.001
}

function clickOffsetAt(time = performance.now()) {
  const travel = Math.max(0, Number(props.clickTravelMm) || 0)
  if (travel <= 0) return 0
  const cycle = props.simulateClick ? (time % 820) / 820 : 0
  const autoPress = props.simulateClick
    ? cycle < 0.42
      ? cycle / 0.42
      : Math.max(0, 1 - (cycle - 0.42) / 0.58)
    : 0
  const target = manualPressed ? 1 : 0
  manualPress += (target - manualPress) * 0.32
  if (Math.abs(target - manualPress) < 0.001) manualPress = target
  const press = Math.max(autoPress, manualPress)
  const eased = press * press * (3 - 2 * press)
  return -travel * eased
}

function updateClickMotion(time) {
  if (!clickGroup) return
  clickGroup.position.z = clickOffsetAt(time)
  clickGroup.updateMatrixWorld(true)
}

function render(time) {
  if (!renderer || !scene || !camera || !visible) return
  updateClickMotion(typeof time === 'number' ? time : performance.now())
  renderer.render(scene, camera)
}

function startAnimation() {
  if (animId || !shouldAnimateClick()) return
  const tick = (time) => {
    render(time)
    if (shouldAnimateClick()) {
      animId = requestAnimationFrame(tick)
    } else {
      animId = null
    }
  }
  animId = requestAnimationFrame(tick)
}

function stopAnimation() {
  if (animId) cancelAnimationFrame(animId)
  animId = null
  if (clickGroup) {
    clickGroup.position.z = 0
    clickGroup.updateMatrixWorld(true)
  }
  render()
}

function setManualPressed(value) {
  if (!props.interactiveClick || !clickGroup) return
  manualPressed = value
  startAnimation()
  render()
}

function onCanvasPointerDown(event) {
  if (!props.interactiveClick) return
  event.currentTarget?.setPointerCapture?.(event.pointerId)
  setManualPressed(true)
}

function onCanvasPointerUp(event) {
  if (!props.interactiveClick) return
  event.currentTarget?.releasePointerCapture?.(event.pointerId)
  setManualPressed(false)
}

function onCanvasPointerLeave() {
  if (!props.interactiveClick) return
  setManualPressed(false)
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
    o.geometry?.dispose()
    o.material?.dispose()
  })
  rootGroup = null
  clickGroup = null
  manualPressed = false
}

function setGridMaterial(grid) {
  const mats = Array.isArray(grid.material) ? grid.material : [grid.material]
  for (const m of mats) {
    m.opacity = 0.65
    m.transparent = true
  }
}

function disposeGrid(grid) {
  if (!grid) return
  grid.geometry?.dispose()
  const mats = Array.isArray(grid.material) ? grid.material : [grid.material]
  for (const m of mats) m?.dispose()
}

function updateGridPosition() {
  if (!gridHelper || !rootGroup) return
  const box = getBox(rootGroup)
  const span = Math.max(box.max.x - box.min.x, box.max.z - box.min.z, 40)
  const size = Math.ceil(span * 2.4 / 10) * 10
  if (gridHelper.userData.size !== size) {
    scene.remove(gridHelper)
    disposeGrid(gridHelper)
    gridHelper = new THREE.GridHelper(size, Math.min(40, Math.max(10, Math.round(size / 5))), 0xb8bec8, 0xd5dae2)
    setGridMaterial(gridHelper)
    gridHelper.userData.size = size
    scene.add(gridHelper)
  }
  gridHelper.position.set(0, box.min.y - 0.4, 0)
}

function mountParts() {
  clearScene()
  rootGroup = new THREE.Group()
  const staticGroup = new THREE.Group()
  clickGroup = new THREE.Group()
  rootGroup.add(staticGroup, clickGroup)
  let added = 0

  for (let i = 0; i < (props.parts || []).length; i++) {
    const part = props.parts[i]
    if (!part?.geometry?.attributes?.position?.count) continue
    const geo = part.geometry.clone()
    const parent = part.role === props.clickRole ? clickGroup : staticGroup
    if (part.line) {
      const mat = new THREE.LineBasicMaterial({ color: part.color || '#1f2937' })
      const line = new THREE.LineSegments(geo, mat)
      line.renderOrder = i + 1
      parent.add(line)
      added += 1
      continue
    }
    const mat = new THREE.MeshLambertMaterial({
      color: part.color || '#f97316',
      side: THREE.FrontSide
    })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.renderOrder = i + 1
    parent.add(mesh)
    added += 1
  }

  if (!added) throw new Error('Preview kosong')

  centerAtOrigin(rootGroup)
  scene.add(rootGroup)

  const box = getBox(rootGroup)
  if (props.showGrid) updateGridPosition()
  fitCameraToBox(box)
  updateClickMotion()
  if (props.simulateClick) startAnimation()
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
    if (!props.parts?.length) {
      clearScene()
      render()
      return
    }
    try {
      mountParts()
      error.value = ''
    } catch (e) {
      error.value = e?.message || 'Gagal memuat preview'
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
      canvas.style.cursor = props.interactiveClick ? 'pointer' : 'grab'
      el.appendChild(canvas)
      canvas.addEventListener('pointerdown', onCanvasPointerDown)
      canvas.addEventListener('pointerup', onCanvasPointerUp)
      canvas.addEventListener('pointercancel', onCanvasPointerUp)
      canvas.addEventListener('pointerleave', onCanvasPointerLeave)

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

      if (props.showGrid) {
        gridHelper = new THREE.GridHelper(80, 16, 0xb8bec8, 0xd5dae2)
        setGridMaterial(gridHelper)
        gridHelper.userData = { size: 80 }
        scene.add(gridHelper)
      }

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

watch(
  () => [props.simulateClick, props.interactiveClick, props.clickTravelMm, props.clickRole, props.showGrid],
  () => {
    if (!renderer) return
    if (!props.interactiveClick) manualPressed = false
    renderer.domElement.style.cursor = props.interactiveClick ? 'pointer' : 'grab'
    if (gridHelper) gridHelper.visible = props.showGrid
    if (shouldAnimateClick()) startAnimation()
    else stopAnimation()
    render()
  }
)

onMounted(init)

onUnmounted(() => {
  intersectionObserver?.disconnect()
  resizeObserver?.disconnect()
  stopAnimation()
  renderer?.domElement?.removeEventListener('pointerdown', onCanvasPointerDown)
  renderer?.domElement?.removeEventListener('pointerup', onCanvasPointerUp)
  renderer?.domElement?.removeEventListener('pointercancel', onCanvasPointerUp)
  renderer?.domElement?.removeEventListener('pointerleave', onCanvasPointerLeave)
  clearScene()
  orbit?.dispose()
  if (gridHelper) {
    scene?.remove(gridHelper)
    disposeGrid(gridHelper)
    gridHelper = null
  }
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
