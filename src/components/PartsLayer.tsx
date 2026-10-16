import { memo, useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject, type RefObject } from 'react'
import * as THREE from 'three'
import { useThree, type ThreeEvent } from '@react-three/fiber'
import { Line, TransformControls } from '@react-three/drei'
import type { OrbitControls as OrbitControlsImpl } from 'three/examples/jsm/controls/OrbitControls.js'
import { startDrag, stepDrag, type DragAxis, type DragOptions } from '../lib/smartDrag'
import { setDragInfo } from '../lib/dragInfo'
import { firstShownHit, type Build, type MeshIndex, type PartInstance, type SceneQuery, type Vec3 } from '../lib/build'
import type { PartAsset } from '../lib/types'
import { loadPartTemplate } from '../parts/uploaded'
import { deformObject, disposeDeformed, isDeformed } from '../parts/deform'
import type { Deform } from '../lib/build'
import { CATALOG } from '../parts/catalog'
import { createFinishMaterial } from '../parts/finishes'
import { disposeGroup } from '../parts/geometry'

export type GizmoMode = 'translate' | 'rotate' | 'scale'
export type PickMode = 'place' | 'hide' | null

export type SceneApi = SceneQuery

export interface PartsLayerProps {
  build: Build
  assets: Map<string, PartAsset>
  meshIndex: MeshIndex | null
  modelRef: RefObject<THREE.Object3D | null>
  selectedId: string | null
  gizmoMode: GizmoMode
  pickMode: PickMode
  apiRef: MutableRefObject<SceneApi | null>
  onSelect: (id: string | null) => void
  onTransform: (id: string, patch: Pick<PartInstance, 'position' | 'rotation' | 'scale'>) => void
  onPlace: (point: Vec3) => void
  onToggleHidden: (path: string) => void
  dragOptions: DragOptions
}

interface Guide {
  axis: DragAxis | null
  center: boolean
  position: Vec3
}

export default function PartsLayer(props: PartsLayerProps) {
  const { build, meshIndex, modelRef, selectedId, gizmoMode, pickMode } = props
  const gl = useThree((s) => s.gl)
  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null
  const [selectedObject, setSelectedObject] = useState<THREE.Group | null>(null)
  const [guide, setGuide] = useState<Guide | null>(null)
  const latest = useRef(props)
  latest.current = props

  const select = useCallback((id: string) => latest.current.onSelect(id), [])

  /**
   * Drag a part by grabbing it (Move mode): slides on the horizontal plane through the grab
   * point with axis lock, center magnet and precision speed; Alt moves it up/down, Shift is fine.
   */
  const grab = useCallback(
    (id: string, e: ThreeEvent<PointerEvent>) => {
      const p = latest.current
      if (p.pickMode || p.gizmoMode !== 'translate' || e.nativeEvent.button !== 0) return
      e.stopPropagation()
      p.onSelect(id)
      const obj = e.eventObject as THREE.Group
      const el = gl.domElement
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -e.point.y)
      const raycaster = new THREE.Raycaster()
      const ndc = new THREE.Vector2()
      const hitAt = (x: number, y: number) => {
        const rect = el.getBoundingClientRect()
        ndc.set(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1)
        raycaster.setFromCamera(ndc, camera)
        return raycaster.ray.intersectPlane(plane, new THREE.Vector3())
      }
      let last = hitAt(e.nativeEvent.clientX, e.nativeEvent.clientY) ?? e.point.clone()
      let lastX = e.nativeEvent.clientX
      let lastY = e.nativeEvent.clientY
      let lastT = performance.now()
      const state = startDrag(obj.position)
      const fov = THREE.MathUtils.degToRad((camera as THREE.PerspectiveCamera).fov ?? 35)
      const metersPerPixel = (2 * camera.position.distanceTo(e.point) * Math.tan(fov / 2)) / el.clientHeight
      const orbitWasEnabled = controls?.enabled ?? false
      if (controls) controls.enabled = false
      el.style.cursor = 'grabbing'
      let moved = false

      const onMove = (ev: PointerEvent) => {
        const now = performance.now()
        const dt = Math.max(1, now - lastT)
        const speed = Math.hypot(ev.clientX - lastX, ev.clientY - lastY) / dt
        const hit = hitAt(ev.clientX, ev.clientY)
        let dx = 0
        let dz = 0
        let dy = 0
        if (ev.altKey) dy = -(ev.clientY - lastY) * metersPerPixel
        else if (hit) {
          dx = hit.x - last.x
          dz = hit.z - last.z
        }
        if (hit) last = hit
        const across = state.axis === 'x' ? Math.abs(dz) : state.axis === 'z' ? Math.abs(dx) : 0
        lastX = ev.clientX
        lastY = ev.clientY
        lastT = now
        const r = stepDrag(
          state,
          { dx, dz, dy, speed, perpSpeed: across / metersPerPixel / dt, metersPerPixel, fine: ev.shiftKey },
          latest.current.dragOptions,
        )
        obj.position.copy(r.position)
        moved = true
        const position = r.position.toArray() as Vec3
        setGuide({ axis: r.axis, center: r.snappedToCenter, position })
        setDragInfo({ position, axis: r.axis, free: r.free, center: r.snappedToCenter, fine: ev.shiftKey, vertical: ev.altKey, gain: r.gain })
      }
      const onUp = () => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        if (controls) controls.enabled = orbitWasEnabled
        el.style.cursor = ''
        setGuide(null)
        setDragInfo(null)
        if (moved) {
          latest.current.onTransform(id, {
            position: obj.position.toArray() as Vec3,
            rotation: [obj.rotation.x, obj.rotation.y, obj.rotation.z],
            scale: obj.scale.toArray() as Vec3,
          })
        }
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    },
    [gl, camera, controls],
  )

  // Hide/show original meshes.
  useEffect(() => {
    if (!meshIndex) return
    const hidden = new Set(build.hidden)
    meshIndex.byPath.forEach((mesh, path) => (mesh.visible = !hidden.has(path)))
  }, [build.hidden, meshIndex])

  useEffect(() => {
    const raycaster = new THREE.Raycaster()
    const cast = (x: number, z: number, fromY: number, dirY: number) => {
      const model = modelRef.current
      if (!model) return null
      raycaster.set(new THREE.Vector3(x, fromY, z), new THREE.Vector3(0, dirY, 0))
      return firstShownHit(raycaster, model)?.point.y ?? null
    }
    props.apiRef.current = {
      surfaceBelow: (x, z) => cast(x, z, 100, -1),
      surfaceAbove: (x, z) => cast(x, z, -1, 1),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelRef])

  // Click on the car while placing a part or hiding meshes. Ignores drags (orbiting, gizmo use).
  useEffect(() => {
    if (!pickMode) return
    const el = gl.domElement
    const raycaster = new THREE.Raycaster()
    const ndc = new THREE.Vector2()
    let downX = 0
    let downY = 0
    const onDown = (e: PointerEvent) => {
      downX = e.clientX
      downY = e.clientY
    }
    const onClick = (e: MouseEvent) => {
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 5) return
      const model = modelRef.current
      if (!model) return
      const rect = el.getBoundingClientRect()
      ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1)
      raycaster.setFromCamera(ndc, camera)
      const hit = firstShownHit(raycaster, model)
      if (!hit) return
      if (pickMode === 'place') latest.current.onPlace(hit.point.toArray() as Vec3)
      else {
        const path = latest.current.meshIndex?.pathOf.get(hit.object)
        if (path) latest.current.onToggleHidden(path)
      }
    }
    el.style.cursor = 'crosshair'
    el.addEventListener('pointerdown', onDown)
    el.addEventListener('click', onClick)
    return () => {
      el.style.cursor = ''
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('click', onClick)
    }
  }, [pickMode, gl, camera, modelRef])

  const commitTransform = () => {
    const o = selectedObject
    if (!o || !selectedId) return
    props.onTransform(selectedId, {
      position: o.position.toArray() as Vec3,
      rotation: [o.rotation.x, o.rotation.y, o.rotation.z],
      scale: o.scale.toArray() as Vec3,
    })
  }

  return (
    <>
      {build.parts.map((part) => (
        <PartObject
          key={part.id}
          part={part}
          asset={part.assetId ? props.assets.get(part.assetId) : undefined}
          groupRef={part.id === selectedId ? setSelectedObject : undefined}
          onSelect={select}
          onGrab={grab}
        />
      ))}
      {guide && <DragGuides guide={guide} />}
      {selectedObject && selectedId && (
        <TransformControls
          object={selectedObject}
          mode={gizmoMode}
          space={gizmoMode === 'scale' ? 'local' : 'world'}
          size={0.75}
          onMouseUp={commitTransform}
        />
      )}
    </>
  )
}

/** Colored line along the locked axis (red X, blue Z) and a green center line while snapped. */
function DragGuides({ guide }: { guide: Guide }) {
  const [x, y, z] = guide.position
  const reach = 4
  const common = { lineWidth: 2, depthTest: false, transparent: true, opacity: 0.9, renderOrder: 10 }
  return (
    <>
      {guide.axis === 'x' && (
        <Line points={[[x - reach, y, z], [x + reach, y, z]]} color="#ff5a4a" dashed dashSize={0.08} gapSize={0.05} {...common} />
      )}
      {guide.axis === 'z' && (
        <Line points={[[x, y, z - reach], [x, y, z + reach]]} color="#4a8dff" dashed dashSize={0.08} gapSize={0.05} {...common} />
      )}
      {guide.center && <Line points={[[0, y, -reach], [0, y, reach]]} color="#3ddc84" {...common} />}
    </>
  )
}

// Memoized: dragging re-renders the layer (guides) but must not re-apply stale positions to parts.
const PartObject = memo(function PartObject({
  part,
  asset,
  groupRef,
  onSelect,
  onGrab,
}: {
  part: PartInstance
  asset?: PartAsset
  groupRef?: (g: THREE.Group | null) => void
  onSelect: (id: string) => void
  onGrab: (id: string, e: ThreeEvent<PointerEvent>) => void
}) {
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 5) return // that was a drag
    e.stopPropagation()
    onSelect(part.id)
  }

  return (
    <group
      ref={groupRef}
      position={part.position}
      rotation={part.rotation}
      scale={part.scale}
      onClick={onClick}
      onPointerDown={(e) => onGrab(part.id, e)}
    >
      {part.kind === 'upload' ? <UploadedPart part={part} asset={asset} /> : <BuiltInPart part={part} />}
    </group>
  )
})

/** Generated from the catalog's builder; rebuilt when sliders change. */
function BuiltInPart({ part }: { part: PartInstance }) {
  const def = CATALOG[part.kind]
  const material = useMemo(() => createFinishMaterial(part.finish), [part.finish])
  const object = useMemo(() => def?.build(part.params, material) ?? new THREE.Group(), [def, part.params, material])

  useEffect(() => () => material.dispose(), [material])
  useEffect(() => () => disposeGroup(object), [object])

  return <primitive object={useDeformed(object, part.deform)} />
}

/** A clone of the user's uploaded model; a finish other than "Original" replaces its materials. */
function UploadedPart({ part, asset }: { part: PartInstance; asset?: PartAsset }) {
  const [template, setTemplate] = useState<THREE.Object3D | null>(null)

  useEffect(() => {
    if (!asset) return
    let alive = true
    loadPartTemplate(asset)
      .then((t) => alive && setTemplate(t))
      .catch((e) => console.error('Could not load part', e))
    return () => {
      alive = false
    }
  }, [asset])

  const material = useMemo(
    () => (part.finish.type === 'original' ? null : createFinishMaterial(part.finish)),
    [part.finish],
  )
  // Clones share geometry and original materials with the template, so only our own material is disposed.
  const object = useMemo(() => {
    if (!template) return null
    const clone = template.clone(true)
    if (material) clone.traverse((o) => ((o as THREE.Mesh).isMesh ? ((o as THREE.Mesh).material = material) : null))
    return clone
  }, [template, material])
  useEffect(() => () => material?.dispose(), [material])

  const shaped = useDeformed(object, part.deform)
  return shaped ? <primitive object={shaped} /> : null
}

/** Bent/swept/twisted copy of a part when it has shape modifiers; the original otherwise. */
function useDeformed<T extends THREE.Object3D | null>(object: T, deform: Deform | undefined): T | THREE.Object3D {
  const deformed = useMemo(
    () => (object && deform && isDeformed(deform) ? deformObject(object, deform) : null),
    [object, deform],
  )
  useEffect(() => () => (deformed ? disposeDeformed(deformed) : undefined), [deformed])
  return deformed ?? object
}
