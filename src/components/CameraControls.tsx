import { useEffect, useRef, type RefObject } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import type { OrbitControls as OrbitControlsImpl } from 'three/examples/jsm/controls/OrbitControls.js'
import { viewPose, type CameraMode, type ViewRequest } from '../lib/camera'

type Dims = [number, number, number]

interface Tween {
  fromPos: THREE.Vector3
  toPos: THREE.Vector3
  fromTarget: THREE.Vector3
  toTarget: THREE.Vector3
  t: number
  duration: number
}

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)

interface RigProps {
  modelKey: string
  dims: Dims
  mode: CameraMode
  viewRequest: ViewRequest | null
  modelRef: RefObject<THREE.Object3D | null>
  /** Double-click focuses a point and switches back to orbit mode. */
  onFocus: () => void
}

/** Frames new models, animates preset views, and keeps orbit/free-cam hand-offs seamless. */
export function CameraRig({ modelKey, dims, mode, viewRequest, modelRef, onFocus }: RigProps) {
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null
  const aspect = useThree((s) => s.size.width / s.size.height)
  const tween = useRef<Tween | null>(null)
  const prevMode = useRef(mode)
  const [w, h, l] = dims

  const flyTo = (toPos: THREE.Vector3, toTarget: THREE.Vector3, duration = 0.7) => {
    if (!controls) return
    // Start from a point straight ahead so the turn is smooth even if the free cam moved off the orbit target.
    const ahead = camera.getWorldDirection(new THREE.Vector3())
    const fromTarget = camera.position.clone().addScaledVector(ahead, camera.position.distanceTo(controls.target))
    tween.current = { fromPos: camera.position.clone(), toPos, fromTarget, toTarget, t: 0, duration }
  }

  // Jump to the standard view when a model opens or its size/orientation changes (not on window resize).
  useEffect(() => {
    tween.current = null
    const pose = viewPose('hero', [w, h, l], aspect)
    camera.position.copy(pose.position)
    if (controls) {
      controls.target.copy(pose.target)
      controls.update()
    } else {
      camera.lookAt(pose.target)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelKey, controls, camera, w, h, l])

  // Leaving free cam: orbit around whatever it was looking at, so the view doesn't jump.
  useEffect(() => {
    const from = prevMode.current
    prevMode.current = mode
    if (!controls || from === mode) return
    if (mode === 'fly') {
      tween.current = null
      return
    }
    const ahead = camera.getWorldDirection(new THREE.Vector3())
    const distance = Math.max(camera.position.distanceTo(new THREE.Vector3(0, h * 0.45, 0)), l * 0.3)
    controls.target.copy(camera.position).addScaledVector(ahead, distance)
    controls.update()
  }, [mode, controls, camera, h, l])

  useEffect(() => {
    if (!viewRequest) return
    const pose = viewPose(viewRequest.view, [w, h, l], aspect)
    flyTo(pose.position, pose.target)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewRequest])

  // Any manual orbit/zoom cancels a running transition.
  useEffect(() => {
    if (!controls) return
    const cancel = () => (tween.current = null)
    controls.addEventListener('start', cancel)
    return () => controls.removeEventListener('start', cancel)
  }, [controls])

  // Double-click a spot on the car to orbit around it, moving a bit closer.
  useEffect(() => {
    const el = gl.domElement
    const raycaster = new THREE.Raycaster()
    const ndc = new THREE.Vector2()
    const onDoubleClick = (e: MouseEvent) => {
      const model = modelRef.current
      if (!model || !controls) return
      const rect = el.getBoundingClientRect()
      ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1)
      raycaster.setFromCamera(ndc, camera)
      const hit = raycaster.intersectObject(model, true)[0]
      if (!hit) return
      onFocus()
      const offset = camera.position.clone().sub(hit.point)
      const distance = THREE.MathUtils.clamp(offset.length() * 0.6, l * 0.15, offset.length())
      flyTo(hit.point.clone().add(offset.setLength(distance)), hit.point.clone())
    }
    el.addEventListener('dblclick', onDoubleClick)
    return () => el.removeEventListener('dblclick', onDoubleClick)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, camera, controls, l, onFocus, modelRef])

  useFrame((_, dt) => {
    const tw = tween.current
    if (!tw || !controls) return
    tw.t = Math.min(1, tw.t + dt / tw.duration)
    const k = easeInOutCubic(tw.t)
    camera.position.lerpVectors(tw.fromPos, tw.toPos, k)
    controls.target.lerpVectors(tw.fromTarget, tw.toTarget, k)
    camera.lookAt(controls.target)
    if (tw.t >= 1) tween.current = null
  })

  return null
}

const MOVE_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown',
  'ShiftLeft', 'ShiftRight',
])
const LOOK_SENSITIVITY = 0.0028
const MAX_PITCH = Math.PI / 2 - 0.01

const isTyping = (e: Event) => !!(e.target as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable]')

const tmpWanted = new THREE.Vector3()

/**
 * Free camera: WASD/arrows move along the view, Q/E down/up, drag to look,
 * right/middle-drag to pan, scroll to move forward, Shift for 3× speed.
 */
export function FlyControls({ speed }: { speed: number }) {
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)
  const keys = useRef(new Set<string>())
  const velocity = useRef(new THREE.Vector3())

  useEffect(() => {
    const el = gl.domElement
    const euler = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ')
    euler.z = 0
    let drag: 'look' | 'pan' | null = null
    let lastX = 0
    let lastY = 0

    const onPointerDown = (e: PointerEvent) => {
      drag = e.button === 0 ? 'look' : 'pan'
      lastX = e.clientX
      lastY = e.clientY
      el.setPointerCapture(e.pointerId)
      el.style.cursor = drag === 'look' ? 'grabbing' : 'move'
    }
    const onPointerMove = (e: PointerEvent) => {
      if (!drag) return
      const dx = e.clientX - lastX
      const dy = e.clientY - lastY
      lastX = e.clientX
      lastY = e.clientY
      if (drag === 'look') {
        euler.y -= dx * LOOK_SENSITIVITY
        euler.x = THREE.MathUtils.clamp(euler.x - dy * LOOK_SENSITIVITY, -MAX_PITCH, MAX_PITCH)
        camera.quaternion.setFromEuler(euler)
      } else {
        const k = speed * 0.004
        camera.translateX(-dx * k)
        camera.translateY(dy * k)
      }
    }
    const onPointerUp = (e: PointerEvent) => {
      drag = null
      el.style.cursor = 'grab'
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId)
    }
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      camera.translateZ(THREE.MathUtils.clamp(e.deltaY, -60, 60) * speed * 0.004)
    }
    const onContextMenu = (e: Event) => e.preventDefault()
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTyping(e) || e.metaKey || e.ctrlKey || !MOVE_KEYS.has(e.code)) return
      keys.current.add(e.code)
      e.preventDefault()
    }
    const onKeyUp = (e: KeyboardEvent) => keys.current.delete(e.code)
    const onBlur = () => keys.current.clear()

    el.style.cursor = 'grab'
    el.addEventListener('pointerdown', onPointerDown)
    el.addEventListener('pointermove', onPointerMove)
    el.addEventListener('pointerup', onPointerUp)
    el.addEventListener('pointercancel', onPointerUp)
    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('contextmenu', onContextMenu)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    const pressed = keys.current
    const vel = velocity.current
    return () => {
      el.style.cursor = ''
      el.removeEventListener('pointerdown', onPointerDown)
      el.removeEventListener('pointermove', onPointerMove)
      el.removeEventListener('pointerup', onPointerUp)
      el.removeEventListener('pointercancel', onPointerUp)
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('contextmenu', onContextMenu)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
      pressed.clear()
      vel.set(0, 0, 0)
    }
  }, [camera, gl, speed])

  useFrame((_, delta) => {
    const k = keys.current
    const axis = (pos: string[], neg: string[]) =>
      (pos.some((c) => k.has(c)) ? 1 : 0) - (neg.some((c) => k.has(c)) ? 1 : 0)
    const dt = Math.min(delta, 0.1)

    // Horizontal input follows where the camera looks; Q/E is always world up/down.
    const wanted = tmpWanted
      .set(axis(['KeyD', 'ArrowRight'], ['KeyA', 'ArrowLeft']), 0, axis(['KeyS', 'ArrowDown'], ['KeyW', 'ArrowUp']))
      .applyQuaternion(camera.quaternion)
    wanted.y += axis(['KeyE', 'PageUp'], ['KeyQ', 'PageDown'])
    if (wanted.lengthSq() > 0) {
      const boost = k.has('ShiftLeft') || k.has('ShiftRight') ? 3 : 1
      wanted.normalize().multiplyScalar(speed * boost)
    }
    velocity.current.lerp(wanted, 1 - Math.exp(-dt * 8))
    if (velocity.current.lengthSq() > 1e-8) camera.position.addScaledVector(velocity.current, dt)
  })

  return null
}
