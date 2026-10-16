import * as THREE from 'three'
import type { Finish, FinishType } from '../lib/build'

export const FINISHES: { type: FinishType; label: string }[] = [
  { type: 'gloss', label: 'Gloss' },
  { type: 'metallic', label: 'Metallic' },
  { type: 'satin', label: 'Satin' },
  { type: 'matte', label: 'Matte' },
  { type: 'carbon', label: 'Carbon' },
  { type: 'chrome', label: 'Chrome' },
]

export const SWATCHES = ['#111214', '#f2f2f0', '#c8102e', '#f5c400', '#1e5bd8', '#2f8f4e', '#ff6a13', '#8a8f98']

let carbon: THREE.CanvasTexture | null = null

/** Procedural 2×2 twill carbon weave. Part UVs are in meters, so one tile ≈ 6 cm. */
function carbonTexture() {
  if (carbon) return carbon
  const size = 256
  const cells = 16
  const cell = size / cells
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  for (let i = 0; i < cells; i++) {
    for (let j = 0; j < cells; j++) {
      // Twill: tows alternate direction along diagonals, two cells at a time.
      const horizontal = (((i - j) % 4) + 4) % 4 < 2
      const x = i * cell
      const y = j * cell
      const g = horizontal ? ctx.createLinearGradient(x, y, x, y + cell) : ctx.createLinearGradient(x, y, x + cell, y)
      g.addColorStop(0, '#0d0d0f')
      g.addColorStop(0.5, '#3a3b40')
      g.addColorStop(1, '#0d0d0f')
      ctx.fillStyle = g
      ctx.fillRect(x, y, cell, cell)
    }
  }
  carbon = new THREE.CanvasTexture(canvas)
  carbon.colorSpace = THREE.SRGBColorSpace
  carbon.wrapS = carbon.wrapT = THREE.RepeatWrapping
  carbon.repeat.set(1 / 0.06, 1 / 0.06)
  carbon.anisotropy = 8
  return carbon
}

export function createFinishMaterial({ type, color }: Finish): THREE.MeshPhysicalMaterial {
  const base = { color: new THREE.Color(color), side: THREE.DoubleSide }
  switch (type) {
    case 'gloss':
      return new THREE.MeshPhysicalMaterial({ ...base, roughness: 0.25, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05 })
    case 'metallic':
      return new THREE.MeshPhysicalMaterial({ ...base, roughness: 0.35, metalness: 0.75, clearcoat: 1, clearcoatRoughness: 0.08 })
    case 'satin':
      return new THREE.MeshPhysicalMaterial({ ...base, roughness: 0.5, metalness: 0.1, clearcoat: 0.35, clearcoatRoughness: 0.4 })
    case 'matte':
      return new THREE.MeshPhysicalMaterial({ ...base, roughness: 0.9, metalness: 0 })
    case 'carbon':
      return new THREE.MeshPhysicalMaterial({
        side: THREE.DoubleSide,
        map: carbonTexture(),
        roughness: 0.3,
        metalness: 0.25,
        clearcoat: 1,
        clearcoatRoughness: 0.04,
      })
    case 'chrome':
      return new THREE.MeshPhysicalMaterial({ ...base, roughness: 0.04, metalness: 1 })
  }
}
