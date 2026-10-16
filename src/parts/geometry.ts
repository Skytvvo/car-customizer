import * as THREE from 'three'

// Every part is built from extruded 2D shapes so texture coordinates are in meters on all
// faces; that keeps patterns like carbon weave the same size everywhere.

export type Profile = THREE.Vector2[]

/** Extrudes a profile drawn in the side view (x = car's z, y = up) across the car (X) by `thickness`, centered at `x`. */
export function sidePlate(profile: Profile, thickness: number, x = 0) {
  const geo = new THREE.ExtrudeGeometry(new THREE.Shape(profile), { depth: thickness, bevelEnabled: false })
  geo.rotateY(-Math.PI / 2) // extrusion → X, profile x → Z
  geo.translate(x + thickness / 2, 0, 0)
  return geo
}

/** Box with metric UVs, centered on the origin. */
export function box(sx: number, sy: number, sz: number) {
  const shape = new THREE.Shape([
    new THREE.Vector2(-sx / 2, -sy / 2),
    new THREE.Vector2(sx / 2, -sy / 2),
    new THREE.Vector2(sx / 2, sy / 2),
    new THREE.Vector2(-sx / 2, sy / 2),
  ])
  const geo = new THREE.ExtrudeGeometry(shape, { depth: sz, bevelEnabled: false })
  geo.translate(0, 0, -sz / 2)
  return geo
}

/** Rounded rectangle outline in 2D, for endplates and similar panels. */
export function roundedRect(x0: number, y0: number, x1: number, y1: number, r: number): Profile {
  const rr = Math.min(r, (x1 - x0) / 2, (y1 - y0) / 2)
  const pts: Profile = []
  const corner = (cx: number, cy: number, start: number) => {
    for (let i = 0; i <= 6; i++) {
      const a = start + (i / 6) * (Math.PI / 2)
      pts.push(new THREE.Vector2(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr))
    }
  }
  corner(x1 - rr, y0 + rr, -Math.PI / 2)
  corner(x1 - rr, y1 - rr, 0)
  corner(x0 + rr, y1 - rr, Math.PI / 2)
  corner(x0 + rr, y0 + rr, Math.PI)
  return pts
}

/**
 * Inverted NACA 4-digit airfoil (downforce: flatter top, curved underside).
 * Leading edge at x = 0, trailing edge at x = chord.
 */
export function airfoil(chord: number, thickness = 0.12, camber = 0.05, camberPos = 0.4, points = 28): THREE.Shape {
  const upper: Profile = []
  const lower: Profile = []
  const m = camber
  const p = camberPos
  for (let i = 0; i <= points; i++) {
    const x = (1 - Math.cos((i / points) * Math.PI)) / 2 // cosine spacing: more points near the edges
    const yt = 5 * thickness * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x ** 2 + 0.2843 * x ** 3 - 0.1036 * x ** 4)
    const yc = x < p ? (m / p ** 2) * (2 * p * x - x * x) : (m / (1 - p) ** 2) * (1 - 2 * p + 2 * p * x - x * x)
    // Flipped vertically for downforce.
    upper.push(new THREE.Vector2(x * chord, (yt - yc) * chord))
    lower.push(new THREE.Vector2(x * chord, (-yt - yc) * chord))
  }
  const shape = new THREE.Shape()
  shape.moveTo(upper[points].x, upper[points].y)
  for (let i = points - 1; i >= 0; i--) shape.lineTo(upper[i].x, upper[i].y)
  for (let i = 1; i <= points; i++) shape.lineTo(lower[i].x, lower[i].y)
  return shape
}

/** A wing element spanning X, chord along Z (leading edge toward +Z, the car's front), centered on the origin. */
export function wingElement(chord: number, span: number) {
  const geo = new THREE.ExtrudeGeometry(airfoil(chord), { depth: span, bevelEnabled: false })
  geo.rotateY(Math.PI / 2) // span → X, chord → −Z
  geo.translate(-span / 2, 0, chord / 2)
  return geo
}

export function disposeGroup(group: THREE.Object3D) {
  group.traverse((o) => (o as THREE.Mesh).geometry?.dispose())
}
