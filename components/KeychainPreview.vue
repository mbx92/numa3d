<script setup>
// Preview keychain — centering benar, cavity terlihat (rim berlubang + lantai gelap).
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

const props = defineProps({
  parts: { type: Array, required: true }, // [{ geometry, color, line?, role?, name?, modelUrl? }]
  showGrid: { type: Boolean, default: false },
  simulateClick: { type: Boolean, default: false },
  interactiveClick: { type: Boolean, default: false },
  clickRole: { type: String, default: 'lid' },
  clickTravelMm: { type: Number, default: 4 },
  interactiveAssembly: { type: Boolean, default: false },
  selectedPartId: { type: String, default: '' },
  explodeFactor: { type: Number, default: 0 },
  autoExplode: { type: Boolean, default: false },
  assemblyResetToken: { type: Number, default: 0 },
  /** Model clicker Z-up → putar agar berdiri di grid Three.js (Y-up). */
  zUpModel: { type: Boolean, default: false }
})

const emit = defineEmits(['update:selectedPartId', 'select-part'])

const container = ref(null)
const loading = ref(true)
const error = ref('')

let renderer, scene, camera, orbit, transform, resizeObserver, intersectionObserver
let rootGroup, clickGroup, gridHelper, animId
let partGroupMap = new Map()
let explodeDistance = 18
let autoExplodeValue = 0
let pointerStart = null
let visible = true
let manualPressed = false
let manualPress = 0
let mountSerial = 0
const gltfLoader = new GLTFLoader()
const gltfCache = new Map()

function getPartId(part, index) {
  return part.role || part.name || `part-${index}`
}

function shouldAnimate() {
  return (
    props.simulateClick ||
    manualPressed ||
    manualPress > 0.001 ||
    props.autoExplode ||
    (props.interactiveAssembly && props.explodeFactor > 0.001)
  )
}

function easeInOut(t) {
  return t * t * (3 - 2 * t)
}

function effectiveExplodeFactor(time = performance.now()) {
  if (props.autoExplode) {
    const phase = (time % 3600) / 3600
    const t = phase < 0.5 ? phase * 2 : (1 - phase) * 2
    autoExplodeValue = easeInOut(t)
    return autoExplodeValue
  }
  autoExplodeValue = 0
  return Math.min(Math.max(Number(props.explodeFactor) || 0, 0), 1)
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

function applyExplodeAndHighlight(time) {
  if (!props.interactiveAssembly || !partGroupMap.size) return
  const factor = effectiveExplodeFactor(time)
  for (const [partId, group] of partGroupMap) {
    const dir = group.userData.explodeDir
    const drag = group.userData.dragOffset
    if (dir?.isVector3) {
      group.position.copy(dir).multiplyScalar(explodeDistance * factor)
      if (drag?.isVector3) group.position.add(drag)
    }
    const selected = props.selectedPartId === partId
    group.traverse((obj) => {
      if (!obj.isMesh || !obj.material) return
      const mat = obj.material
      if (selected) {
        if (mat.emissive) {
          mat.emissive.set(obj.userData.baseColor || '#ffffff')
          mat.emissiveIntensity = 0.42
        }
      } else if (mat.emissive && obj.userData.baseEmissive?.isColor) {
        mat.emissive.copy(obj.userData.baseEmissive)
        mat.emissiveIntensity = obj.userData.baseEmissiveIntensity ?? 0
      }
    })
  }
}

function updateClickMotion(time) {
  if (!clickGroup) return
  clickGroup.position.z = clickOffsetAt(time)
  clickGroup.updateMatrixWorld(true)
}

function attachTransform() {
  if (!transform || !props.interactiveAssembly) return
  const group = props.selectedPartId ? partGroupMap.get(props.selectedPartId) : null
  if (group) {
    transform.attach(group)
    transform.enabled = true
  } else {
    transform.detach()
    transform.enabled = false
  }
}

function resetAssemblyPositions() {
  if (transform) {
    transform.detach()
    transform.enabled = false
  }
  for (const group of partGroupMap.values()) {
    if (group.userData.dragOffset?.isVector3) group.userData.dragOffset.set(0, 0, 0)
    group.position.set(0, 0, 0)
  }
  applyExplodeAndHighlight()
  render()
}

defineExpose({ resetAssemblyPositions })

function render(time) {
  if (!renderer || !scene || !camera || !visible) return
  updateClickMotion(typeof time === 'number' ? time : performance.now())
  if (props.interactiveAssembly) applyExplodeAndHighlight(typeof time === 'number' ? time : performance.now())
  renderer.render(scene, camera)
}

function startAnimation() {
  if (animId) return
  const tick = (time) => {
    render(time)
    if (shouldAnimate() || transform?.dragging) {
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

function collectMeshes(object) {
  const meshes = []
  object.traverse((obj) => {
    if (obj.isMesh) meshes.push(obj)
  })
  return meshes
}

function findPartId(object) {
  let node = object
  while (node) {
    if (node.userData?.partId) return node.userData.partId
    node = node.parent
  }
  return ''
}

function selectPart(partId) {
  emit('update:selectedPartId', partId)
  emit('select-part', partId)
  attachTransform()
  render()
}

function onCanvasPointerDown(event) {
  if (props.interactiveClick) {
    event.currentTarget?.setPointerCapture?.(event.pointerId)
    setManualPressed(true)
  }
  if (props.interactiveAssembly) {
    pointerStart = { x: event.clientX, y: event.clientY }
  }
}

function onCanvasPointerUp(event) {
  if (props.interactiveClick) {
    event.currentTarget?.releasePointerCapture?.(event.pointerId)
    setManualPressed(false)
  }

  if (!props.interactiveAssembly || !pointerStart || !rootGroup || !camera || !renderer) {
    pointerStart = null
    return
  }

  const dx = event.clientX - pointerStart.x
  const dy = event.clientY - pointerStart.y
  pointerStart = null
  if (dx * dx + dy * dy > 36) return
  if (transform?.dragging || transform?.axis) return

  const rect = renderer.domElement.getBoundingClientRect()
  const mouse = new THREE.Vector2(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1
  )
  const raycaster = new THREE.Raycaster()
  raycaster.setFromCamera(mouse, camera)
  const hits = raycaster.intersectObjects(collectMeshes(rootGroup), false)
  const partId = hits[0] ? findPartId(hits[0].object) : ''
  selectPart(partId === props.selectedPartId ? '' : partId)
}

function onCanvasPointerLeave() {
  if (props.interactiveClick) setManualPressed(false)
  pointerStart = null
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
  if (transform) {
    transform.detach()
    transform.enabled = false
  }
  if (!rootGroup) return
  scene.remove(rootGroup)
  rootGroup.traverse((o) => {
    o.geometry?.dispose()
    if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose())
    else o.material?.dispose()
  })
  rootGroup = null
  clickGroup = null
  partGroupMap = new Map()
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

function ensureGridHelper() {
  if (!scene || !props.showGrid) return
  if (!gridHelper) {
    gridHelper = new THREE.GridHelper(80, 16, 0xb8bec8, 0xd5dae2)
    setGridMaterial(gridHelper)
    gridHelper.userData = { size: 80 }
    scene.add(gridHelper)
  }
  gridHelper.visible = true
  if (rootGroup) updateGridPosition()
}

function createMeshMaterial(part) {
  const opacity = part.opacity == null ? 1 : Math.min(Math.max(Number(part.opacity) || 1, 0.05), 1)
  const transparent = opacity < 0.999 || part.role === 'ledGlow'
  if (part.role === 'ledGlow') {
    return new THREE.MeshBasicMaterial({
      color: part.color || '#fff1a8',
      transparent: true,
      opacity,
      depthWrite: false,
      side: THREE.DoubleSide
    })
  }
  const mat = new THREE.MeshLambertMaterial({
    color: part.color || '#f97316',
    side: THREE.FrontSide,
    transparent,
    opacity
  })
  if (part.glow || part.role === 'ledChip') {
    mat.emissive = new THREE.Color(part.color || '#fff1a8')
    mat.emissiveIntensity = Number(part.glowIntensity) || 0.7
  }
  return mat
}

async function loadGltfScene(url) {
  if (!gltfCache.has(url)) {
    gltfCache.set(url, gltfLoader.loadAsync(url).then((gltf) => gltf.scene))
  }
  return gltfCache.get(url)
}

function cloneMaterial(material) {
  if (!material) return material
  if (Array.isArray(material)) return material.map((m) => cloneMaterial(m))
  return material.clone ? material.clone() : material
}

function cloneModelObject(object, opacity) {
  const clone = object.clone(true)
  clone.traverse((child) => {
    if (!child.isMesh) return
    if (child.geometry?.clone) child.geometry = child.geometry.clone()
    child.material = cloneMaterial(child.material)
    const mats = Array.isArray(child.material) ? child.material : [child.material]
    for (const mat of mats) {
      if (!mat) continue
      if (opacity < 0.999) {
        mat.transparent = true
        mat.opacity = Math.min(mat.opacity ?? 1, opacity)
        mat.depthWrite = false
      }
      mat.needsUpdate = true
    }
  })
  return clone
}

function selectModelNodes(sceneObject, names = [], opacity = 1) {
  const wanted = (names || []).map((name) => String(name).toLowerCase()).filter(Boolean)
  if (!wanted.length) return cloneModelObject(sceneObject, opacity)

  sceneObject.updateMatrixWorld(true)
  const group = new THREE.Group()
  sceneObject.traverse((node) => {
    if (!wanted.includes(String(node.name || '').toLowerCase())) return
    const clone = cloneModelObject(node, opacity)
    clone.matrix.copy(node.matrixWorld)
    clone.matrix.decompose(clone.position, clone.quaternion, clone.scale)
    group.add(clone)
  })
  return group.children.length ? group : cloneModelObject(sceneObject, opacity)
}

async function createModelPart(part) {
  const source = await loadGltfScene(part.modelUrl)
  const opacity = part.opacity == null ? 1 : Math.min(Math.max(Number(part.opacity) || 1, 0.05), 1)
  const model = selectModelNodes(source, part.modelNodeNames, opacity)
  const wrapper = new THREE.Group()
  wrapper.add(model)
  if (part.modelAxis === 'gltf-y-up') model.rotation.x += Math.PI / 2

  wrapper.updateMatrixWorld(true)
  let box = getBox(wrapper)
  const size = box.getSize(new THREE.Vector3())
  const fitMm = Math.max(1, Number(part.modelFitMm) || 18.5)
  const footprint = Math.max(size.x, size.y, 0.001)
  wrapper.scale.setScalar(fitMm / footprint)
  wrapper.updateMatrixWorld(true)

  box = getBox(wrapper)
  const center = box.getCenter(new THREE.Vector3())
  const position = part.position || {}
  const topZ = Number(part.modelTopZ ?? position.z ?? 0) || 0
  wrapper.position.set(-center.x, -center.y, topZ - box.max.z)

  // Floor clamp: after stem-top alignment, lift if housing hangs below modelMinZ
  const modelMinZ = Number(part.modelMinZ)
  if (Number.isFinite(modelMinZ)) {
    wrapper.updateMatrixWorld(true)
    box = getBox(wrapper)
    if (box.min.z < modelMinZ) {
      wrapper.position.z += modelMinZ - box.min.z
    }
  }

  const placed = new THREE.Group()
  placed.add(wrapper)
  placed.position.set(Number(position.x) || 0, Number(position.y) || 0, Number(position.z) || 0)
  placed.rotation.z = Number(part.rotationZ) || 0
  placed.userData.baseColor = part.color || '#64748b'
  return placed
}

function addLedPointLight(parent, geo, color, index) {
  if (index % 3 !== 0) return
  geo.computeBoundingBox()
  const center = geo.boundingBox.getCenter(new THREE.Vector3())
  const light = new THREE.PointLight(color || '#fff1a8', 0.42, 34, 1.8)
  light.position.copy(center)
  parent.add(light)
}

function ensurePartGroup(partId, parent) {
  if (partGroupMap.has(partId)) return partGroupMap.get(partId)
  const group = new THREE.Group()
  group.userData.partId = partId
  group.userData.dragOffset = new THREE.Vector3()
  partGroupMap.set(partId, group)
  parent.add(group)
  return group
}

function computeExplodeVectors() {
  if (!rootGroup || !partGroupMap.size) return
  rootGroup.updateMatrixWorld(true)
  const modelCenter = getBox(rootGroup).getCenter(new THREE.Vector3())
  const size = getBox(rootGroup).getSize(new THREE.Vector3())
  explodeDistance = Math.max(size.x, size.y, size.z, 12) * 0.38

  for (const group of partGroupMap.values()) {
    group.updateMatrixWorld(true)
    const partCenter = getBox(group).getCenter(new THREE.Vector3())
    const dir = partCenter.clone().sub(modelCenter)
    if (dir.lengthSq() < 1e-4) dir.set(0, 1, 0)
    else dir.normalize()
    group.userData.explodeDir = dir
    group.position.set(0, 0, 0)
    group.userData.dragOffset.set(0, 0, 0)
  }
}

async function mountParts(serial) {
  clearScene()
  rootGroup = new THREE.Group()
  const orientGroup = new THREE.Group()
  if (props.zUpModel) orientGroup.rotation.x = -Math.PI / 2
  const staticGroup = new THREE.Group()
  clickGroup = new THREE.Group()
  orientGroup.add(staticGroup, clickGroup)
  rootGroup.add(orientGroup)
  let added = 0

  for (let i = 0; i < (props.parts || []).length; i++) {
    if (serial !== mountSerial) return
    const part = props.parts[i]
    if (!part?.modelUrl && !part?.geometry?.attributes?.position?.count) continue
    const partId = getPartId(part, i)
    const parentRoot = part.role === props.clickRole ? clickGroup : staticGroup
    const group = props.interactiveAssembly ? ensurePartGroup(partId, parentRoot) : parentRoot

    if (part.modelUrl) {
      const model = await createModelPart(part)
      if (serial !== mountSerial) return
      if (props.interactiveAssembly) model.userData.partId = partId
      group.add(model)
      added += 1
      continue
    }

    const geo = part.geometry.clone()

    if (part.line) {
      const mat = new THREE.LineBasicMaterial({ color: part.color || '#1f2937' })
      const line = new THREE.LineSegments(geo, mat)
      line.renderOrder = i + 1
      if (props.interactiveAssembly) line.userData.partId = partId
      group.add(line)
      added += 1
      continue
    }

    const mat = createMeshMaterial(part)
    const mesh = new THREE.Mesh(geo, mat)
    mesh.renderOrder = i + 1
    mesh.userData.baseColor = part.color || '#f97316'
    if (mat.emissive) {
      mesh.userData.baseEmissive = mat.emissive.clone()
      mesh.userData.baseEmissiveIntensity = mat.emissiveIntensity ?? 0
    }
    if (props.interactiveAssembly) mesh.userData.partId = partId
    group.add(mesh)
    if (part.role === 'ledChip') addLedPointLight(group, geo, part.color, i)
    added += 1
  }

  if (!added) throw new Error('Preview kosong')

  if (props.interactiveAssembly) computeExplodeVectors()

  centerAtOrigin(rootGroup)
  scene.add(rootGroup)

  const box = getBox(rootGroup)
  if (props.showGrid) ensureGridHelper()
  fitCameraToBox(box)
  updateClickMotion()
  applyExplodeAndHighlight()
  attachTransform()
  if (shouldAnimate()) startAnimation()
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
  const serial = ++mountSerial
  requestAnimationFrame(async () => {
    resize()
    if (!props.parts?.length) {
      clearScene()
      render()
      return
    }
    try {
      await mountParts(serial)
      if (serial !== mountSerial) return
      error.value = ''
    } catch (e) {
      if (serial !== mountSerial) return
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
      canvas.style.cursor = 'grab'
      el.appendChild(canvas)
      canvas.addEventListener('pointerdown', onCanvasPointerDown)
      canvas.addEventListener('pointerup', onCanvasPointerUp)
      canvas.addEventListener('pointercancel', onCanvasPointerUp)
      canvas.addEventListener('pointerleave', onCanvasPointerLeave)

      orbit = new OrbitControls(camera, canvas)
      orbit.enableDamping = false
      orbit.addEventListener('change', render)

      transform = new TransformControls(camera, canvas)
      transform.setMode('translate')
      transform.enabled = false
      transform.showX = true
      transform.showY = true
      transform.showZ = true
      scene.add(transform.getHelper())
      transform.addEventListener('dragging-changed', (ev) => {
        orbit.enabled = !ev.value
        if (ev.value) startAnimation()
        else render()
      })
      transform.addEventListener('objectChange', () => {
        const obj = transform.object
        if (!obj?.userData?.partId) return
        const drag = obj.userData.dragOffset
        const dir = obj.userData.explodeDir
        if (!drag?.isVector3) return
        const factor = effectiveExplodeFactor()
        const explode =
          dir?.isVector3
            ? dir.clone().multiplyScalar(explodeDistance * factor)
            : new THREE.Vector3()
        drag.copy(obj.position).sub(explode)
        render()
      })

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

      if (props.showGrid) ensureGridHelper()

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
  () => [
    props.simulateClick,
    props.interactiveClick,
    props.clickTravelMm,
    props.clickRole,
    props.showGrid,
    props.interactiveAssembly,
    props.selectedPartId,
    props.explodeFactor,
    props.autoExplode,
    props.assemblyResetToken
  ],
  () => {
    if (!renderer) return
    if (!props.interactiveClick) manualPressed = false
    if (props.showGrid) ensureGridHelper()
    else if (gridHelper) gridHelper.visible = false
    attachTransform()
    if (props.interactiveAssembly) applyExplodeAndHighlight()
    if (shouldAnimate()) startAnimation()
    else stopAnimation()
    render()
  }
)

watch(
  () => props.assemblyResetToken,
  (token, prev) => {
    if (!renderer || prev === undefined || token === prev) return
    resetAssemblyPositions()
  }
)

onMounted(init)

onUnmounted(() => {
  mountSerial += 1
  intersectionObserver?.disconnect()
  resizeObserver?.disconnect()
  stopAnimation()
  renderer?.domElement?.removeEventListener('pointerdown', onCanvasPointerDown)
  renderer?.domElement?.removeEventListener('pointerup', onCanvasPointerUp)
  renderer?.domElement?.removeEventListener('pointercancel', onCanvasPointerUp)
  renderer?.domElement?.removeEventListener('pointerleave', onCanvasPointerLeave)
  transform?.dispose()
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
