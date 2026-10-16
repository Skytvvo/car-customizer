import * as THREE from 'three'
import { box, roundedRect, sidePlate, wingElement } from './geometry'
import type { PartParams } from '../lib/build'

export interface GtWingParams {
  span: number
  chord: number
  height: number
  angle: number // degrees, trailing edge up
  spacing: number // upright spacing as a share of the span
  endplate: number // 0–1
  flap: boolean
  gurney: boolean
}

const UPRIGHT_THICKNESS = 0.014
const ENDPLATE_THICKNESS = 0.008

/**
 * Pedestal-mount GT wing. Origin at the mounting feet (sits on the trunk/hatch),
 * span across X, front toward +Z.
 */
export function buildGtWing(raw: PartParams, material: THREE.Material) {
  const p = raw as unknown as GtWingParams
  const group = new THREE.Group()
  group.name = 'gt-wing'
  const add = (geo: THREE.BufferGeometry) => {
    const mesh = new THREE.Mesh(geo, material)
    mesh.castShadow = true
    group.add(mesh)
    return mesh
  }

  const c = p.chord
  const a = THREE.MathUtils.degToRad(p.angle)
  const center = p.height + 0.035 // chord line height at mid-chord
  // Height of the chord line at a given z, following the wing's angle.
  const lineY = (z: number) => center - z * Math.sin(a)

  // Main plane (+ optional Gurney flap on the trailing edge).
  const main = new THREE.Group()
  main.position.set(0, center, 0)
  main.rotation.x = a
  main.add(new THREE.Mesh(wingElement(c, p.span), material))
  if (p.gurney) {
    const gurney = new THREE.Mesh(box(p.span, 0.018, 0.004), material)
    gurney.position.set(0, 0.009, -c / 2 + 0.002)
    main.add(gurney)
  }
  group.add(main)

  // Second element: a smaller, steeper flap above and behind the main plane.
  const flapChord = c * 0.42
  if (p.flap) {
    const flap = new THREE.Group()
    flap.position.set(0, lineY(-c / 2) + c * 0.07, -c / 2 - flapChord * 0.2)
    flap.rotation.x = a + THREE.MathUtils.degToRad(18)
    flap.add(new THREE.Mesh(wingElement(flapChord, p.span), material))
    group.add(flap)
  }

  // Uprights: tapered plates from the feet up into the wing's underside, plus foot plates.
  const halfGap = (p.span * p.spacing) / 2
  for (const x of [-halfGap, halfGap]) {
    const zt1 = c * 0.12
    const zt2 = -c * 0.32
    const profile = [
      new THREE.Vector2(c * 0.3, 0),
      new THREE.Vector2(-c * 0.38, 0),
      new THREE.Vector2(zt2, lineY(zt2) - 0.004),
      new THREE.Vector2(zt1, lineY(zt1) - 0.004),
    ]
    add(sidePlate(profile, UPRIGHT_THICKNESS, x))
    const foot = add(box(0.05, 0.008, c * 0.8))
    foot.position.set(x, 0.004, -c * 0.04)
  }

  // Endplates: vertical panels covering the wing tips (taller with a flap).
  if (p.endplate > 0) {
    const plateH = 0.06 + p.endplate * 0.26
    const front = c * 0.6
    const back = -c * 0.62 - (p.flap ? flapChord * 0.75 : 0)
    const bottom = Math.min(lineY(front), lineY(back)) - plateH * 0.45
    const top = Math.max(lineY(front), lineY(back)) + plateH * 0.55
    const outline = roundedRect(back, bottom, front, top, 0.03)
    for (const side of [-1, 1]) {
      add(sidePlate(outline, ENDPLATE_THICKNESS, side * (p.span / 2 + ENDPLATE_THICKNESS / 2)))
    }
  }

  return group
}
