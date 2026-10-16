import * as THREE from 'three'
import type { ModelTransform, QuarterTurns } from './types'

const QUARTER = Math.PI / 2

function rotationMatrix([x, y, z]: QuarterTurns) {
  return new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(x * QUARTER, y * QUARTER, z * QUARTER))
}

/** Bounding box of a freshly loaded model, measured once before it's placed in the scene. */
export function measureBounds(object: THREE.Object3D) {
  object.updateMatrixWorld(true)
  return new THREE.Box3().setFromObject(object)
}

/**
 * Guesses orientation from proportions: for a car, height is the smallest side (→ Y)
 * and length the largest (→ Z). Which end is the front can't be guessed; the user flips it.
 */
export function autoOrient(bounds: THREE.Box3): QuarterTurns {
  let best: QuarterTurns = [0, 0, 0]
  let bestCost = Infinity
  for (let x = 0; x < 4; x++)
    for (let y = 0; y < 4; y++)
      for (let z = 0; z < 4; z++) {
        const turns: QuarterTurns = [x, y, z]
        const e = bounds.clone().applyMatrix4(rotationMatrix(turns)).getSize(new THREE.Vector3())
        if (e.y > e.x + 1e-6 || e.y > e.z + 1e-6 || e.x > e.z + 1e-6) continue
        const cost = turns.filter(Boolean).length * 10 + x + y + z
        if (cost < bestCost) [best, bestCost] = [turns, cost]
      }
  return best
}

export interface Placement {
  /** Applied innermost: quarter-turn rotation in radians. */
  rotation: [number, number, number]
  scale: number
  /** Applied outermost: centers the car and puts the wheels on the ground (y = 0). */
  position: [number, number, number]
  /** Width (X), height (Y), length (Z) in meters. */
  dimensions: [number, number, number]
}

/** Pure calculation: how to rotate, scale and move the raw model. The model itself is never modified. */
export function computePlacement(bounds: THREE.Box3, transform: ModelTransform): Placement {
  const box = bounds.clone().applyMatrix4(rotationMatrix(transform.rotation))
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  const length = Math.max(size.x, size.z)
  const scale = length > 0 ? transform.targetLength / length : 1

  return {
    rotation: transform.rotation.map((t) => t * QUARTER) as [number, number, number],
    scale,
    position: [-center.x * scale, -box.min.y * scale, -center.z * scale],
    dimensions: [size.x * scale, size.y * scale, size.z * scale],
  }
}
