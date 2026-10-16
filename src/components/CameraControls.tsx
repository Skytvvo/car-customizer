import { useEffect, useRef, type RefObject } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import type { OrbitControls as OrbitControlsImpl } from 'three/examples/jsm/controls/OrbitControls.js'
import { poseFromDirection, viewPose, type CameraMode, type ViewRequest } from '../lib/camera'
import { clampFlySpeed, type Settings } from '../lib/settings'
import { isPointerLocked, requestPointerLock } from '../lib/pointerLock'
import { firstShownHit } from '../lib/build'

type Dims = [number, number, number]

/** Camera offset from the target is interpolated on a sphere, so the camera arcs around the car instead of cutting through it. */
interface Tween {
  fromTarget: THREE.Vector3
  toTarget: THREE.Vector3
  from: THREE.Spherical
  to: THREE.Spherical
  /** Shortest signed turn around the vertical axis. */
  dTheta: number
  t: number
  duration: number
}

const tmpOffset = new THREE.Vector3()

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)

interface RigProps {
  modelKey: string
  dims: Dims
  mode: CameraMode
  viewRequest: ViewRequest | null
  modelRef: RefObject<THREE.Object3D | null>
  /** Double-click focuses a point and switches back to orbit mode. */
  onFocus: () => void
  /** Pixels on the right covered by UI; framing fits the car into the remaining area. */
  inset: number
}

/** Frames new models, animates preset views, and keeps orbit/free-cam hand-offs seamless. */
export function CameraRig({ modelKey, dims, mode, viewRequest, modelRef, onFocus, inset: panelInset }: RigProps) {
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null
  const size = useThree((s) => s.size)
  // Only make room for the panel when it covers a minor part of the view; on narrow views it would squeeze the car too much.
  const inset = size.width >= panelInset * 2.6 ? panelInset : 0
  const aspect = (size.width - inset) / size.height

  // Shift the picture left so the orbit center sits in the middle of the visible area, not under the panel.
  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera
    if (inset > 0) cam.setViewOffset(size.width, size.height, inset / 2, 0, size.width, size.height)
    else cam.clearViewOffset()
  }, [camera, inset, size.width, size.height])
  const tween = useRef<Tween | null>(null)
  const prevMode = useRef(mode)
  const [w, h, l] = dims

  const flyTo = (toPos: THREE.Vector3, toTarget: THREE.Vector3, duration = 0.7) => {
    if (!controls) return
    // Start from a point straight ahead so the turn is smooth even if the free cam moved off the orbit target.
    const ahead = camera.getWorldDirection(new THREE.Vector3())
    const fromTarget = camera.position.clone().addScaledVector(ahead, camera.position.distanceTo(controls.target))
    const from = new THREE.Spherical().setFromVector3(tmpOffset.subVectors(camera.position, fromTarget))
    const to = new THREE.Spherical().setFromVector3(tmpOffset.subVectors(toPos, toTarget))
    // When looking straight down/up, azimuth is meaningless: keep the current heading.
    if (from.phi < 1e-5 || from.phi > Math.PI - 1e-5) from.theta = to.theta
    const dTheta = THREE.MathUtils.euclideanModulo(to.theta - from.theta + Math.PI, Math.PI * 2) - Math.PI
    tween.current = { fromTarget, toTarget, from, to, dTheta, t: 0, duration }
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
    if ('position' in viewRequest) {
      flyTo(new THREE.Vector3(...viewRequest.position), new THREE.Vector3(...viewRequest.target), 0.9)
      return
    }
    const pose =
      'view' in viewRequest
        ? viewPose(viewRequest.view, [w, h, l], aspect)
        : poseFromDirection(new THREE.Vector3(...viewRequest.dir), [w, h, l], aspect)
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
      if (isPointerLocked()) return
      const model = modelRef.current
      if (!model || !controls) return
      const rect = el.getBoundingClientRect()
      ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1)
      raycaster.setFromCamera(ndc, camera)
      const hit = firstShownHit(raycaster, model)
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
    controls.target.lerpVectors(tw.fromTarget, tw.toTarget, k)
    const s = new THREE.Spherical(
      THREE.MathUtils.lerp(tw.from.radius, tw.to.radius, k),
      THREE.MathUtils.lerp(tw.from.phi, tw.to.phi, k),
      tw.from.theta + tw.dTheta * k,
    )
    camera.position.setFromSpherical(s).add(controls.target)
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
const WHEEL_STEP = 50 // accumulated wheel delta per speed step (smooths trackpads)

const isTyping = (e: Event) =>
  !!(e.target as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable], dialog')

const tmpWanted = new THREE.Vector3()

interface FlyProps {
  /** Movement speed in m/s at fly speed ×1. */
  baseSpeed: number
  settings: Settings
  onSpeedChange: (flySpeed: number) => void
}

/**
 * Free camera: WASD/arrows move along the view, Q/E down/up, Shift for 3× speed.
 * Mouse look depends on the chosen style:
 * - drag: left-drag looks, right/middle-drag pans
 * - hold-right: hold the right button for locked mouse-look (Unreal/Unity editor), left-drag also looks, middle pans
 * - game: click to capture the mouse (FPS), Esc releases; right/middle-drag pans
 * G toggles the mouse lock in any style. Scrolling with the right button held changes speed.
 */
export function FlyControls({ baseSpeed, settings, onSpeedChange }: FlyProps) {
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)
  const keys = useRef(new Set<string>())
  const velocity = useRef(new THREE.Vector3())
  // Settings change often (speed via wheel); read them through a ref so listeners and held keys survive.
  const cfg = useRef({ baseSpeed, settings, onSpeedChange })
  cfg.current = { baseSpeed, settings, onSpeedChange }

  useEffect(() => {
    const el = gl.domElement
    const euler = new THREE.Euler()
    let drag: 'look' | 'pan' | null = null
    let captured: number | null = null
    let rightHeld = false
    let lastX = 0
    let lastY = 0
    let wheelAccum = 0

    const locked = () => document.pointerLockElement === el
    const speed = () => cfg.current.baseSpeed * cfg.current.settings.flySpeed
    const syncEuler = () => {
      // The camera may have been moved by a transition since free cam started.
      euler.setFromQuaternion(camera.quaternion, 'YXZ')
      euler.z = 0
    }
    const look = (dx: number, dy: number) => {
      const { sensitivity, invertY } = cfg.current.settings
      const k = LOOK_SENSITIVITY * sensitivity
      euler.y -= dx * k
      euler.x = THREE.MathUtils.clamp(euler.x - dy * k * (invertY ? -1 : 1), -MAX_PITCH, MAX_PITCH)
      camera.quaternion.setFromEuler(euler)
    }
    const pan = (dx: number, dy: number) => {
      const k = speed() * 0.004
      camera.translateX(-dx * k)
      camera.translateY(dy * k)
    }
    const updateCursor = () => {
      const mode = cfg.current.settings.lookMode
      el.style.cursor =
        drag === 'look' ? 'grabbing' : drag === 'pan' ? 'move' : mode === 'game' ? 'crosshair' : 'grab'
    }
    const startDrag = (kind: 'look' | 'pan', e: PointerEvent) => {
      drag = kind
      lastX = e.clientX
      lastY = e.clientY
      el.setPointerCapture(e.pointerId)
      captured = e.pointerId
    }

    const onPointerDown = (e: PointerEvent) => {
      syncEuler()
      if (locked()) return
      const mode = cfg.current.settings.lookMode
      if (mode === 'drag') {
        startDrag(e.button === 0 ? 'look' : 'pan', e)
      } else if (mode === 'hold-right') {
        if (e.button === 2) {
          rightHeld = true
          // Falls back to plain drag-look if the browser refuses the lock.
          drag = 'look'
          lastX = e.clientX
          lastY = e.clientY
          requestPointerLock(el)
        } else {
          startDrag(e.button === 0 ? 'look' : 'pan', e)
        }
      } else if (e.button === 0) {
        // Dragging still looks around if the browser refuses the lock.
        startDrag('look', e)
        requestPointerLock(el)
      } else {
        startDrag('pan', e)
      }
      updateCursor()
    }
    const onPointerMove = (e: PointerEvent) => {
      if (locked()) {
        look(e.movementX, e.movementY)
        return
      }
      if (!drag) return
      const dx = e.clientX - lastX
      const dy = e.clientY - lastY
      lastX = e.clientX
      lastY = e.clientY
      if (drag === 'look') look(dx, dy)
      else pan(dx, dy)
    }
    const onPointerUp = (e: PointerEvent) => {
      if (e.button === 2 && rightHeld) {
        rightHeld = false
        if (locked() && cfg.current.settings.lookMode === 'hold-right') document.exitPointerLock()
      }
      drag = null
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId)
      captured = null
      updateCursor()
    }
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const { wheel, flySpeed } = cfg.current.settings
      if (rightHeld || wheel === 'speed') {
        wheelAccum += e.deltaY
        if (Math.abs(wheelAccum) < WHEEL_STEP) return
        const steps = Math.trunc(wheelAccum / WHEEL_STEP)
        wheelAccum -= steps * WHEEL_STEP
        const next = clampFlySpeed(Math.round(flySpeed * 1.15 ** -steps * 100) / 100)
        // Apply locally right away so a fast burst of wheel events compounds before React re-renders.
        cfg.current.settings = { ...cfg.current.settings, flySpeed: next }
        cfg.current.onSpeedChange(next)
      } else {
        camera.translateZ(THREE.MathUtils.clamp(e.deltaY, -60, 60) * speed() * 0.004)
      }
    }
    const onContextMenu = (e: Event) => e.preventDefault()
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTyping(e) || e.metaKey || e.ctrlKey) return
      if (e.code === 'KeyG' && !e.repeat) {
        syncEuler()
        if (locked()) document.exitPointerLock()
        else requestPointerLock(el)
        return
      }
      if (!MOVE_KEYS.has(e.code)) return
      keys.current.add(e.code)
      e.preventDefault()
    }
    const onKeyUp = (e: KeyboardEvent) => keys.current.delete(e.code)
    const onBlur = () => keys.current.clear()
    const onLockChange = () => {
      syncEuler()
      if (locked()) {
        // Mouse-look takes over from any drag that started the lock.
        drag = null
        if (captured !== null && el.hasPointerCapture(captured)) el.releasePointerCapture(captured)
        captured = null
      } else {
        rightHeld = false
      }
      updateCursor()
    }

    syncEuler()
    updateCursor()
    el.addEventListener('pointerdown', onPointerDown)
    el.addEventListener('pointermove', onPointerMove)
    el.addEventListener('pointerup', onPointerUp)
    el.addEventListener('pointercancel', onPointerUp)
    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('contextmenu', onContextMenu)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    document.addEventListener('pointerlockchange', onLockChange)
    const pressed = keys.current
    const vel = velocity.current
    return () => {
      if (locked()) document.exitPointerLock()
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
      document.removeEventListener('pointerlockchange', onLockChange)
      pressed.clear()
      vel.set(0, 0, 0)
    }
  }, [camera, gl])

  // Update the idle cursor when the look style changes mid-flight.
  useEffect(() => {
    const el = gl.domElement
    if (el.style.cursor !== 'grabbing' && el.style.cursor !== 'move') {
      el.style.cursor = settings.lookMode === 'game' ? 'crosshair' : 'grab'
    }
  }, [settings.lookMode, gl])

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
      wanted.normalize().multiplyScalar(cfg.current.baseSpeed * cfg.current.settings.flySpeed * boost)
    }
    velocity.current.lerp(wanted, 1 - Math.exp(-dt * 8))
    if (velocity.current.lengthSq() > 1e-8) camera.position.addScaledVector(velocity.current, dt)
  })

  return null
}
