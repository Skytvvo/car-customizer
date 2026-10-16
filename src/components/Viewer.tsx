import { useEffect, useRef, type MutableRefObject } from 'react'
import * as THREE from 'three'
import { Canvas, useThree } from '@react-three/fiber'
import { ContactShadows, Environment, Grid, Lightformer, OrbitControls } from '@react-three/drei'
import { setRenderer } from '../lib/loaders'
import type { Placement } from '../lib/normalize'
import { FOV, viewPose, type CameraMode, type ViewRequest } from '../lib/camera'
import { CameraRig, FlyControls } from './CameraControls'
import { HudSync, SilhouetteBaker, ViewCube } from './SceneHud'
import PartsLayer, { type PartsLayerProps } from './PartsLayer'
import type { HudState } from '../lib/hud'
import type { Settings } from '../lib/settings'

export type CaptureFn = () => string

interface ViewerProps {
  model: { raw: THREE.Object3D; placement: Placement } | null
  /** Changes when a different model is opened, so the camera re-frames. */
  modelKey: string
  autoRotate: boolean
  showGrid: boolean
  cameraMode: CameraMode
  viewRequest: ViewRequest | null
  onFocus: () => void
  showViewCube: boolean
  /** Width in pixels of UI covering the right side of the view (the settings panel). */
  panelInset: number
  settings: Settings
  onFlySpeedChange: (flySpeed: number) => void
  onViewDirection: (dir: [number, number, number]) => void
  hudRef: MutableRefObject<HudState>
  parts: Omit<PartsLayerProps, 'modelRef'>
  captureRef: MutableRefObject<CaptureFn | null>
}

const DEFAULT_DIMS: [number, number, number] = [1.8, 1.45, 4.5]

export default function Viewer(props: ViewerProps) {
  const { model, modelKey, autoRotate, showGrid, cameraMode, captureRef } = props
  const dims = model?.placement.dimensions ?? DEFAULT_DIMS
  const [width, height, length] = dims
  const modelRef = useRef<THREE.Group>(null)

  return (
    <Canvas
      className="viewer-canvas"
      dpr={[1, 2]}
      camera={{ fov: FOV, near: 0.05, far: 500, position: viewPose('hero', dims).position }}
      gl={{ antialias: true, alpha: true }}
      onCreated={({ gl }) => setRenderer(gl)}
    >
      <StudioLighting />
      {model && (
        <group ref={modelRef} position={model.placement.position}>
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
        enabled={cameraMode === 'orbit'}
        enableDamping
        autoRotate={autoRotate && cameraMode === 'orbit'}
        autoRotateSpeed={0.8}
        minDistance={length * 0.1}
        maxDistance={length * 5}
        maxPolarAngle={Math.PI / 2 - 0.03}
      />
      <CameraRig
        modelKey={modelKey}
        dims={dims}
        mode={cameraMode}
        viewRequest={props.viewRequest}
        modelRef={modelRef}
        onFocus={props.onFocus}
        inset={props.panelInset}
      />
      {cameraMode === 'fly' && (
        <FlyControls baseSpeed={length * 0.7} settings={props.settings} onSpeedChange={props.onFlySpeedChange} />
      )}
      <HudSync hudRef={props.hudRef} mode={cameraMode} dims={dims} />
      <SilhouetteBaker
        hudRef={props.hudRef}
        modelRef={modelRef}
        bakeKey={`${modelKey}:${model?.placement.rotation.join()}:${dims.join()}:${props.parts.build.hidden.join()}`}
        dims={dims}
      />
      {model && props.showViewCube && <ViewCube onDirection={props.onViewDirection} />}
      {model && <PartsLayer modelRef={modelRef} {...props.parts} />}
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

function Capture({ captureRef, dims }: { captureRef: MutableRefObject<CaptureFn | null>; dims: [number, number, number] }) {
  const { gl, scene, camera } = useThree()

  useEffect(() => {
    const capture: CaptureFn = () => {
      // Render once from the hero angle, grab pixels, then restore the user's view.
      const savedPos = camera.position.clone()
      const savedQuat = camera.quaternion.clone()
      // Thumbnails are centered crops, so drop the panel offset for this render.
      const cam = camera as THREE.PerspectiveCamera
      const savedView = cam.view ? { ...cam.view } : null
      cam.clearViewOffset()
      // Frame for the 16:10 crop of the canvas that becomes the thumbnail.
      const thumbAspect = 16 / 10
      const canvasAspect = gl.domElement.width / gl.domElement.height
      const fullHalfV = THREE.MathUtils.degToRad(FOV / 2)
      const cropHalfV =
        canvasAspect >= thumbAspect ? fullHalfV : Math.atan((Math.tan(fullHalfV) * canvasAspect) / thumbAspect)
      const pose = viewPose('hero', dims, thumbAspect, 1.02, cropHalfV)
      camera.position.copy(pose.position)
      camera.lookAt(pose.target)
      // Keep editing handles (part gizmo) out of the thumbnail.
      const helpers: THREE.Object3D[] = []
      scene.traverse((o) => {
        if ((o as THREE.Object3D & { isTransformControls?: boolean }).isTransformControls && o.visible) helpers.push(o)
      })
      helpers.forEach((o) => (o.visible = false))
      gl.render(scene, camera)
      helpers.forEach((o) => (o.visible = true))

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
      camera.quaternion.copy(savedQuat)
      if (savedView?.enabled) {
        cam.setViewOffset(savedView.fullWidth, savedView.fullHeight, savedView.offsetX, savedView.offsetY, savedView.width, savedView.height)
      }
      return thumb.toDataURL('image/webp', 0.85)
    }
    captureRef.current = capture
    return () => {
      // A replaced canvas (e.g. StrictMode remount) may clean up late; don't clear the new one's hook.
      if (captureRef.current === capture) captureRef.current = null
    }
  }, [gl, scene, camera, dims, captureRef])

  return null
}
