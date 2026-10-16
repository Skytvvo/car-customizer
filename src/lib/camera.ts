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

/** `n` changes on every request so clicking the same view twice still triggers it. */
export interface ViewRequest {
  view: CameraView
  n: number
}

/** Camera pose looking at the car from a preset direction, distanced so the whole car fits the viewport. */
export function viewPose(
  view: CameraView,
  [w, h, l]: [number, number, number],
  aspect = 16 / 10,
  margin = 1.15,
  halfV = THREE.MathUtils.degToRad(FOV / 2),
) {
  const radius = 0.5 * Math.hypot(w, h, l)
  const halfH = Math.atan(Math.tan(halfV) * aspect)
  const distance = (radius / Math.sin(Math.min(halfV, halfH))) * margin
  const target = new THREE.Vector3(0, h * 0.45, 0)
  const dir = new THREE.Vector3(...VIEWS[view].dir).normalize()
  return { position: dir.multiplyScalar(distance).add(target), target }
}
