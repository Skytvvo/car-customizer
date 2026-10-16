import * as THREE from 'three'
import { TessellateModifier } from 'three/examples/jsm/modifiers/TessellateModifier.js'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { Deform } from '../lib/build'

export const NO_DEFORM: Deform = { bend: 0, sweep: 0, twist: 0, taper: 0 }

export const isDeformed = (d?: Deform) => !!d && (d.bend !== 0 || d.sweep !== 0 || d.twist !== 0 || d.taper !== 0)

/** Above this, splitting edges would get too heavy; such parts deform with the vertices they have. */
const TESSELLATE_LIMIT = 150_000
const SEGMENTS = 40 // target number of edge pieces along the span

/**
 * Returns a deformed copy of a part. Every mesh is moved into the part's own space, densified
 * (long edges split so a flat plane can curve), welded where the surface was smooth, bent, and
 * re-shaded. The input object is left untouched; the returned geometries are new.
 */
export function deformObject(root: THREE.Object3D, d: Deform): THREE.Object3D {
  root.updateMatrixWorld(true)
  const toRoot = root.matrixWorld.clone().invert()

  // 1. Geometry of every mesh, expressed in the root's local space.
  const pieces: { geometry: THREE.BufferGeometry; source: THREE.Mesh }[] = []
  root.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh || !mesh.geometry?.attributes.position) return
    const relative = toRoot.clone().multiply(mesh.matrixWorld)
    pieces.push({ geometry: mesh.geometry.clone().applyMatrix4(relative), source: mesh })
  })

  const box = new THREE.Box3()
  for (const p of pieces) {
    p.geometry.computeBoundingBox()
    box.union(p.geometry.boundingBox!)
  }
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  // Deform along the longer horizontal side: X for wings and splitters, Z for skirts.
  const alongZ = size.z > size.x
  const span = Math.max(alongZ ? size.z : size.x, 1e-6)
  const maxEdge = span / SEGMENTS

  const out = new THREE.Group()
  root.matrix.decompose(out.position, out.quaternion, out.scale)
  const deformed: THREE.BufferGeometry[] = []
  for (const { geometry, source } of pieces) {
    let geo = geometry
    const triangles = (geo.index ? geo.index.count : geo.attributes.position.count) / 3
    // Material groups only matter with several materials (extrusions always have cap/side groups).
    const multiMaterial = Array.isArray(source.material) && geo.groups.length > 1
    if (!multiMaterial) geo.clearGroups()
    if (triangles < TESSELLATE_LIMIT && !multiMaterial) {
      // Keep only what the tessellator understands, split long edges, then weld identical
      // vertices so smooth areas shade smoothly after bending (hard edges keep split normals).
      for (const name of Object.keys(geo.attributes)) {
        if (!['position', 'normal', 'uv', 'uv1', 'color'].includes(name)) geo.deleteAttribute(name)
      }
      geo = new TessellateModifier(maxEdge, 8).modify(geo)
      geo = mergeVertices(geo, 1e-5)
    }
    bendPositions(geo.attributes.position as THREE.BufferAttribute, d, center, span, alongZ)
    geo.computeVertexNormals()
    geo.computeBoundingBox()
    geo.computeBoundingSphere()
    const mesh = new THREE.Mesh(geo, source.material)
    mesh.castShadow = source.castShadow
    out.add(mesh)
    deformed.push(geo)
  }

  // Curling the ends up also lifts the mounting points beside the middle; drop the part back
  // so it still sits where it was mounted.
  if (d.bend > 0) {
    const after = new THREE.Box3()
    for (const geo of deformed) after.union(geo.boundingBox!)
    const drop = box.min.y - after.min.y
    for (const geo of deformed) {
      geo.translate(0, drop, 0)
      geo.computeBoundingSphere()
    }
  }
  return out
}

/**
 * Works in a local frame: s along the span (centered), u up, w across the span.
 * Order: taper → twist → bend (s,u plane) → sweep (s,w plane). Bends keep thickness (circular arcs).
 */
function bendPositions(
  position: THREE.BufferAttribute,
  d: Deform,
  center: THREE.Vector3,
  span: number,
  alongZ: boolean,
) {
  const half = span / 2
  const twist = THREE.MathUtils.degToRad(d.twist)
  const bend = THREE.MathUtils.degToRad(d.bend)
  const sweep = THREE.MathUtils.degToRad(d.sweep)
  const bendR = bend !== 0 ? span / bend : 0
  const sweepR = sweep !== 0 ? span / sweep : 0
  // For a span along Z, "back" is along −X so ends still sweep away from the viewer's right.
  const wSign = alongZ ? -1 : 1

  for (let i = 0; i < position.count; i++) {
    let s = (alongZ ? position.getZ(i) : position.getX(i)) - (alongZ ? center.z : center.x)
    let u = position.getY(i) - center.y
    let w = ((alongZ ? position.getX(i) : position.getZ(i)) - (alongZ ? center.x : center.z)) * wSign
    const t = THREE.MathUtils.clamp(s / half, -1, 1) // −1 … 1 along the span

    if (d.taper) {
      const k = 1 - d.taper * Math.abs(t)
      u *= k
      w *= k
    }
    if (twist) {
      const a = twist * t
      const cos = Math.cos(a)
      const sin = Math.sin(a)
      ;[u, w] = [u * cos - w * sin, u * sin + w * cos]
    }
    if (bendR) {
      // Circle centered above (or below) the middle: ends rise, thickness is kept.
      const phi = s / bendR
      const r = bendR - u
      ;[s, u] = [r * Math.sin(phi), bendR - r * Math.cos(phi)]
    }
    if (sweepR) {
      // Same arc seen from above; ends move toward −w (back).
      const phi = s / sweepR
      const r = sweepR + w
      ;[s, w] = [r * Math.sin(phi), r * Math.cos(phi) - sweepR]
    }

    w *= wSign
    if (alongZ) position.setXYZ(i, w + center.x, u + center.y, s + center.z)
    else position.setXYZ(i, s + center.x, u + center.y, w + center.z)
  }
  position.needsUpdate = true
}

export function disposeDeformed(object: THREE.Object3D) {
  object.traverse((o) => (o as THREE.Mesh).geometry?.dispose())
}
