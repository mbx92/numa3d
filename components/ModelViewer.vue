<script setup>
// Preview + editor print-prep (STL/OBJ/3MF/GLB/GLTF). Hanya di client — bungkus <ClientOnly>.
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { ThreeMFLoader } from 'three/examples/jsm/loaders/3MFLoader.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js'
import {
  ArrowsPointingOutIcon,
  ArrowsPointingInIcon,
  ArrowDownTrayIcon,
  Square2StackIcon,
  ArrowPathIcon,
  ArrowUturnLeftIcon,
  ArrowUturnRightIcon
} from '@heroicons/vue/24/outline'

const props = defineProps({
  src: { type: String, required: true },
  filename: { type: String, required: true },
  compact: { type: Boolean, default: false },
  defaultColor: { type: String, default: '' }
})

const container = ref(null)
const loading = ref(true)
const error = ref('')
const expanded = ref(false)
const mode = ref('orbit')
const snap = ref(true)
const color = ref('#f97316')
const selectedId = ref('all')
const parts = ref([])
const dims = ref({ x: 0, y: 0, z: 0 })
const canUndo = ref(false)
const canRedo = ref(false)
const editorOpen = computed(() => !props.compact || expanded.value)

let renderer, scene, camera, orbit, transform, animId, resizeObserver
let rootGroup, boxHelper, pointerStart, xformBefore
const history = []
let historyIndex = -1
const HISTORY_MAX = 80

const DEFAULT_MAT = {
  color: 0xf97316,
  roughness: 0.55,
  metalness: 0.1,
  side: THREE.DoubleSide
}

function buildObject(ext, loader, data) {
  const mat = { ...DEFAULT_MAT }
  if (props.defaultColor) mat.color = new THREE.Color(props.defaultColor)
  if (ext === 'stl') {
    const geometry = loader.parse(data)
    geometry.computeVertexNormals()
    return new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ ...mat }))
  }
  if (ext === 'obj') return loader.parse(new TextDecoder().decode(data))
  if (ext === '3mf') return loader.parse(data)
  return null
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

function collectMeshes(root) {
  const list = []
  root?.traverse((o) => {
    if (o.isMesh) list.push(o)
  })
  return list
}

function cloneMats(mat) {
  if (!mat) return new THREE.MeshStandardMaterial({ ...DEFAULT_MAT })
  if (Array.isArray(mat)) return mat.map((m) => m.clone())
  return mat.clone()
}

function firstColor(obj) {
  const mesh = collectMeshes(obj)[0]
  const mat = Array.isArray(mesh?.material) ? mesh.material[0] : mesh?.material
  if (mat?.color) return `#${mat.color.getHexString()}`
  return '#f97316'
}

function findByUuid(uuid) {
  if (!rootGroup || uuid == null) return null
  if (rootGroup.uuid === uuid) return rootGroup
  let found = null
  rootGroup.traverse((o) => {
    if (o.uuid === uuid) found = o
  })
  return found
}

function captureXform(obj) {
  return {
    uuid: obj.uuid,
    pos: obj.position.toArray(),
    quat: obj.quaternion.toArray(),
    scale: obj.scale.toArray()
  }
}

function applyXform(state) {
  const obj = findByUuid(state.uuid)
  if (!obj) return
  obj.position.fromArray(state.pos)
  obj.quaternion.fromArray(state.quat)
  obj.scale.fromArray(state.scale)
  obj.updateMatrixWorld(true)
}

function xformEqual(a, b) {
  if (!a || !b || a.uuid !== b.uuid) return false
  const near = (arr, other) => arr.every((v, i) => Math.abs(v - other[i]) < 1e-7)
  return near(a.pos, b.pos) && near(a.quat, b.quat) && near(a.scale, b.scale)
}

function captureColors(obj) {
  const rows = []
  obj?.traverse((o) => {
    if (!o.isMesh) return
    const mats = Array.isArray(o.material) ? o.material : [o.material]
    rows.push({
      uuid: o.uuid,
      colors: mats.map((m) => (m?.color ? `#${m.color.getHexString()}` : null))
    })
  })
  return rows
}

function applyColors(rows) {
  for (const row of rows || []) {
    const mesh = findByUuid(row.uuid)
    if (!mesh?.isMesh) continue
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    mats.forEach((m, i) => {
      if (m?.color && row.colors[i]) m.color.set(row.colors[i])
    })
  }
}

function colorsEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b)
}

function syncHistoryUi() {
  canUndo.value = historyIndex >= 0
  canRedo.value = historyIndex < history.length - 1
}

function afterHistory() {
  refreshParts()
  const ids = new Set(parts.value.map((p) => p.id))
  if (selectedId.value !== 'all' && !ids.has(selectedId.value)) selectedId.value = 'all'
  attachGizmo()
  updateDims()
  color.value = firstColor(getTarget())
  syncHistoryUi()
}

function pushCommand(cmd) {
  history.splice(historyIndex + 1)
  history.push(cmd)
  if (history.length > HISTORY_MAX) {
    history.shift()
  }
  historyIndex = history.length - 1
  syncHistoryUi()
}

function undo() {
  if (historyIndex < 0) return
  history[historyIndex].undo()
  historyIndex -= 1
  afterHistory()
}

function redo() {
  if (historyIndex >= history.length - 1) return
  historyIndex += 1
  history[historyIndex].redo()
  afterHistory()
}

function getTarget() {
  if (!rootGroup) return null
  if (selectedId.value === 'all') return rootGroup
  return collectMeshes(rootGroup).find((m) => m.uuid === selectedId.value) || rootGroup
}

function partName(m, i) {
  if (m.name && m.name !== 'Mesh') return m.name
  const parentName = m.parent?.name
  if (parentName && parentName !== 'Scene' && parentName !== 'AuxScene') return parentName
  return `Part ${i + 1}`
}

function refreshParts() {
  parts.value = collectMeshes(rootGroup).map((m, i) => ({
    id: m.uuid,
    name: partName(m, i)
  }))
}

function updateDims() {
  const target = getTarget()
  if (!target) return
  const box = new THREE.Box3().setFromObject(target)
  const s = box.getSize(new THREE.Vector3())
  dims.value = { x: s.x, y: s.y, z: s.z }
  if (boxHelper) {
    const show = selectedId.value !== 'all' && target?.isMesh
    boxHelper.visible = !!show
    if (show) boxHelper.setFromObject(target)
  }
}

function formatDim(n) {
  const a = Math.abs(Number(n) || 0)
  if (a >= 100) return formatNumber(n, 0)
  if (a >= 10) return formatNumber(n, 1)
  return formatNumber(n, 2)
}

function applySnap() {
  if (!transform) return
  transform.translationSnap = snap.value ? 1 : null
  transform.rotationSnap = snap.value ? THREE.MathUtils.degToRad(15) : null
  transform.scaleSnap = snap.value ? 0.1 : null
}

function attachGizmo() {
  if (!transform || !rootGroup) return
  const target = getTarget()
  if (!target || mode.value === 'orbit') {
    transform.detach()
    transform.enabled = false
    return
  }
  transform.enabled = true
  transform.setMode(mode.value)
  transform.attach(target)
  applySnap()
}

function select(id) {
  selectedId.value = id
  const target = getTarget()
  color.value = firstColor(target)
  attachGizmo()
  updateDims()
}

function groundAndFrame(object) {
  const box = new THREE.Box3().setFromObject(object)
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  object.position.sub(center)
  object.position.y += size.y / 2
  frameCamera(object)
}

function frameCamera(object) {
  const box = new THREE.Box3().setFromObject(object)
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  const maxDim = Math.max(size.x, size.y, size.z) || 1
  const dist = maxDim * 1.8
  camera.position.set(center.x + dist, center.y + dist * 0.55, center.z + dist)
  camera.near = maxDim / 100
  camera.far = maxDim * 100
  camera.updateProjectionMatrix()
  orbit.target.copy(center)
  orbit.update()
}

function tintObject(obj, hex) {
  obj.traverse((o) => {
    if (!o.isMesh) return
    o.material = cloneMats(o.material)
    const mats = Array.isArray(o.material) ? o.material : [o.material]
    for (const m of mats) {
      if (m.color) m.color.set(hex)
      m.needsUpdate = true
    }
  })
}

let colorBefore = null
function beginColor() {
  colorBefore = captureColors(getTarget())
}
function onColorInput(hex) {
  if (!colorBefore) colorBefore = captureColors(getTarget())
  color.value = hex
  const target = getTarget()
  if (target) tintObject(target, hex)
}
function commitColor() {
  const target = getTarget()
  if (!target || !colorBefore) return
  const after = captureColors(target)
  if (colorsEqual(colorBefore, after)) {
    colorBefore = null
    return
  }
  const before = colorBefore
  colorBefore = null
  pushCommand({
    undo: () => applyColors(before),
    redo: () => applyColors(after)
  })
}

function setMode(next) {
  mode.value = next
  attachGizmo()
}

function mirror(axis) {
  const target = getTarget()
  if (!target) return
  const before = captureXform(target)
  target.scale[axis] *= -1
  target.updateMatrixWorld(true)
  const after = captureXform(target)
  pushCommand({
    undo: () => applyXform(before),
    redo: () => applyXform(after)
  })
  updateDims()
}

function addToParent(parent, obj, index) {
  parent.add(obj)
  const cur = parent.children.indexOf(obj)
  if (cur !== -1 && cur !== index && index != null) {
    parent.children.splice(cur, 1)
    parent.children.splice(Math.min(index, parent.children.length), 0, obj)
  }
}

function duplicateSelected() {
  const target = getTarget()
  if (!target || !rootGroup) return
  const box = new THREE.Box3().setFromObject(target)
  const size = box.getSize(new THREE.Vector3())
  const offset = Math.max(size.x, 1) * 1.15
  const prevSelected = selectedId.value
  const added = []
  if (selectedId.value === 'all') {
    const copies = rootGroup.children.map((child) => {
      const c = child.clone(true)
      c.traverse((o) => {
        if (o.isMesh) o.material = cloneMats(o.material)
      })
      c.position.x += offset
      return c
    })
    for (const c of copies) {
      rootGroup.add(c)
      added.push({ obj: c, parent: rootGroup, index: rootGroup.children.indexOf(c) })
    }
    refreshParts()
    select('all')
  } else {
    const mesh = target
    const clone = mesh.clone(true)
    clone.material = cloneMats(mesh.material)
    clone.position.x += offset
    mesh.parent.add(clone)
    added.push({ obj: clone, parent: mesh.parent, index: mesh.parent.children.indexOf(clone) })
    refreshParts()
    select(clone.uuid)
  }
  const nextSelected = selectedId.value
  pushCommand({
    undo: () => {
      for (const row of added) row.parent.remove(row.obj)
      selectedId.value = prevSelected
    },
    redo: () => {
      for (const row of added) addToParent(row.parent, row.obj, row.index)
      selectedId.value = nextSelected
    }
  })
}

function stlBlob(object) {
  object.updateMatrixWorld(true)
  const exporter = new STLExporter()
  const data = exporter.parse(object, { binary: true })
  if (data instanceof DataView) {
    return new Blob([data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)], { type: 'model/stl' })
  }
  return new Blob([data], { type: 'model/stl' })
}

function downloadStl(scope) {
  if (!rootGroup) return
  const object = scope === 'part' && selectedId.value !== 'all' ? getTarget() : rootGroup
  if (!object) return
  const base = String(props.filename || 'model').replace(/\.[^.]+$/, '')
  const suffix = scope === 'part' && selectedId.value !== 'all' ? '-part' : '-edit'
  const a = document.createElement('a')
  a.href = URL.createObjectURL(stlBlob(object))
  a.download = `${base}${suffix}.stl`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 1500)
  useToast().success('STL diunduh.')
}

function frameView() {
  if (rootGroup) frameCamera(rootGroup)
}

function onPointerDown(e) {
  if (e.button !== 0) return
  pointerStart = { x: e.clientX, y: e.clientY }
}

function onPointerUp(e) {
  if (!pointerStart || e.button !== 0) return
  const dx = e.clientX - pointerStart.x
  const dy = e.clientY - pointerStart.y
  pointerStart = null
  if (dx * dx + dy * dy > 25) return
  if (transform?.dragging || transform?.axis) return
  if (!editorOpen.value || !rootGroup || !camera || !renderer) return
  const rect = renderer.domElement.getBoundingClientRect()
  const mouse = new THREE.Vector2(
    ((e.clientX - rect.left) / rect.width) * 2 - 1,
    -((e.clientY - rect.top) / rect.height) * 2 + 1
  )
  const raycaster = new THREE.Raycaster()
  raycaster.setFromCamera(mouse, camera)
  const hits = raycaster.intersectObjects(collectMeshes(rootGroup), false)
  select(hits[0]?.object?.uuid || 'all')
}

function onKey(e) {
  if (!editorOpen.value || loading.value || error.value) return
  const tag = (e.target instanceof HTMLElement ? e.target.tagName : '') || ''
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag)) return
  if (e.ctrlKey || e.metaKey) {
    if (e.key === 'z' || e.key === 'Z') {
      e.preventDefault()
      if (e.shiftKey) redo()
      else undo()
    } else if (e.key === 'y' || e.key === 'Y') {
      e.preventDefault()
      redo()
    }
    return
  }
  if (e.key === 'Escape') {
    if (expanded.value) expanded.value = false
    else setMode('orbit')
  }
  if (e.key === 'g' || e.key === 'G') setMode('translate')
  if (e.key === 'r' || e.key === 'R') setMode('rotate')
  if (e.key === 's' || e.key === 'S') setMode('scale')
}

function toolClass(id) {
  return mode.value === id
    ? 'bg-ink-800 text-white border-ink-800'
    : 'bg-white/90 text-ink-700 border-ink-300 hover:bg-ink-50'
}

watch(expanded, () => {
  nextTick(() => {
    if (!container.value || !renderer || !camera) return
    const el = container.value
    if (!el.clientWidth || !el.clientHeight) return
    camera.aspect = el.clientWidth / el.clientHeight
    camera.updateProjectionMatrix()
    renderer.setSize(el.clientWidth, el.clientHeight)
  })
})

watch(snap, applySnap)

watch(
  () => [props.src, props.filename, props.defaultColor],
  async () => {
    if (!renderer || !scene || !container.value) return
    loading.value = true
    error.value = ''
    try {
      if (rootGroup) {
        scene.remove(rootGroup)
        rootGroup.traverse((obj) => {
          obj.geometry?.dispose()
          if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose())
          else obj.material?.dispose()
        })
        rootGroup = null
      }
      history.length = 0
      historyIndex = -1
      syncHistoryUi()
      const loaded = await loadModel()
      rootGroup = new THREE.Group()
      rootGroup.add(loaded)
      scene.add(rootGroup)
      groundAndFrame(rootGroup)
      refreshParts()
      color.value = props.defaultColor || firstColor(rootGroup)
      if (props.defaultColor) tintObject(rootGroup, props.defaultColor)
      updateDims()
      attachGizmo()
    } catch (e) {
      error.value = e.message || 'Gagal memuat model'
    } finally {
      loading.value = false
    }
  }
)

onMounted(async () => {
  const el = container.value
  scene = new THREE.Scene()
  scene.background = new THREE.Color(0xf4f4f5)
  camera = new THREE.PerspectiveCamera(45, el.clientWidth / Math.max(el.clientHeight, 1), 0.1, 1000)

  try {
    renderer = new THREE.WebGLRenderer({ antialias: true })
  } catch {
    loading.value = false
    error.value = 'Browser tidak mendukung WebGL — preview 3D tidak tersedia.'
    return
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.setSize(el.clientWidth, el.clientHeight)
  el.appendChild(renderer.domElement)

  orbit = new OrbitControls(camera, renderer.domElement)
  orbit.enableDamping = true

  transform = new TransformControls(camera, renderer.domElement)
  transform.enabled = false
  scene.add(transform.getHelper())
  transform.addEventListener('dragging-changed', (ev) => {
    orbit.enabled = !ev.value
  })
  transform.addEventListener('mouseDown', () => {
    if (transform.object) xformBefore = captureXform(transform.object)
  })
  transform.addEventListener('mouseUp', () => {
    const obj = transform.object
    if (!obj || !xformBefore) return
    const after = captureXform(obj)
    if (!xformEqual(xformBefore, after)) {
      const before = xformBefore
      pushCommand({
        undo: () => applyXform(before),
        redo: () => applyXform(after)
      })
    }
    xformBefore = null
    updateDims()
  })
  transform.addEventListener('objectChange', () => updateDims())

  scene.add(new THREE.HemisphereLight(0xffffff, 0x666666, 1.2))
  const dir = new THREE.DirectionalLight(0xffffff, 1.5)
  dir.position.set(1, 2, 1.5)
  scene.add(dir)

  try {
    const loaded = await loadModel()
    rootGroup = new THREE.Group()
    rootGroup.add(loaded)
    scene.add(rootGroup)
    groundAndFrame(rootGroup)
    updateDims()
    const maxDim = Math.max(dims.value.x, dims.value.y, dims.value.z, 1)
    const grid = new THREE.GridHelper(Math.max(maxDim * 3, 1), 30, 0x999999, 0xdddddd)
    scene.add(grid)
    boxHelper = new THREE.BoxHelper(rootGroup, 0x0f766e)
    boxHelper.visible = false
    scene.add(boxHelper)
    refreshParts()
    color.value = props.defaultColor || firstColor(rootGroup)
    if (props.defaultColor) tintObject(rootGroup, props.defaultColor)
    updateDims()
    renderer.domElement.addEventListener('pointerdown', onPointerDown)
    renderer.domElement.addEventListener('pointerup', onPointerUp)
  } catch (e) {
    error.value = e.message || 'Gagal memuat model'
  } finally {
    loading.value = false
  }

  const animate = () => {
    animId = requestAnimationFrame(animate)
    orbit?.update()
    if (boxHelper?.visible) boxHelper.update()
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
  window.addEventListener('keydown', onKey)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKey)
  renderer?.domElement?.removeEventListener('pointerdown', onPointerDown)
  renderer?.domElement?.removeEventListener('pointerup', onPointerUp)
  cancelAnimationFrame(animId)
  resizeObserver?.disconnect()
  transform?.dispose()
  orbit?.dispose()
  renderer?.dispose()
  scene?.traverse((obj) => {
    obj.geometry?.dispose()
    if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose())
    else obj.material?.dispose()
  })
})
</script>

<template>
  <div
    class="bg-ink-50 overflow-hidden"
    :class="expanded
      ? 'fixed inset-0 z-[120] min-h-0'
      : 'relative w-full h-full min-h-0'"
  >
    <div ref="container" class="absolute inset-0"></div>

    <div v-if="loading" class="absolute inset-0 flex items-center justify-center text-sm text-ink-500 bg-ink-50">
      Memuat model…
    </div>
    <div v-if="error" class="absolute inset-0 flex items-center justify-center text-sm text-red-600 bg-ink-50 p-4 text-center">
      {{ error }}
    </div>

    <template v-if="!loading && !error">
      <div
        v-if="compact && !expanded"
        class="absolute inset-x-0 bottom-0 p-2 flex items-end justify-between gap-2 pointer-events-none"
      >
        <div class="pointer-events-none text-xs font-mono text-ink-600 bg-white/80 rounded px-2 py-1">
          {{ formatDim(dims.x) }} × {{ formatDim(dims.y) }} × {{ formatDim(dims.z) }}
        </div>
        <button type="button" class="btn-secondary pointer-events-auto h-8 min-h-8 text-xs" @click="expanded = true">
          <ArrowsPointingOutIcon class="w-4 h-4" />Editor
        </button>
      </div>

      <div
        v-if="editorOpen"
        class="absolute inset-x-0 top-0 p-2 flex flex-wrap items-center gap-1 bg-gradient-to-b from-white/95 to-transparent"
      >
        <button type="button" class="tool-btn border" :class="toolClass('orbit')" title="Lihat (Esc)" @click="setMode('orbit')">Lihat</button>
        <button type="button" class="tool-btn border" :class="toolClass('translate')" title="Geser (G)" @click="setMode('translate')">Geser</button>
        <button type="button" class="tool-btn border" :class="toolClass('rotate')" title="Putar (R)" @click="setMode('rotate')">Putar</button>
        <button type="button" class="tool-btn border" :class="toolClass('scale')" title="Skala (S)" @click="setMode('scale')">Skala</button>
        <span class="w-px h-5 bg-ink-200 mx-0.5"></span>
        <button type="button" class="tool-btn border bg-white/90" title="Undo (Ctrl+Z)" :disabled="!canUndo" @click="undo">
          <ArrowUturnLeftIcon class="w-3.5 h-3.5" />Undo
        </button>
        <button type="button" class="tool-btn border bg-white/90" title="Redo (Ctrl+Shift+Z)" :disabled="!canRedo" @click="redo">
          <ArrowUturnRightIcon class="w-3.5 h-3.5" />Redo
        </button>
        <span class="w-px h-5 bg-ink-200 mx-0.5"></span>
        <button type="button" class="tool-btn border bg-white/90" title="Mirror X" @click="mirror('x')">MX</button>
        <button type="button" class="tool-btn border bg-white/90" title="Mirror Y" @click="mirror('y')">MY</button>
        <button type="button" class="tool-btn border bg-white/90" title="Mirror Z" @click="mirror('z')">MZ</button>
        <button type="button" class="tool-btn border bg-white/90" title="Duplikat" @click="duplicateSelected">
          <Square2StackIcon class="w-3.5 h-3.5" />Duplikat
        </button>
        <label class="tool-btn border bg-white/90 cursor-pointer" title="Warna preview">
          <input
            :value="color"
            type="color"
            class="w-5 h-5 p-0 border-0 bg-transparent cursor-pointer"
            @focus="beginColor"
            @input="onColorInput($event.target.value)"
            @change="commitColor"
          />
        </label>
        <button
          type="button"
          class="tool-btn border"
          :class="snap ? 'bg-ink-100 text-ink-800 border-ink-300' : 'bg-white/90 border-ink-300'"
          title="Snap 1 unit / 15°"
          @click="snap = !snap"
        >
          Snap
        </button>
        <span class="w-px h-5 bg-ink-200 mx-0.5"></span>
        <button type="button" class="tool-btn border bg-white/90" title="Frame kamera" @click="frameView">
          <ArrowPathIcon class="w-3.5 h-3.5" />Frame
        </button>
        <button type="button" class="tool-btn border bg-white/90" @click="downloadStl('all')">
          <ArrowDownTrayIcon class="w-3.5 h-3.5" />STL
        </button>
        <button
          v-if="parts.length > 1 && selectedId !== 'all'"
          type="button"
          class="tool-btn border bg-white/90"
          @click="downloadStl('part')"
        >
          STL part
        </button>
        <select
          v-if="parts.length > 1"
          class="tool-btn border bg-white/90 max-w-[9rem]"
          :value="selectedId"
          @change="select($event.target.value)"
        >
          <option value="all">Semua ({{ parts.length }})</option>
          <option v-for="p in parts" :key="p.id" :value="p.id">{{ p.name }}</option>
        </select>
        <button
          type="button"
          class="tool-btn border bg-white/90 ml-auto"
          @click="expanded = !expanded"
        >
          <ArrowsPointingInIcon v-if="expanded" class="w-3.5 h-3.5" />
          <ArrowsPointingOutIcon v-else class="w-3.5 h-3.5" />
          {{ expanded ? 'Tutup' : 'Besar' }}
        </button>
      </div>

      <div
        v-if="editorOpen"
        class="absolute bottom-2 left-2 right-2 flex flex-wrap items-end justify-between gap-2 pointer-events-none"
      >
        <div class="text-xs bg-white/80 rounded px-2 py-1 space-y-0.5">
          <div class="font-mono text-ink-800">
            {{ formatDim(dims.x) }} × {{ formatDim(dims.y) }} × {{ formatDim(dims.z) }}
            <span class="text-ink-400 font-sans">satuan file (biasanya mm)</span>
          </div>
          <div class="text-ink-400">
            {{ selectedId === 'all' ? 'Semua part' : 'Part terpilih' }}
            · klik model untuk pilih · drag gizmo untuk ubah · Ctrl+Z undo
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.tool-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  height: 2rem;
  padding: 0 0.5rem;
  border-radius: 0.5rem;
  font-size: 0.75rem;
  font-weight: 500;
  line-height: 1;
  white-space: nowrap;
}
.tool-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
