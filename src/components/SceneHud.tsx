import { useEffect, type MutableRefObject, type RefObject } from 'react'
import * as THREE from 'three'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { GizmoHelper, GizmoViewcube } from '@react-three/drei'
import type { OrbitControls as OrbitControlsImpl } from 'three/examples/jsm/controls/OrbitControls.js'
import type { CameraMode } from '../lib/camera'
import type { HudState } from '../lib/hud'

type Dims = [number, number, number]

/** Copies the live camera state into the shared HUD object every frame. */
export function HudSync({ hudRef, mode, dims }: { hudRef: MutableRefObject<HudState>; mode: CameraMode; dims: Dims }) {
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null
  useFrame(({ camera, size }) => {
    const hud = hudRef.current
    hud.position.copy(camera.position)
    camera.getWorldDirection(hud.forward)
    hud.mode = mode
    hud.dims = dims
    hud.target = mode === 'orbit' && controls ? controls.target : null
    const fov = THREE.MathUtils.degToRad((camera as THREE.PerspectiveCamera).fov ?? 35)
    hud.fovH = 2 * Math.atan(Math.tan(fov / 2) * (size.width / size.height))
  })
  return null
}

const SILHOUETTE_SIZE = 512

/**
 * Renders the car once from straight above (front up) into an offscreen target and keeps
 * only its alpha, giving the minimap an accurate outline (mirrors, bumpers and all).
 */
export function SilhouetteBaker({
  hudRef,
  modelRef,
  bakeKey,
  dims,
}: {
  hudRef: MutableRefObject<HudState>
  modelRef: RefObject<THREE.Object3D | null>
  bakeKey: string
  dims: Dims
}) {
  const gl = useThree((s) => s.gl)

  useEffect(() => {
    const hud = hudRef.current
    const model = modelRef.current
    if (!model) {
      hud.silhouette = null
      return
    }
    const [w, h, l] = dims
    const half = (Math.max(w, l) / 2) * 1.04
    const camera = new THREE.OrthographicCamera(-half, half, half, -half, 0.01, h + 20)
    camera.position.set(0, h + 10, 0)
    camera.up.set(0, 0, 1) // front (+Z) at the top of the image
    camera.lookAt(0, 0, 0)

    const target = new THREE.WebGLRenderTarget(SILHOUETTE_SIZE, SILHOUETTE_SIZE)
    const prevTarget = gl.getRenderTarget()
    const prevAutoClear = gl.autoClear
    const prevClear = gl.getClearColor(new THREE.Color())
    const prevAlpha = gl.getClearAlpha()

    gl.setRenderTarget(target)
    gl.setClearColor(0x000000, 0)
    gl.clear()
    gl.render(model, camera)
    const pixels = new Uint8Array(SILHOUETTE_SIZE * SILHOUETTE_SIZE * 4)
    gl.readRenderTargetPixels(target, 0, 0, SILHOUETTE_SIZE, SILHOUETTE_SIZE, pixels)

    gl.setRenderTarget(prevTarget)
    gl.setClearColor(prevClear, prevAlpha)
    gl.autoClear = prevAutoClear
    target.dispose()

    // Alpha → light-gray outline. GL rows start at the bottom, so flip vertically.
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = SILHOUETTE_SIZE
    const ctx = canvas.getContext('2d')!
    const image = ctx.createImageData(SILHOUETTE_SIZE, SILHOUETTE_SIZE)
    for (let y = 0; y < SILHOUETTE_SIZE; y++) {
      for (let x = 0; x < SILHOUETTE_SIZE; x++) {
        const src = ((SILHOUETTE_SIZE - 1 - y) * SILHOUETTE_SIZE + x) * 4
        const dst = (y * SILHOUETTE_SIZE + x) * 4
        const a = pixels[src + 3]
        image.data[dst] = 205
        image.data[dst + 1] = 212
        image.data[dst + 2] = 225
        image.data[dst + 3] = a > 6 ? Math.min(255, a * 1.4) : 0
      }
    }
    ctx.putImageData(image, 0, 0)
    hud.silhouette = canvas
    hud.silhouetteHalf = half
    // Re-bake when the model, its orientation or its size changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bakeKey, gl])

  return null
}

const CUBE_FACES = ['Left', 'Right', 'Top', 'Bottom', 'Front', 'Rear'] // +X, −X, +Y, −Y, +Z, −Z

/** Blender/CAD-style navigation cube that mirrors the camera; click a face, edge or corner to fly there. */
export function ViewCube({ onDirection }: { onDirection: (dir: [number, number, number]) => void }) {
  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    // Edges/corners sit off-center, so their position is the direction; the main cube uses the clicked face.
    const dir = e.object.position.lengthSq() > 0 ? e.object.position : e.face?.normal
    if (dir) onDirection([dir.x, dir.y, dir.z])
    return null
  }

  return (
    <GizmoHelper alignment="top-left" margin={[84, 84]}>
      <group scale={1.3}>
        <GizmoViewcube
          faces={CUBE_FACES}
          font="600 22px Inter, system-ui, sans-serif"
          color="#262b36"
          hoverColor="#e8452c"
          textColor="#e8eaef"
          strokeColor="#3b4252"
          opacity={0.95}
          onClick={handleClick}
        />
      </group>
    </GizmoHelper>
  )
}
