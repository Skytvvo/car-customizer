import { useEffect, type MutableRefObject } from 'react'
import * as THREE from 'three'
import { Canvas, useThree } from '@react-three/fiber'
import { ContactShadows, Environment, Grid, Lightformer, OrbitControls } from '@react-three/drei'
import type { OrbitControls as OrbitControlsImpl } from 'three/examples/jsm/controls/OrbitControls.js'
import { setRenderer } from '../lib/loaders'
import type { Placement } from '../lib/normalize'

export type CaptureFn = () => string

interface ViewerProps {
  model: { raw: THREE.Object3D; placement: Placement } | null
  /** Changes when a different model is opened, so the camera re-frames. */
  modelKey: string
  autoRotate: boolean
  showGrid: boolean
  captureRef: MutableRefObject<CaptureFn | null>
}

const DEFAULT_DIMS: [number, number, number] = [1.8, 1.45, 4.5]

const FOV = 35
const HERO_DIRECTION = new THREE.Vector3(0.95, 0.42, 1.05).normalize()

/** Standard 3/4 front view that fits the whole car in a viewport of the given aspect ratio. */
function heroPose(
  [w, h, l]: [number, number, number],
  aspect = 16 / 10,
  margin = 1.15,
  halfV = THREE.MathUtils.degToRad(FOV / 2),
) {
  const radius = 0.5 * Math.hypot(w, h, l)
  const halfH = Math.atan(Math.tan(halfV) * aspect)
  const distance = (radius / Math.sin(Math.min(halfV, halfH))) * margin
  const target = new THREE.Vector3(0, h * 0.45, 0)
  return { position: HERO_DIRECTION.clone().multiplyScalar(distance).add(target), target }
}

export default function Viewer({ model, modelKey, autoRotate, showGrid, captureRef }: ViewerProps) {
  const dims = model?.placement.dimensions ?? DEFAULT_DIMS
  const [width, height, length] = dims

  return (
    <Canvas
      className="viewer-canvas"
      dpr={[1, 2]}
      camera={{ fov: FOV, near: 0.05, far: 500, position: heroPose(dims).position }}
      gl={{ antialias: true, alpha: true }}
      onCreated={({ gl }) => setRenderer(gl)}
    >
      <StudioLighting />
      {model && (
        <group position={model.placement.position}>
          <group scale={model.placement.scale}>
            <group rotation={model.placement.rotation}>
              <primitive object={model.raw} />
            </group>
          </group>
        </group>
      )}
      <ContactShadows
        // The car doesn't move (the camera orbits), so bake the shadow once per model/size.
        key={`${modelKey}:${dims.join()}`}
        position={[0, 0.002, 0]}
        scale={Math.max(width, length) * 1.8}
        far={Math.max(height, 0.5) * 1.5}
        blur={2.2}
        opacity={0.75}
        resolution={1024}
        frames={1}
      />
      {showGrid && (
        <Grid
          infiniteGrid
          cellSize={0.25}
          sectionSize={1}
          cellThickness={0.5}
          sectionThickness={1}
          cellColor="#3a3f4b"
          sectionColor="#5b6273"
          fadeDistance={length * 6}
          position={[0, -0.001, 0]}
        />
      )}
      <OrbitControls
        makeDefault
        enableDamping
        autoRotate={autoRotate}
        autoRotateSpeed={0.8}
        minDistance={length * 0.4}
        maxDistance={length * 5}
        maxPolarAngle={Math.PI / 2 - 0.03}
      />
      <CameraRig modelKey={modelKey} dims={dims} />
      <Capture captureRef={captureRef} dims={dims} />
    </Canvas>
  )
}

/** Procedural studio: soft overhead softboxes and side strips for car-paint reflections. No network needed. */
function StudioLighting() {
  return (
    <>
      <ambientLight intensity={0.15} />
      <directionalLight position={[5, 8, 4]} intensity={1.2} />
      <Environment resolution={256} frames={1}>
        <Lightformer form="rect" intensity={3} position={[0, 6, 0]} rotation-x={Math.PI / 2} scale={[12, 4, 1]} />
        <Lightformer form="rect" intensity={2} position={[0, 4, -9]} scale={[14, 3, 1]} />
        <Lightformer form="rect" intensity={1.5} position={[-9, 2, 0]} rotation-y={Math.PI / 2} scale={[20, 1.2, 1]} />
        <Lightformer form="rect" intensity={1.5} position={[9, 2, 0]} rotation-y={-Math.PI / 2} scale={[20, 1.2, 1]} />
        <Lightformer form="ring" intensity={1} position={[0, 3, 9]} scale={4} />
        <Lightformer form="rect" color="#1b1e25" intensity={1} position={[0, -2, 0]} rotation-x={-Math.PI / 2} scale={[40, 40, 1]} />
      </Environment>
    </>
  )
}

function CameraRig({ modelKey, dims }: { modelKey: string; dims: [number, number, number] }) {
  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null
  const aspect = useThree((s) => s.size.width / s.size.height)
  const [w, h, l] = dims

  useEffect(() => {
    const pose = heroPose([w, h, l], aspect)
    camera.position.copy(pose.position)
    if (controls) {
      controls.target.copy(pose.target)
      controls.update()
    } else {
      camera.lookAt(pose.target)
    }
    // Re-frame on model change and when the size/orientation changes, not on every window resize.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelKey, controls, camera, w, h, l])

  return null
}

function Capture({ captureRef, dims }: { captureRef: MutableRefObject<CaptureFn | null>; dims: [number, number, number] }) {
  const { gl, scene, camera } = useThree()
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null

  useEffect(() => {
    const capture: CaptureFn = () => {
      // Render once from the hero angle, grab pixels, then restore the user's view.
      const savedPos = camera.position.clone()
      const savedTarget = controls?.target.clone()
      // Frame for the 16:10 crop of the canvas that becomes the thumbnail.
      const thumbAspect = 16 / 10
      const canvasAspect = gl.domElement.width / gl.domElement.height
      const fullHalfV = THREE.MathUtils.degToRad(FOV / 2)
      const cropHalfV =
        canvasAspect >= thumbAspect ? fullHalfV : Math.atan((Math.tan(fullHalfV) * canvasAspect) / thumbAspect)
      const pose = heroPose(dims, thumbAspect, 1.02, cropHalfV)
      camera.position.copy(pose.position)
      camera.lookAt(pose.target)
      gl.render(scene, camera)

      const thumb = document.createElement('canvas')
      thumb.width = 480
      thumb.height = 300
      const src = gl.domElement
      const ratio = Math.min(src.width / thumb.width, src.height / thumb.height)
      const sw = thumb.width * ratio
      const sh = thumb.height * ratio
      const ctx = thumb.getContext('2d')!
      ctx.fillStyle = '#1a1d24'
      ctx.fillRect(0, 0, thumb.width, thumb.height)
      ctx.drawImage(src, (src.width - sw) / 2, (src.height - sh) / 2, sw, sh, 0, 0, thumb.width, thumb.height)

      camera.position.copy(savedPos)
      if (controls && savedTarget) {
        controls.target.copy(savedTarget)
        controls.update()
      }
      return thumb.toDataURL('image/webp', 0.85)
    }
    captureRef.current = capture
    return () => {
      // A replaced canvas (e.g. StrictMode remount) may clean up late; don't clear the new one's hook.
      if (captureRef.current === capture) captureRef.current = null
    }
  }, [gl, scene, camera, controls, dims, captureRef])

  return null
}
