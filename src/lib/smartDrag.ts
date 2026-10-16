import * as THREE from 'three'

/**
 * "Smart" part dragging on the horizontal plane:
 * - Axis lock: the first few pixels decide X or Z; the part then sticks to that line.
 *   A deliberate sideways pull (distance) or a quick sideways flick (speed) breaks it free.
 * - Center magnet: near the car's center line (x = 0) the part clicks onto it.
 * - Precision: slow mouse movement moves in fine steps; faster movement ramps up to 1:1.
 * Pure math, so it can be unit-tested without a scene.
 */

export interface DragOptions {
  axisLock: boolean
  centerSnap: boolean
  precision: boolean
}

export type DragAxis = 'x' | 'z'

export interface DragState {
  start: THREE.Vector3
  /** Where the part would be without snapping; the shown position derives from it. */
  virtual: THREE.Vector3
  axis: DragAxis | null
  free: boolean
  /** Sideways movement accumulated while locked (unscaled, meters). */
  perp: number
}

export interface DragInput {
  /** World movement of the cursor on the drag plane since the last event (meters). */
  dx: number
  dz: number
  /** Vertical movement (meters) when moving up/down instead of on the plane. */
  dy: number
  /** Cursor speed in pixels per millisecond. */
  speed: number
  /** Sideways part of the cursor speed relative to the locked axis (px/ms); 0 when unknown. */
  perpSpeed: number
  /** Meters per screen pixel at the part's distance, to turn pixel thresholds into world units. */
  metersPerPixel: number
  fine: boolean
}

export interface DragResult {
  position: THREE.Vector3
  axis: DragAxis | null
  free: boolean
  snappedToCenter: boolean
  gain: number
}

const DECIDE_PX = 8 // movement before an axis is chosen
const BREAK_PX = 55 // sideways pull that breaks the lock
const FLICK_SPEED = 1.4 // px/ms sideways that breaks the lock quickly
const SNAP_METERS = 0.025 // center magnet radius

export function startDrag(position: THREE.Vector3): DragState {
  return { start: position.clone(), virtual: position.clone(), axis: null, free: false, perp: 0 }
}

/** Cursor speed → movement gain: fine below ~0.1 px/ms, full speed from ~0.9 px/ms. */
export function precisionGain(speed: number, fine: boolean, precision: boolean) {
  if (fine) return 0.15
  if (!precision) return 1
  const t = THREE.MathUtils.smoothstep(speed, 0.08, 0.9)
  return THREE.MathUtils.lerp(0.3, 1, t)
}

export function stepDrag(state: DragState, input: DragInput, options: DragOptions): DragResult {
  const gain = precisionGain(input.speed, input.fine, options.precision)
  const v = state.virtual
  v.y += input.dy * gain

  if (!options.axisLock || state.free) {
    v.x += input.dx * gain
    v.z += input.dz * gain
  } else if (!state.axis) {
    // Undecided: move freely for a few pixels, then pick the dominant axis and settle onto its line.
    v.x += input.dx * gain
    v.z += input.dz * gain
    const moved = Math.hypot(v.x - state.start.x, v.z - state.start.z)
    if (moved > DECIDE_PX * input.metersPerPixel * gain) {
      state.axis = Math.abs(v.x - state.start.x) >= Math.abs(v.z - state.start.z) ? 'x' : 'z'
      if (state.axis === 'x') v.z = state.start.z
      else v.x = state.start.x
    }
  } else {
    const along = state.axis === 'x' ? input.dx : input.dz
    const across = state.axis === 'x' ? input.dz : input.dx
    if (state.axis === 'x') v.x += along * gain
    else v.z += along * gain
    // Hand wobble fades away; a deliberate sideways pull builds up.
    state.perp = state.perp * (Math.abs(along) > Math.abs(across) ? 0.92 : 1) + across
    const pulled = Math.abs(state.perp) > BREAK_PX * input.metersPerPixel
    const flicked = input.perpSpeed > FLICK_SPEED && Math.abs(state.perp) > BREAK_PX * 0.25 * input.metersPerPixel
    if (pulled || flicked) {
      state.free = true
      // Jump to where the cursor has been pulling.
      if (state.axis === 'x') v.z += state.perp
      else v.x += state.perp
    }
  }

  const position = v.clone()
  const snappedToCenter = options.centerSnap && Math.abs(v.x) < SNAP_METERS
  if (snappedToCenter) position.x = 0
  return { position, axis: state.free ? null : state.axis, free: state.free, snappedToCenter, gain }
}
