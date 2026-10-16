import type * as THREE from 'three'
import type { Finish, PartParams } from '../lib/build'
import { buildGtWing } from './gtWing'

type Dims = [number, number, number]

export type ParamDef =
  | {
      key: string
      label: string
      kind: 'number'
      /** m → shown in cm, deg → °, ratio → % */
      unit: 'm' | 'deg' | 'ratio'
      min: number
      max: number
      step: number
      default: number | ((dims: Dims) => number)
    }
  | { key: string; label: string; kind: 'toggle'; default: boolean }

export interface PartDef {
  kind: string
  name: string
  description: string
  params: ParamDef[]
  defaultFinish: Finish
  /** Where a new part lands: a point on the car's surface found by looking straight down at (x, z). */
  anchor: (dims: Dims) => { x: number; z: number }
  build: (params: PartParams, material: THREE.Material) => THREE.Group
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

/** Built-in parametric parts (NFS Carbon "Autosculpt" style): sliders shape them to fit any car. */
export const CATALOG: Record<string, PartDef> = {
  'gt-wing': {
    kind: 'gt-wing',
    name: 'GT wing',
    description: 'Pedestal-mount rear wing with adjustable span, height and angle.',
    params: [
      { key: 'span', label: 'Width', kind: 'number', unit: 'm', min: 0.9, max: 2.2, step: 0.01, default: ([w]) => clamp(w * 0.86, 1.1, 1.9) },
      { key: 'height', label: 'Height', kind: 'number', unit: 'm', min: 0.04, max: 0.55, step: 0.01, default: 0.22 },
      { key: 'chord', label: 'Depth', kind: 'number', unit: 'm', min: 0.14, max: 0.45, step: 0.01, default: 0.27 },
      { key: 'angle', label: 'Angle', kind: 'number', unit: 'deg', min: -5, max: 25, step: 1, default: 8 },
      { key: 'spacing', label: 'Upright spacing', kind: 'number', unit: 'ratio', min: 0.2, max: 0.9, step: 0.01, default: 0.55 },
      { key: 'endplate', label: 'Endplate size', kind: 'number', unit: 'ratio', min: 0, max: 1, step: 0.01, default: 0.55 },
      { key: 'flap', label: 'Second element', kind: 'toggle', default: false },
      { key: 'gurney', label: 'Gurney flap', kind: 'toggle', default: true },
    ],
    defaultFinish: { type: 'carbon', color: '#ffffff' },
    anchor: ([, , l]) => ({ x: 0, z: -l * 0.4 }),
    build: buildGtWing,
  },
}

export function defaultParams(def: PartDef, dims: Dims): PartParams {
  return Object.fromEntries(
    def.params.map((p) => [p.key, typeof p.default === 'function' ? p.default(dims) : p.default]),
  )
}

export function formatParam(def: ParamDef, value: number | boolean) {
  if (def.kind === 'toggle') return value ? 'On' : 'Off'
  const v = value as number
  if (def.unit === 'm') return `${Math.round(v * 100)} cm`
  if (def.unit === 'deg') return `${Math.round(v)}°`
  return `${Math.round(v * 100)}%`
}
