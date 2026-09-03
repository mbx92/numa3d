<script setup>
/**
 * Preview mesh + bidang potong + resizer wilayah XY.
 * Di luar kotak resizer tidak ikut terpotong (tetap base utuh di generator).
 * Math cutZ sama generator: cutZ = maxZ - height * lidRatio
 */
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { parseMeshBuffer, meshBounds, orientMeshToZUp } from '~/utils/clickerManifold/meshImport.js'

const DEFAULT_REGION = { u: 0.5, v: 0.5, wu: 1, wv: 1 }

const props = defineProps({
  meshBuffer: { type: [ArrayBuffer, Object], default: null },
  meshFilename: { type: String, default: '' },
  maxSizeMm: { type: Number, default: 45 },
  lidColor: { type: String, default: '#e8b86d' },
  baseColor: { type: String, default: '#8b5a2b' },
  /** auto | x | y | z — samakan dengan generator */
  upAxis: { type: String, default: 'auto' }
})

const splitLidRatio = defineModel('splitLidRatio', { type: Number, default: 0.32 })
const splitRegion = defineModel('splitRegion', {
  type: Object,
  default: () => ({ u: 0.5, v: 0.5, wu: 1, wv: 1 })
})

const emit = defineEmits(['auto-detect'])

function emitAutoDetect() {
  emit('auto-detect')
}

const container = ref(null)
const loading = ref(false)
const error = ref('')
const dragMode = ref('') // 'z' | 'pan' | 'resize'
const boundsInfo = ref(null)

let renderer, scene, camera, orbit, animId, resizeObserver
let rootGroup, modelGroup, meshObj, planeMesh, planeEdge, handleGroup, columnMesh, columnEdge
let modelMaxZ = 1
let modelHeight = 1
let modelWidth = 40
let modelDepth = 40
let rayPlane = null
let pointerId = null
let resizeCorner = null
let panStart = null
let handles = []

const regionIsNarrow = computed(() => {
  const r = clampRegion(splitRegion.value)
  return r.wu < 0.92 || r.wv < 0.92
})

const splitPct = computed({
  get() {
    return Math.round((Number(splitLidRatio.value) || 0.32) * 100)
  },
  set(v) {
    splitLidRatio.value = clampRatio(Number(v) / 100)
  }
})

const regionWPct = computed({
  get() {
    return Math.round((Number(splitRegion.value?.wu) || 1) * 100)
  },
  set(v) {
    patchRegion({ wu: Math.max(0.08, Math.min(1, Number(v) / 100)) })
  }
})

const regionDPct = computed({
  get() {
    return Math.round((Number(splitRegion.value?.wv) || 1) * 100)
  },
  set(v) {
    patchRegion({ wv: Math.max(0.08, Math.min(1, Number(v) / 100)) })
  }
})

function clampRatio(r) {
  return Math.max(0.12, Math.min(0.7, Number(r) || 0.32))
}

function clampRegion(r) {
  const wu = Math.max(0.08, Math.min(1, Number(r?.wu) || 1))
  const wv = Math.max(0.08, Math.min(1, Number(r?.wv) || 1))
  const halfU = wu / 2
  const halfV = wv / 2
  return {
    u: Math.max(halfU, Math.min(1 - halfU, Number.isFinite(Number(r?.u)) ? Number(r.u) : 0.5)),
    v: Math.max(halfV, Math.min(1 - halfV, Number.isFinite(Number(r?.v)) ? Number(r.v) : 0.5)),
    wu,
    wv
  }
}

function patchRegion(partial) {
  splitRegion.value = clampRegion({ ...DEFAULT_REGION, ...splitRegion.value, ...partial })
}

function cutZFromRatio(ratio) {
  return modelMaxZ - modelHeight * clampRatio(ratio)
}

function ratioFromCutZ(z) {
  if (modelHeight <= 0.001) return 0.32
  return clampRatio((modelMaxZ - z) / modelHeight)
}

function regionLocalRect() {
  const r = clampRegion(splitRegion.value)
  const cx = (r.u - 0.5) * modelWidth
  const cy = (r.v - 0.5) * modelDepth
  const hw = (r.wu * modelWidth) / 2
  const hd = (r.wv * modelDepth) / 2
  return { cx, cy, hw, hd, w: hw * 2, d: hd * 2 }
}

function hexColor(hex, fallback = '#888888') {
  try {
    return new THREE.Color(hex || fallback)
  } catch {
    return new THREE.Color(fallback)
  }
}

function disposeObject(obj) {
  if (!obj) return
  obj.traverse((o) => {
    o.geometry?.dispose()
    if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose())
    else o.material?.dispose()
  })
}

function clearMesh() {
  if (!rootGroup) return
  if (modelGroup) {
    rootGroup.remove(modelGroup)
    disposeObject(modelGroup)
  }
  modelGroup = meshObj = planeMesh = planeEdge = handleGroup = columnMesh = columnEdge = null
  handles = []
}

function applyVertexColors(geometry, cutZ) {
  const pos = geometry.getAttribute('position')
  const colors = new Float32Array(pos.count * 3)
  const lid = hexColor(props.lidColor, '#e8b86d')
  const base = hexColor(props.baseColor, '#8b5a2b')
  // Di luar kolom: pudar — tidak terbelah, ikut base utuh
  const outside = new THREE.Color(0xcbd5e1)
  const rect = regionLocalRect()
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const z = pos.getZ(i)
    const inRegion = Math.abs(x - rect.cx) <= rect.hw + 1e-4 && Math.abs(y - rect.cy) <= rect.hd + 1e-4
    // Kolom vertikal penuh: atas bidang = lid, bawah = base (bukan hanya dekat bidang)
    const c = !inRegion ? outside : z >= cutZ ? lid : base
    colors[i * 3] = c.r
    colors[i * 3 + 1] = c.g
    colors[i * 3 + 2] = c.b
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geometry.attributes.color.needsUpdate = true
}

function ensurePlaneGeometry(w, d) {
  if (!planeMesh) return
  const old = planeMesh.geometry
  planeMesh.geometry = new THREE.PlaneGeometry(Math.max(w, 2), Math.max(d, 2))
  old?.dispose()
  if (planeEdge) {
    const oldE = planeEdge.geometry
    planeEdge.geometry = new THREE.EdgesGeometry(planeMesh.geometry)
    oldE?.dispose()
  }
}

function updateHandles() {
  const rect = regionLocalRect()
  const z = cutZFromRatio(splitLidRatio.value)
  const corners = [
    { id: 'ne', x: rect.cx + rect.hw, y: rect.cy + rect.hd },
    { id: 'nw', x: rect.cx - rect.hw, y: rect.cy + rect.hd },
    { id: 'se', x: rect.cx + rect.hw, y: rect.cy - rect.hd },
    { id: 'sw', x: rect.cx - rect.hw, y: rect.cy - rect.hd }
  ]
  corners.forEach((c, i) => {
    const h = handles[i]
    if (!h) return
    h.position.set(c.x, c.y, z)
    h.userData.corner = c.id
  })
  const center = handles[4]
  if (center) center.position.set(rect.cx, rect.cy, z)
}

function updateColumnVisual() {
  const rect = regionLocalRect()
  if (!columnMesh) return
  const h = Math.max(modelHeight, 1)
  columnMesh.scale.set(Math.max(rect.w, 0.5), Math.max(rect.d, 0.5), h)
  columnMesh.position.set(rect.cx, rect.cy, h / 2)
  if (columnEdge) {
    columnEdge.position.copy(columnMesh.position)
    columnEdge.scale.copy(columnMesh.scale)
  }
}

function updatePlaneVisual() {
  const rect = regionLocalRect()
  const z = cutZFromRatio(splitLidRatio.value)
  ensurePlaneGeometry(rect.w, rect.d)
  if (planeMesh) planeMesh.position.set(rect.cx, rect.cy, z)
  if (planeEdge) planeEdge.position.set(rect.cx, rect.cy, z)
  updateColumnVisual()
  updateHandles()
  if (meshObj?.geometry) applyVertexColors(meshObj.geometry, z)
  render()
}

function buildScaledGeometry(raw) {
  const b = meshBounds(raw)
  const maxDim = Math.max(b.width, b.depth, 0.001)
  const scale = (Number(props.maxSizeMm) || 45) / maxDim
  const vp = raw.vertProperties
  const np = raw.numProp || 3
  const positions = new Float32Array((vp.length / np) * 3)
  let pi = 0
  for (let i = 0; i < vp.length; i += np) {
    positions[pi++] = (vp[i] - b.centerX) * scale
    positions[pi++] = (vp[i + 1] - b.centerY) * scale
    positions[pi++] = (vp[i + 2] - b.minZ) * scale
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geo.setIndex(new THREE.BufferAttribute(raw.triVerts, 1))
  geo.computeVertexNormals()

  const scaledH = Math.max(b.height * scale, 0.001)
  modelMaxZ = scaledH
  modelHeight = scaledH
  modelWidth = Math.max(b.width * scale, 0.001)
  modelDepth = Math.max(b.depth * scale, 0.001)
  boundsInfo.value = {
    width: Number(modelWidth.toFixed(1)),
    depth: Number(modelDepth.toFixed(1)),
    height: Number(scaledH.toFixed(1))
  }
  return geo
}

function makeHandle(color, scale = 1) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(1.1 * scale, 16, 12),
    new THREE.MeshStandardMaterial({
      color,
      metalness: 0.1,
      roughness: 0.45,
      emissive: color,
      emissiveIntensity: 0.15
    })
  )
  return mesh
}

async function loadMesh() {
  clearMesh()
  error.value = ''
  boundsInfo.value = null
  if (!(props.meshBuffer instanceof ArrayBuffer)) return

  loading.value = true
  try {
    const copy = props.meshBuffer.slice(0)
    const parsed = parseMeshBuffer(copy, props.meshFilename || '')
    const { raw } = orientMeshToZUp(parsed, props.upAxis || 'auto')
    const geo = buildScaledGeometry(raw)
    splitRegion.value = clampRegion(splitRegion.value || DEFAULT_REGION)
    applyVertexColors(geo, cutZFromRatio(splitLidRatio.value))

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      metalness: 0.05,
      roughness: 0.72,
      side: THREE.DoubleSide
    })

    modelGroup = new THREE.Group()
    meshObj = new THREE.Mesh(geo, mat)
    modelGroup.add(meshObj)

    const rect = regionLocalRect()
    planeMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(Math.max(rect.w, 2), Math.max(rect.d, 2)),
      new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.32,
        side: THREE.DoubleSide,
        depthWrite: false
      })
    )
    planeEdge = new THREE.LineSegments(
      new THREE.EdgesGeometry(planeMesh.geometry),
      new THREE.LineBasicMaterial({ color: 0x0369a1 })
    )
    modelGroup.add(planeMesh)
    modelGroup.add(planeEdge)

    // Ghost kolom: potongan = seluruh tinggi di dalam kotak XY (bukan hanya dekat bidang)
    const colGeo = new THREE.BoxGeometry(1, 1, 1)
    columnMesh = new THREE.Mesh(
      colGeo,
      new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.08,
        depthWrite: false,
        side: THREE.DoubleSide
      })
    )
    columnEdge = new THREE.LineSegments(
      new THREE.EdgesGeometry(colGeo),
      new THREE.LineBasicMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0.7 })
    )
    modelGroup.add(columnMesh)
    modelGroup.add(columnEdge)

    handleGroup = new THREE.Group()
    const handleScale = Math.max(0.55, Math.min(1.8, Math.max(modelWidth, modelDepth) / 45))
    handles = [
      makeHandle(0xf97316, handleScale),
      makeHandle(0xf97316, handleScale),
      makeHandle(0xf97316, handleScale),
      makeHandle(0xf97316, handleScale),
      makeHandle(0x0ea5e9, handleScale * 1.15)
    ]
    handles.forEach((h, i) => {
      h.userData.role = i < 4 ? 'resize' : 'pan'
      handleGroup.add(h)
    })
    modelGroup.add(handleGroup)

    modelGroup.rotation.x = -Math.PI / 2
    rootGroup.add(modelGroup)

    updatePlaneVisual()
    fitCamera()
  } catch (e) {
    error.value = e?.message || 'Gagal memuat preview mesh'
    clearMesh()
  } finally {
    loading.value = false
    render()
  }
}

function fitCamera() {
  if (!camera || !orbit || !rootGroup || !container.value) return
  const box = new THREE.Box3().setFromObject(rootGroup)
  if (box.isEmpty()) return
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  const maxDim = Math.max(size.x, size.y, size.z, 0.001)
  const aspect = Math.max(container.value.clientWidth, 1) / Math.max(container.value.clientHeight, 1)
  const fovRad = (camera.fov * Math.PI) / 180
  const fitH = maxDim / (2 * Math.tan(fovRad / 2))
  const fitW = fitH / aspect
  const distance = Math.max(fitH, fitW) * 1.45
  camera.position.set(center.x + distance * 0.7, center.y + distance * 0.45, center.z + distance * 0.85)
  camera.near = Math.max(distance / 300, 0.01)
  camera.far = distance * 300
  camera.updateProjectionMatrix()
  orbit.target.copy(center)
  orbit.update()
}

function render() {
  if (!renderer || !scene || !camera) return
  renderer.render(scene, camera)
}

function onResize() {
  const el = container.value
  if (!el || !renderer || !camera) return
  const w = Math.max(el.clientWidth, 1)
  const h = Math.max(el.clientHeight, 1)
  renderer.setSize(w, h, false)
  camera.aspect = w / h
  camera.updateProjectionMatrix()
  render()
}

function pointerNdc(event) {
  const rect = renderer.domElement.getBoundingClientRect()
  return new THREE.Vector2(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1
  )
}

function localPointFromEvent(event) {
  if (!renderer || !camera || !modelGroup) return null
  const mouse = pointerNdc(event)
  const raycaster = new THREE.Raycaster()
  raycaster.setFromCamera(mouse, camera)
  const center = new THREE.Vector3()
  new THREE.Box3().setFromObject(modelGroup).getCenter(center)
  if (!rayPlane) rayPlane = new THREE.Plane()
  const camDir = new THREE.Vector3()
  camera.getWorldDirection(camDir)
  rayPlane.setFromNormalAndCoplanarPoint(camDir, center)
  const hit = new THREE.Vector3()
  if (!raycaster.ray.intersectPlane(rayPlane, hit)) return null
  return modelGroup.worldToLocal(hit)
}

/** Hit di bidang potong (Z tetap) untuk pan/resize XY. */
function localXYOnCutPlane(event) {
  if (!renderer || !camera || !modelGroup) return null
  const mouse = pointerNdc(event)
  const raycaster = new THREE.Raycaster()
  raycaster.setFromCamera(mouse, camera)
  const z = cutZFromRatio(splitLidRatio.value)
  // Plane Z = const in model local; after modelGroup rot -X90, local Z → world Y.
  // Intersect in world using a plane from three local points.
  const p0 = modelGroup.localToWorld(new THREE.Vector3(0, 0, z))
  const p1 = modelGroup.localToWorld(new THREE.Vector3(1, 0, z))
  const p2 = modelGroup.localToWorld(new THREE.Vector3(0, 1, z))
  const plane = new THREE.Plane().setFromCoplanarPoints(p0, p1, p2)
  const hit = new THREE.Vector3()
  if (!raycaster.ray.intersectPlane(plane, hit)) return null
  return modelGroup.worldToLocal(hit)
}

function onPointerDown(event) {
  if (event.button !== 0 || !renderer || !modelGroup) return
  const mouse = pointerNdc(event)
  const raycaster = new THREE.Raycaster()
  raycaster.setFromCamera(mouse, camera)
  raycaster.params.Points = { threshold: 2 }

  const handleHits = handles.length ? raycaster.intersectObjects(handles, false) : []
  if (handleHits.length) {
    const obj = handleHits[0].object
    dragMode.value = obj.userData.role === 'pan' ? 'pan' : 'resize'
    resizeCorner = obj.userData.corner || null
    const xy = localXYOnCutPlane(event)
    if (xy) {
      const r = clampRegion(splitRegion.value)
      panStart = { x: xy.x, y: xy.y, region: { ...r } }
    }
    pointerId = event.pointerId
    event.currentTarget?.setPointerCapture?.(event.pointerId)
    if (orbit) orbit.enabled = false
    event.preventDefault()
    return
  }

  if (planeMesh && raycaster.intersectObject(planeMesh, false).length) {
    dragMode.value = 'z'
    pointerId = event.pointerId
    event.currentTarget?.setPointerCapture?.(event.pointerId)
    if (orbit) orbit.enabled = false
    event.preventDefault()
  }
}

function onPointerMove(event) {
  if (!dragMode.value) return

  if (dragMode.value === 'z') {
    const pt = localPointFromEvent(event)
    if (!pt) return
    splitLidRatio.value = ratioFromCutZ(pt.z)
    updatePlaneVisual()
    return
  }

  const xy = localXYOnCutPlane(event)
  if (!xy || !panStart) return

  if (dragMode.value === 'pan') {
    const dx = xy.x - panStart.x
    const dy = xy.y - panStart.y
    patchRegion({
      u: panStart.region.u + dx / modelWidth,
      v: panStart.region.v + dy / modelDepth,
      wu: panStart.region.wu,
      wv: panStart.region.wv
    })
    updatePlaneVisual()
    return
  }

  if (dragMode.value === 'resize' && resizeCorner) {
    const r0 = panStart.region
    const cx0 = (r0.u - 0.5) * modelWidth
    const cy0 = (r0.v - 0.5) * modelDepth
    const hw0 = (r0.wu * modelWidth) / 2
    const hd0 = (r0.wv * modelDepth) / 2
    // Anchor = opposite corner
    let ax = cx0
    let ay = cy0
    if (resizeCorner.includes('e')) ax = cx0 - hw0
    if (resizeCorner.includes('w')) ax = cx0 + hw0
    if (resizeCorner.includes('n')) ay = cy0 - hd0
    if (resizeCorner.includes('s')) ay = cy0 + hd0

    const minHalf = Math.max(modelWidth, modelDepth) * 0.04
    let x1 = xy.x
    let y1 = xy.y
    // Clamp to mesh footprint
    const maxX = modelWidth / 2
    const maxY = modelDepth / 2
    x1 = Math.max(-maxX, Math.min(maxX, x1))
    y1 = Math.max(-maxY, Math.min(maxY, y1))

    const minX = Math.min(ax, x1)
    const maxXX = Math.max(ax, x1)
    const minY = Math.min(ay, y1)
    const maxYY = Math.max(ay, y1)
    let w = Math.max(minHalf * 2, maxXX - minX)
    let d = Math.max(minHalf * 2, maxYY - minY)
    let cx = (minX + maxXX) / 2
    let cy = (minY + maxYY) / 2
    // Keep inside footprint
    w = Math.min(w, modelWidth)
    d = Math.min(d, modelDepth)
    cx = Math.max(-modelWidth / 2 + w / 2, Math.min(modelWidth / 2 - w / 2, cx))
    cy = Math.max(-modelDepth / 2 + d / 2, Math.min(modelDepth / 2 - d / 2, cy))

    patchRegion({
      u: cx / modelWidth + 0.5,
      v: cy / modelDepth + 0.5,
      wu: w / modelWidth,
      wv: d / modelDepth
    })
    updatePlaneVisual()
  }
}

function onPointerUp(event) {
  if (!dragMode.value) return
  if (pointerId != null) event.currentTarget?.releasePointerCapture?.(pointerId)
  dragMode.value = ''
  resizeCorner = null
  panStart = null
  pointerId = null
  if (orbit) orbit.enabled = true
}

function nudge(deltaPct) {
  splitPct.value = splitPct.value + deltaPct
  updatePlaneVisual()
}

function resetRegion() {
  splitRegion.value = { ...DEFAULT_REGION }
  updatePlaneVisual()
}

function init() {
  const el = container.value
  if (!el) return
  scene = new THREE.Scene()
  scene.background = new THREE.Color(0xf8fafc)
  camera = new THREE.PerspectiveCamera(42, 1, 0.1, 2000)
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  el.appendChild(renderer.domElement)
  renderer.domElement.className = 'absolute inset-0 w-full h-full touch-none'
  renderer.domElement.style.display = 'block'

  scene.add(new THREE.AmbientLight(0xffffff, 0.7))
  const dir = new THREE.DirectionalLight(0xffffff, 0.85)
  dir.position.set(40, 60, 30)
  scene.add(dir)

  rootGroup = new THREE.Group()
  scene.add(rootGroup)

  const grid = new THREE.GridHelper(120, 24, 0xcbd5e1, 0xe2e8f0)
  grid.position.y = -0.01
  scene.add(grid)

  orbit = new OrbitControls(camera, renderer.domElement)
  orbit.enableDamping = true
  orbit.dampingFactor = 0.08
  orbit.addEventListener('change', render)

  renderer.domElement.addEventListener('pointerdown', onPointerDown)
  renderer.domElement.addEventListener('pointermove', onPointerMove)
  renderer.domElement.addEventListener('pointerup', onPointerUp)
  renderer.domElement.addEventListener('pointercancel', onPointerUp)

  resizeObserver = new ResizeObserver(onResize)
  resizeObserver.observe(el)
  onResize()

  const loop = () => {
    animId = requestAnimationFrame(loop)
    if (orbit) orbit.update()
    render()
  }
  loop()
}

function teardown() {
  cancelAnimationFrame(animId)
  resizeObserver?.disconnect()
  if (renderer?.domElement) {
    renderer.domElement.removeEventListener('pointerdown', onPointerDown)
    renderer.domElement.removeEventListener('pointermove', onPointerMove)
    renderer.domElement.removeEventListener('pointerup', onPointerUp)
    renderer.domElement.removeEventListener('pointercancel', onPointerUp)
  }
  clearMesh()
  orbit?.dispose()
  renderer?.dispose()
  if (renderer?.domElement?.parentNode) {
    renderer.domElement.parentNode.removeChild(renderer.domElement)
  }
  renderer = scene = camera = orbit = rootGroup = null
}

watch(
  () => [props.meshBuffer, props.meshFilename, props.maxSizeMm, props.upAxis],
  () => {
    if (scene) loadMesh()
  }
)

watch(splitLidRatio, () => {
  if (meshObj) updatePlaneVisual()
})

watch(
  splitRegion,
  () => {
    if (meshObj) updatePlaneVisual()
  },
  { deep: true }
)

watch(
  () => [props.lidColor, props.baseColor],
  () => {
    if (meshObj) updatePlaneVisual()
  }
)

onMounted(async () => {
  init()
  await loadMesh()
})

onUnmounted(teardown)

defineExpose({ nudge, fitCamera, resetRegion })
</script>

<template>
  <div class="absolute inset-0 flex flex-col min-h-0">
    <div class="shrink-0 z-10 border-b border-ink-200 bg-white/95 backdrop-blur-sm px-3 py-2 space-y-2">
      <div class="flex items-center justify-between gap-2">
        <p class="text-[11px] font-medium text-ink-700">Atur potongan mesh</p>
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="text-[10px] font-medium text-accent-600 hover:text-accent-700"
            @click="emitAutoDetect"
          >
            Deteksi otomatis
          </button>
          <p v-if="boundsInfo" class="text-[10px] font-mono text-ink-400">
            {{ boundsInfo.width }}×{{ boundsInfo.depth }}×{{ boundsInfo.height }} mm
          </p>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <button
          type="button"
          class="btn-secondary text-[11px] py-1 px-2 shrink-0"
          title="Lid lebih tipis"
          @click="nudge(-2)"
        >
          −
        </button>
        <input v-model.number="splitPct" type="range" min="12" max="70" step="1" class="flex-1" />
        <button
          type="button"
          class="btn-secondary text-[11px] py-1 px-2 shrink-0"
          title="Lid lebih tebal"
          @click="nudge(2)"
        >
          +
        </button>
        <span class="text-xs font-mono w-12 text-right shrink-0">{{ splitPct }}%</span>
      </div>
      <div class="grid grid-cols-2 gap-2">
        <label class="flex items-center gap-1.5 text-[10px] text-ink-600">
          <span class="w-10 shrink-0">Lebar</span>
          <input v-model.number="regionWPct" type="range" min="8" max="100" step="1" class="flex-1" />
          <span class="font-mono w-8 text-right">{{ regionWPct }}%</span>
        </label>
        <label class="flex items-center gap-1.5 text-[10px] text-ink-600">
          <span class="w-10 shrink-0">Dalam</span>
          <input v-model.number="regionDPct" type="range" min="8" max="100" step="1" class="flex-1" />
          <span class="font-mono w-8 text-right">{{ regionDPct }}%</span>
        </label>
      </div>
      <p
        v-if="regionIsNarrow"
        class="rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-[10px] text-amber-900 leading-snug"
      >
        Kotak kecil = hanya <strong>kolom vertikal</strong> yang terbelah (ujung atas + dasar dalam kotak ikut
        kena). Untuk kaktus↔pot: klik
        <button type="button" class="font-semibold underline" @click="resetRegion">Reset wilayah</button>
        (100%), lalu geser bidang biru ke bibir pot — atas = kaktus (lid), bawah = pot (base).
      </p>
      <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px]">
        <span class="inline-flex items-center gap-1.5">
          <span class="w-2.5 h-2.5 rounded-sm" :style="{ background: lidColor }" />
          Lid (atas bidang, dalam kolom)
        </span>
        <span class="inline-flex items-center gap-1.5">
          <span class="w-2.5 h-2.5 rounded-sm" :style="{ background: baseColor }" />
          Base (bawah bidang, dalam kolom)
        </span>
        <span class="inline-flex items-center gap-1.5">
          <span class="w-2.5 h-2.5 rounded-sm bg-slate-300" />
          Luar kolom (utuh → base)
        </span>
        <button type="button" class="text-accent-600 hover:text-accent-700 font-medium" @click="resetRegion">
          Reset wilayah
        </button>
        <span class="text-ink-400">
          {{
            dragMode === 'resize'
              ? 'Resize sudut…'
              : dragMode === 'pan'
                ? 'Geser wilayah…'
                : dragMode === 'z'
                  ? 'Geser tinggi potong…'
                  : 'Oranye = resize kolom · biru = geser · bidang = tinggi potong'
          }}
        </span>
      </div>
    </div>

    <div ref="container" class="relative flex-1 min-h-0">
      <div
        v-if="loading"
        class="absolute inset-0 z-10 flex items-center justify-center bg-white/70 text-sm text-ink-500"
      >
        Memuat preview mesh…
      </div>
      <div
        v-else-if="error"
        class="absolute inset-0 z-10 flex items-center justify-center bg-white/80 text-sm text-red-600 px-4 text-center"
      >
        {{ error }}
      </div>
    </div>
  </div>
</template>
