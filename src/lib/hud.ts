import * as THREE from 'three'
import type { CameraMode } from './camera'

/**
 * Live camera state written by the 3D scene every frame and read by the DOM overlays
 * (minimap, compass). A plain mutable object avoids re-rendering React 60 times a second.
 */
export interface HudState {
  position: THREE.Vector3
  forward: THREE.Vector3
  /** Orbit pivot; null in free cam. */
  target: THREE.Vector3 | null
  mode: CameraMode
  /** Horizontal field of view in radians. */
  fovH: number
  /** Width (X), height (Y), length (Z) of the car in meters. */
  dims: [number, number, number]
  /** Top-down outline of the car, front up; covers ±silhouetteHalf meters around the origin. */
  silhouette: HTMLCanvasElement | null
  silhouetteHalf: number
}

export const createHudState = (): HudState => ({
  position: new THREE.Vector3(),
  forward: new THREE.Vector3(0, 0, -1),
  target: null,
  mode: 'orbit',
  fovH: 1,
  dims: [1.8, 1.45, 4.5],
  silhouette: null,
  silhouetteHalf: 1,
})
