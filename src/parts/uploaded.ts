import * as THREE from 'three'
import { expandFiles, loadModel, pickMainFile } from '../lib/loaders'
import { measureBounds } from '../lib/normalize'
import type { PartAsset } from '../lib/types'

// Uploaded parts are loaded once per session and cloned for every placement on a car.
// The template wraps the raw model so its base sits on the origin and units are meters.

const templates = new Map<string, Promise<THREE.Object3D>>()

/**
 * Parts are usually modeled in meters, centimeters or millimeters. Pick the unit that gives a
 * plausible car-part size (3 cm–5 m, up to a full body kit), preferring the one closest to 0.7 m.
 */
export function guessUnitScale(maxDimension: number) {
  const candidates = [1, 0.01, 0.001]
    .map((scale) => ({ scale, size: maxDimension * scale }))
    .filter((c) => c.size >= 0.03 && c.size <= 5)
    .sort((a, b) => Math.abs(Math.log(a.size / 0.7)) - Math.abs(Math.log(b.size / 0.7)))
  return candidates[0]?.scale ?? 1
}

/** Bottom-center of the part at the origin, scaled to meters. */
function makeTemplate(raw: THREE.Object3D, unitScale: number) {
  const bounds = measureBounds(raw)
  const center = bounds.getCenter(new THREE.Vector3())
  const inner = new THREE.Group()
  inner.add(raw)
  inner.position.set(-center.x, -bounds.min.y, -center.z)
  const template = new THREE.Group()
  template.name = 'uploaded-part'
  template.scale.setScalar(unitScale)
  template.add(inner)
  return template
}

/** Reads uploaded files into a library entry and primes the template cache. */
export async function importPartAsset(input: File[]): Promise<PartAsset> {
  const files = await expandFiles(input)
  const main = pickMainFile(files)
  const loaded = await loadModel(files, main.name)
  const size = measureBounds(loaded.object).getSize(new THREE.Vector3())
  const unitScale = guessUnitScale(Math.max(size.x, size.y, size.z))
  const asset: PartAsset = {
    id: crypto.randomUUID(),
    name: main.name.split('/').pop()!.replace(/\.[^.]+$/, ''),
    mainFile: main.name,
    files,
    unitScale,
    size: size.multiplyScalar(unitScale).toArray() as [number, number, number],
    createdAt: Date.now(),
  }
  templates.set(asset.id, Promise.resolve(makeTemplate(loaded.object, unitScale)))
  return asset
}

export function loadPartTemplate(asset: PartAsset): Promise<THREE.Object3D> {
  let template = templates.get(asset.id)
  if (!template) {
    template = loadModel(asset.files, asset.mainFile).then((loaded) => makeTemplate(loaded.object, asset.unitScale))
    templates.set(asset.id, template)
  }
  return template
}

export function forgetPartTemplate(id: string) {
  templates.delete(id)
}

/**
 * Scale that makes a new part a sensible size on this car: real size if it fits the car
 * (anything up to a full body kit), otherwise ~60% of the car's width.
 */
export function initialFit(asset: PartAsset, [width, , length]: [number, number, number]) {
  const largest = Math.max(...asset.size)
  if (largest >= 0.03 && largest <= length * 1.15) return 1
  return (width * 0.6) / Math.max(largest, 1e-6)
}
