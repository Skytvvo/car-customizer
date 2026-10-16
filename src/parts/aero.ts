import * as THREE from 'three'
import { roundedRect, sidePlate } from './geometry'
import type { PartParams } from '../lib/build'

// Add-on aero parts. Each builder returns a group in part space: X across the car,
// Y up, +Z toward the car's front, origin at the mounting point.

const num = (p: PartParams, key: string) => Number(p[key])
const flag = (p: PartParams, key: string) => Boolean(p[key])

function meshes(material: THREE.Material, geometries: THREE.BufferGeometry[]) {
  const group = new THREE.Group()
  for (const geo of geometries) group.add(new THREE.Mesh(geo, material))
  return group
}

/** Plate drawn in the top view (x across, y = forward), extruded downward by `thickness` from y = 0. */
function planPlate(outline: THREE.Vector2[], thickness: number) {
  const geo = new THREE.ExtrudeGeometry(new THREE.Shape(outline), { depth: thickness, bevelEnabled: false })
  geo.rotateX(Math.PI / 2) // shape y → +Z (forward), extrusion → −Y (down)
  return geo
}

/** Shape drawn in the cross-section (x outward, y up), extruded along the car's length, centered. */
function lengthwise(outline: THREE.Vector2[], length: number) {
  const geo = new THREE.ExtrudeGeometry(new THREE.Shape(outline), { depth: length, bevelEnabled: false })
  geo.translate(0, 0, -length / 2)
  return geo
}

/**
 * Ducktail / lip spoiler: a wedge on the trunk edge whose top sweeps up into a kicked lip.
 * Origin at the front edge, extends backward (−Z).
 */
export function buildDucktail(p: PartParams, material: THREE.Material) {
  const d = num(p, 'depth')
  const h = num(p, 'height')
  const kick = THREE.MathUtils.degToRad(num(p, 'kick'))
  const lip = Math.max(0.01, h * 0.35)
  const profile: THREE.Vector2[] = [new THREE.Vector2(0, 0)]
  for (let i = 1; i <= 16; i++) {
    const t = i / 16
    profile.push(new THREE.Vector2(-d * t, h * t ** 1.8))
  }
  profile.push(new THREE.Vector2(-d - lip * Math.cos(kick), h + lip * Math.sin(kick)))
  profile.push(new THREE.Vector2(-d - lip * Math.cos(kick) + 0.006, h + lip * Math.sin(kick) - 0.01))
  profile.push(new THREE.Vector2(-d, 0))
  return meshes(material, [sidePlate(profile, num(p, 'width'))])
}

/**
 * Front splitter: flat plate under the bumper, origin at its rear edge (hidden under the car);
 * `protrusion` is how far it sticks out ahead of the bumper. Optional winglets on the ends.
 */
export function buildSplitter(p: PartParams, material: THREE.Material) {
  const w = num(p, 'width')
  const t = num(p, 'thickness')
  const length = UNDER_BUMPER + num(p, 'protrusion')
  const geos = [planPlate(roundedRect(-w / 2, 0, w / 2, length, Math.min(0.09, length * 0.4)), t)]
  if (flag(p, 'winglets')) {
    const wh = num(p, 'wingletHeight')
    const back = UNDER_BUMPER * 0.6
    const outline = [
      new THREE.Vector2(length, -t),
      new THREE.Vector2(back, -t),
      new THREE.Vector2(back, wh * 0.6),
      new THREE.Vector2(length - 0.02, wh),
    ]
    for (const side of [-1, 1]) geos.push(sidePlate(outline, 0.008, side * (w / 2 - 0.004)))
  }
  return meshes(material, geos)
}
/** How far the splitter reaches back under the bumper from its visible front part. */
export const UNDER_BUMPER = 0.3

/**
 * Side skirts: a mirrored pair hanging below the sills. Origin on the car's center line,
 * at the top of the skirts; `gap` is the distance between their inner faces.
 */
export function buildSkirts(p: PartParams, material: THREE.Material) {
  const h = num(p, 'height')
  const d = num(p, 'depth')
  const length = num(p, 'length')
  // Cross-section: flat top under the sill, angled outer face, small kick-out at the bottom.
  const section = [
    new THREE.Vector2(0, 0),
    new THREE.Vector2(d * 0.7, 0),
    new THREE.Vector2(d, -h * 0.75),
    new THREE.Vector2(d * 1.08, -h),
    new THREE.Vector2(0, -h),
  ]
  const group = new THREE.Group()
  for (const side of [-1, 1]) {
    const mesh = new THREE.Mesh(lengthwise(section, length), material)
    mesh.position.x = (side * num(p, 'gap')) / 2
    mesh.scale.x = side // mirror for the left side (material is double-sided)
    group.add(mesh)
  }
  return group
}

/**
 * Rear diffuser: an upswept plate with vertical fins. Origin at the front edge under the car,
 * extends backward and up at `angle`.
 */
export function buildDiffuser(p: PartParams, material: THREE.Material) {
  const w = num(p, 'width')
  const d = num(p, 'depth')
  const fins = Math.round(num(p, 'fins'))
  const finH = num(p, 'finHeight')
  const plate = planPlate(roundedRect(-w / 2, -d, w / 2, 0, 0.02), 0.008)
  const geos: THREE.BufferGeometry[] = [plate]
  // Fins hang below the plate and grow toward the back.
  const finProfile = [
    new THREE.Vector2(0, -0.008),
    new THREE.Vector2(-d, -0.008),
    new THREE.Vector2(-d, -0.008 - finH),
    new THREE.Vector2(-d * 0.25, -0.008 - finH * 0.25),
  ]
  for (let i = 0; i < fins; i++) {
    const x = fins === 1 ? 0 : -w / 2 + 0.03 + (i * (w - 0.06)) / (fins - 1)
    geos.push(sidePlate(finProfile, 0.006, x))
  }
  const group = meshes(material, geos)
  group.rotation.x = THREE.MathUtils.degToRad(num(p, 'angle')) // tilt the tail up
  const wrapper = new THREE.Group()
  wrapper.add(group)
  return wrapper
}

/**
 * Canards (dive planes): mirrored small fins on the front bumper corners.
 * Origin on the center line; `gap` sets how far apart the pairs sit.
 */
export function buildCanards(p: PartParams, material: THREE.Material) {
  const size = num(p, 'size')
  const chord = num(p, 'chord')
  const angle = THREE.MathUtils.degToRad(num(p, 'angle'))
  const count = Math.round(num(p, 'count'))
  // Top view: tapered fin pointing outward (+x), leading edge forward.
  const outline = [
    new THREE.Vector2(0, -chord / 2),
    new THREE.Vector2(0, chord / 2),
    new THREE.Vector2(size, chord * 0.1),
    new THREE.Vector2(size * 0.92, -chord / 2),
  ]
  const group = new THREE.Group()
  for (const side of [-1, 1]) {
    for (let i = 0; i < count; i++) {
      const fin = new THREE.Mesh(planPlate(outline, 0.005), material)
      fin.position.set((side * num(p, 'gap')) / 2, -i * 0.07, -i * 0.02)
      fin.rotation.z = side * angle // outer tip tilts up
      fin.scale.x = side
      group.add(fin)
    }
  }
  return group
}
