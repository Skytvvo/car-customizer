import { useEffect, useMemo, useRef, useState, type MutableRefObject, type RefObject } from 'react'
import * as THREE from 'three'
import { useThree, type ThreeEvent } from '@react-three/fiber'
import { TransformControls } from '@react-three/drei'
import { firstShownHit, type Build, type MeshIndex, type PartInstance, type Vec3 } from '../lib/build'
import { CATALOG } from '../parts/catalog'
import { createFinishMaterial } from '../parts/finishes'
import { disposeGroup } from '../parts/geometry'

export type GizmoMode = 'translate' | 'rotate' | 'scale'
export type PickMode = 'place' | 'hide' | null

/** Scene queries the DOM side needs (e.g. where a new part should land). */
export interface SceneApi {
  /** Height of the car's visible surface below (x, z), or null if nothing is there. */
  surfaceBelow: (x: number, z: number) => number | null
}

interface Props {
  build: Build
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
}

export default function PartsLayer(props: Props) {
  const { build, meshIndex, modelRef, selectedId, gizmoMode, pickMode } = props
  const gl = useThree((s) => s.gl)
  const camera = useThree((s) => s.camera)
  const [selectedObject, setSelectedObject] = useState<THREE.Group | null>(null)
  const latest = useRef(props)
  latest.current = props

  // Hide/show original meshes.
  useEffect(() => {
    if (!meshIndex) return
    const hidden = new Set(build.hidden)
    meshIndex.byPath.forEach((mesh, path) => (mesh.visible = !hidden.has(path)))
  }, [build.hidden, meshIndex])

  useEffect(() => {
    const raycaster = new THREE.Raycaster()
    props.apiRef.current = {
      surfaceBelow: (x, z) => {
        const model = modelRef.current
        if (!model) return null
        raycaster.set(new THREE.Vector3(x, 100, z), new THREE.Vector3(0, -1, 0))
        return firstShownHit(raycaster, model)?.point.y ?? null
      },
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
          groupRef={part.id === selectedId ? setSelectedObject : undefined}
          onSelect={props.onSelect}
        />
      ))}
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

function PartObject({
  part,
  groupRef,
  onSelect,
}: {
  part: PartInstance
  groupRef?: (g: THREE.Group | null) => void
  onSelect: (id: string) => void
}) {
  const def = CATALOG[part.kind]
  const material = useMemo(() => createFinishMaterial(part.finish), [part.finish])
  const object = useMemo(() => def?.build(part.params, material) ?? new THREE.Group(), [def, part.params, material])

  useEffect(() => () => material.dispose(), [material])
  useEffect(() => () => disposeGroup(object), [object])

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 5) return // that was a drag
    e.stopPropagation()
    onSelect(part.id)
  }

  return (
    <group ref={groupRef} position={part.position} rotation={part.rotation} scale={part.scale} onClick={onClick}>
      <primitive object={object} />
    </group>
  )
}
