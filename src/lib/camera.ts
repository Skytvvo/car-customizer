import * as THREE from 'three'

export const FOV = 35

export type CameraMode = 'orbit' | 'fly'

/** The car's front faces +Z after normalization (use "Flip front" if it doesn't). */
export const VIEWS = {
  hero: { label: '3/4', dir: [0.95, 0.42, 1.05] },
  front: { label: 'Front', dir: [0, 0.12, 1] },
  side: { label: 'Side', dir: [1, 0.08, 0] },
  rear: { label: 'Rear', dir: [0, 0.12, -1] },
  // Slightly behind the car so the front points up the screen (straight down has no defined heading).
  top: { label: 'Top', dir: [0, 1, -0.001] },
  low: { label: 'Low', dir: [-0.9, 0.06, 1] },
} as const

export type CameraView = keyof typeof VIEWS

type Vec3 = [number, number, number]

/** A camera move: a preset, a direction to look from, or an exact pose. `n` changes on every request so repeats still trigger. */
export type ViewRequest = { n: number } & (
  | { view: CameraView }
  | { dir: Vec3 }
  | { position: Vec3; target: Vec3 }
)

/** Looking straight down/up has no heading; nudge it so the car's front points up the screen. */
function safeDirection(dir: THREE.Vector3) {
  const d = dir.clone().normalize()
  if (Math.abs(d.y) > 0.999) d.set(0, Math.sign(d.y), -0.001).normalize()
  // Orbit can't go under the floor; clamp to just above it.
  if (d.y < 0.02) d.setY(0.02).normalize()
  return d
}

/** Camera pose looking at the car from a direction, distanced so the whole car fits the viewport. */
export function poseFromDirection(
  direction: THREE.Vector3,
  [w, h, l]: [number, number, number],
  aspect = 16 / 10,
  margin = 1.15,
  halfV = THREE.MathUtils.degToRad(FOV / 2),
) {
  const radius = 0.5 * Math.hypot(w, h, l)
  const halfH = Math.atan(Math.tan(halfV) * aspect)
  const distance = (radius / Math.sin(Math.min(halfV, halfH))) * margin
  const target = new THREE.Vector3(0, h * 0.45, 0)
  return { position: safeDirection(direction).multiplyScalar(distance).add(target), target }
}

export function viewPose(
  view: CameraView,
  dims: [number, number, number],
  aspect?: number,
  margin?: number,
  halfV?: number,
) {
  return poseFromDirection(new THREE.Vector3(...VIEWS[view].dir), dims, aspect, margin, halfV)
}

/** Direction names on the compass/minimap, relative to the car (front = +Z, car's right = −X). */
export const HEADINGS = [
  { label: 'FRONT', deg: 0 },
  { label: 'RIGHT', deg: 90 },
  { label: 'REAR', deg: 180 },
  { label: 'LEFT', deg: -90 },
]

/** Clockwise bearing in degrees as seen on the front-up map: 0 = toward the front, 90 = toward the car's right. */
export const bearingOf = (x: number, z: number) => THREE.MathUtils.radToDeg(Math.atan2(-x, z))
