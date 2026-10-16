import type * as THREE from 'three'
import type { Finish, PartInstance, PartParams, SceneQuery, Vec3 } from '../lib/build'
import type { PartAsset } from '../lib/types'
import { buildGtWing } from './gtWing'
import { buildCanards, buildDiffuser, buildDucktail, buildSkirts, buildSplitter, UNDER_BUMPER } from './aero'

type Dims = [number, number, number]
type Value = number | boolean | string
type Dynamic = Value | ((dims: Dims) => number)

export type ParamDef =
  | {
      key: string
      label: string
      kind: 'number'
      /** m → shown in cm, deg → °, ratio → %, count → plain number */
      unit: 'm' | 'deg' | 'ratio' | 'count'
      min: number
      max: number
      step: number
      default: number | ((dims: Dims) => number)
    }
  | { key: string; label: string; kind: 'toggle'; default: boolean }
  | { key: string; label: string; kind: 'select'; options: { value: string; label: string }[]; default: string }

export interface PartPreset {
  id: string
  name: string
  params: Record<string, Dynamic>
  finish?: Finish
}

export interface PartDef {
  kind: string
  name: string
  description: string
  params: ParamDef[]
  /** Starting points in the style of popular racing games; the first is the default. */
  presets: PartPreset[]
  defaultFinish: Finish
  /** Where a new part lands, using the car's size and surface. */
  place: (dims: Dims, scene: SceneQuery | null) => Vec3
  build: (params: PartParams, material: THREE.Material) => THREE.Group
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))
const CARBON: Finish = { type: 'carbon', color: '#ffffff' }
const GLOSS_BLACK: Finish = { type: 'gloss', color: '#111214' }
const MATTE_BLACK: Finish = { type: 'matte', color: '#111214' }

/** Width a wing should span: a bit inside the body (the measured width includes mirrors). */
const wingSpan = (share: number) => ([w]: Dims) => clamp(w * share, 1.0, 2.0)

export const CATALOG: Record<string, PartDef> = {
  'gt-wing': {
    kind: 'gt-wing',
    name: 'Rear wing',
    description: 'Adjustable rear wing on pedestal or swan-neck mounts.',
    params: [
      { key: 'mount', label: 'Mounts', kind: 'select', options: [{ value: 'pedestal', label: 'Pedestal' }, { value: 'swan', label: 'Swan neck' }], default: 'pedestal' },
      { key: 'span', label: 'Width', kind: 'number', unit: 'm', min: 0.9, max: 2.2, step: 0.01, default: wingSpan(0.86) },
      { key: 'height', label: 'Height', kind: 'number', unit: 'm', min: 0.04, max: 0.55, step: 0.01, default: 0.22 },
      { key: 'chord', label: 'Depth', kind: 'number', unit: 'm', min: 0.14, max: 0.45, step: 0.01, default: 0.27 },
      { key: 'angle', label: 'Angle', kind: 'number', unit: 'deg', min: -5, max: 25, step: 1, default: 8 },
      { key: 'spacing', label: 'Mount spacing', kind: 'number', unit: 'ratio', min: 0.2, max: 0.9, step: 0.01, default: 0.55 },
      { key: 'endplate', label: 'Endplate size', kind: 'number', unit: 'ratio', min: 0, max: 1, step: 0.01, default: 0.55 },
      { key: 'flap', label: 'Second element', kind: 'toggle', default: false },
      { key: 'gurney', label: 'Gurney flap', kind: 'toggle', default: true },
    ],
    presets: [
      { id: 'gt3', name: 'GT3 race', params: { mount: 'swan', span: wingSpan(0.9), height: 0.24, chord: 0.3, angle: 10, spacing: 0.5, endplate: 0.75, flap: false, gurney: true }, finish: CARBON },
      { id: 'time-attack', name: 'Time attack', params: { mount: 'pedestal', span: wingSpan(1), height: 0.42, chord: 0.36, angle: 16, spacing: 0.42, endplate: 1, flap: true, gurney: true }, finish: CARBON },
      { id: 'street', name: 'Street tuner', params: { mount: 'pedestal', span: wingSpan(0.8), height: 0.13, chord: 0.22, angle: 6, spacing: 0.6, endplate: 0.35, flap: false, gurney: false }, finish: GLOSS_BLACK },
      { id: 'drift', name: 'Drift', params: { mount: 'pedestal', span: wingSpan(0.86), height: 0.3, chord: 0.26, angle: 12, spacing: 0.55, endplate: 0.6, flap: false, gurney: true }, finish: MATTE_BLACK },
      { id: 'high-rise', name: '2000s high-rise', params: { mount: 'pedestal', span: wingSpan(0.84), height: 0.38, chord: 0.2, angle: 4, spacing: 0.78, endplate: 0.4, flap: false, gurney: false }, finish: { type: 'metallic', color: '#b9bec7' } },
    ],
    defaultFinish: CARBON,
    place: ([, h, l], scene) => {
      const z = -l * 0.4
      return [0, scene?.surfaceBelow(0, z) ?? h * 0.75, z]
    },
    build: buildGtWing,
  },

  ducktail: {
    kind: 'ducktail',
    name: 'Spoiler',
    description: 'Lip spoiler or ducktail on the trunk edge.',
    params: [
      { key: 'width', label: 'Width', kind: 'number', unit: 'm', min: 0.6, max: 2, step: 0.01, default: ([w]) => clamp(w * 0.7, 0.8, 1.6) },
      { key: 'depth', label: 'Depth', kind: 'number', unit: 'm', min: 0.05, max: 0.45, step: 0.01, default: 0.2 },
      { key: 'height', label: 'Height', kind: 'number', unit: 'm', min: 0.01, max: 0.25, step: 0.005, default: 0.08 },
      { key: 'kick', label: 'Kick angle', kind: 'number', unit: 'deg', min: 0, max: 45, step: 1, default: 22 },
    ],
    presets: [
      { id: 'lip', name: 'Lip spoiler', params: { depth: 0.1, height: 0.025, kick: 10 } },
      { id: 'ducktail', name: 'Ducktail', params: { depth: 0.22, height: 0.09, kick: 24 } },
      { id: 'big-duck', name: 'Big ducktail', params: { depth: 0.32, height: 0.17, kick: 32 } },
    ],
    defaultFinish: GLOSS_BLACK,
    place: ([, h, l], scene) => {
      const z = -l * 0.44
      return [0, scene?.surfaceBelow(0, z) ?? h * 0.7, z]
    },
    build: buildDucktail,
  },

  splitter: {
    kind: 'splitter',
    name: 'Front splitter',
    description: 'Flat lip under the front bumper, with optional winglets.',
    params: [
      { key: 'width', label: 'Width', kind: 'number', unit: 'm', min: 0.8, max: 2.2, step: 0.01, default: ([w]) => clamp(w * 0.9, 1.2, 2) },
      { key: 'protrusion', label: 'Sticks out', kind: 'number', unit: 'm', min: 0, max: 0.3, step: 0.005, default: 0.06 },
      { key: 'thickness', label: 'Thickness', kind: 'number', unit: 'm', min: 0.005, max: 0.04, step: 0.001, default: 0.012 },
      { key: 'winglets', label: 'Winglets', kind: 'toggle', default: false },
      { key: 'wingletHeight', label: 'Winglet height', kind: 'number', unit: 'm', min: 0.02, max: 0.15, step: 0.005, default: 0.06 },
    ],
    presets: [
      { id: 'street', name: 'Street lip', params: { protrusion: 0.04, thickness: 0.012, winglets: false } },
      { id: 'race', name: 'Race splitter', params: { protrusion: 0.12, thickness: 0.015, winglets: true, wingletHeight: 0.06 } },
      { id: 'time-attack', name: 'Time attack', params: { protrusion: 0.24, thickness: 0.02, winglets: true, wingletHeight: 0.1 } },
    ],
    defaultFinish: CARBON,
    place: ([, , l], scene) => {
      const z = l / 2 - UNDER_BUMPER
      return [0, scene?.surfaceAbove(0, l / 2 - 0.12) ?? 0.15, z]
    },
    build: buildSplitter,
  },

  skirts: {
    kind: 'skirts',
    name: 'Side skirts',
    description: 'A mirrored pair under the doors.',
    params: [
      { key: 'length', label: 'Length', kind: 'number', unit: 'm', min: 0.8, max: 3.5, step: 0.01, default: ([, , l]) => clamp(l * 0.46, 1.2, 2.6) },
      { key: 'gap', label: 'Distance apart', kind: 'number', unit: 'm', min: 1, max: 2.4, step: 0.005, default: ([w]) => clamp(w * 0.9, 1.3, 2.1) },
      { key: 'height', label: 'Height', kind: 'number', unit: 'm', min: 0.02, max: 0.2, step: 0.005, default: 0.07 },
      { key: 'depth', label: 'Sticks out', kind: 'number', unit: 'm', min: 0.01, max: 0.15, step: 0.005, default: 0.04 },
    ],
    presets: [
      { id: 'street', name: 'Street', params: { height: 0.06, depth: 0.03 } },
      { id: 'aero', name: 'Aero', params: { height: 0.08, depth: 0.06 } },
      { id: 'wide', name: 'Wide body', params: { height: 0.11, depth: 0.1 } },
    ],
    defaultFinish: GLOSS_BLACK,
    place: ([w], scene) => [0, scene?.surfaceAbove(w * 0.42, 0) ?? 0.22, 0],
    build: buildSkirts,
  },

  diffuser: {
    kind: 'diffuser',
    name: 'Rear diffuser',
    description: 'Upswept plate with fins under the rear bumper.',
    params: [
      { key: 'width', label: 'Width', kind: 'number', unit: 'm', min: 0.5, max: 2, step: 0.01, default: ([w]) => clamp(w * 0.7, 0.9, 1.5) },
      { key: 'depth', label: 'Length', kind: 'number', unit: 'm', min: 0.15, max: 0.8, step: 0.01, default: 0.42 },
      { key: 'angle', label: 'Angle', kind: 'number', unit: 'deg', min: 0, max: 25, step: 1, default: 10 },
      { key: 'fins', label: 'Fins', kind: 'number', unit: 'count', min: 0, max: 11, step: 1, default: 5 },
      { key: 'finHeight', label: 'Fin height', kind: 'number', unit: 'm', min: 0.02, max: 0.2, step: 0.005, default: 0.08 },
    ],
    presets: [
      { id: 'street', name: 'Street', params: { depth: 0.3, angle: 8, fins: 3, finHeight: 0.05 } },
      { id: 'race', name: 'Race', params: { depth: 0.45, angle: 12, fins: 5, finHeight: 0.1 } },
      { id: 'time-attack', name: 'Time attack', params: { depth: 0.6, angle: 15, fins: 7, finHeight: 0.14 } },
    ],
    defaultFinish: CARBON,
    place: ([, , l], scene) => {
      const z = -l / 2 + 0.35
      return [0, scene?.surfaceAbove(0, -l / 2 + 0.15) ?? 0.2, z]
    },
    build: buildDiffuser,
  },

  canards: {
    kind: 'canards',
    name: 'Canards',
    description: 'Mirrored dive planes on the front bumper corners.',
    params: [
      { key: 'gap', label: 'Distance apart', kind: 'number', unit: 'm', min: 1, max: 2.4, step: 0.005, default: ([w]) => clamp(w * 0.92, 1.3, 2.1) },
      { key: 'size', label: 'Size', kind: 'number', unit: 'm', min: 0.05, max: 0.3, step: 0.005, default: 0.14 },
      { key: 'chord', label: 'Depth', kind: 'number', unit: 'm', min: 0.04, max: 0.2, step: 0.005, default: 0.09 },
      { key: 'angle', label: 'Angle', kind: 'number', unit: 'deg', min: 0, max: 35, step: 1, default: 14 },
      { key: 'count', label: 'Per side', kind: 'number', unit: 'count', min: 1, max: 3, step: 1, default: 1 },
    ],
    presets: [
      { id: 'single', name: 'Single', params: { count: 1, size: 0.13, angle: 12 } },
      { id: 'double', name: 'Double', params: { count: 2, size: 0.14, angle: 14 } },
      { id: 'aggressive', name: 'Aggressive', params: { count: 2, size: 0.2, angle: 24 } },
    ],
    defaultFinish: CARBON,
    place: ([, h, l]) => [0, h * 0.28, l / 2 - 0.22],
    build: buildCanards,
  },
}

/** Default parameter values, then the preset's overrides. */
export function resolveParams(def: PartDef, dims: Dims, preset?: PartPreset): PartParams {
  const resolve = (v: Dynamic) => (typeof v === 'function' ? v(dims) : v)
  const params: PartParams = Object.fromEntries(def.params.map((p) => [p.key, resolve(p.default)]))
  for (const [key, value] of Object.entries(preset?.params ?? {})) params[key] = resolve(value)
  return params
}

export function formatParam(def: ParamDef, value: Value) {
  if (def.kind === 'toggle') return value ? 'On' : 'Off'
  if (def.kind === 'select') return def.options.find((o) => o.value === value)?.label ?? String(value)
  const v = value as number
  if (def.unit === 'm') return `${Math.round(v * 1000) / 10} cm`
  if (def.unit === 'deg') return `${Math.round(v)}°`
  if (def.unit === 'count') return String(Math.round(v))
  return `${Math.round(v * 100)}%`
}

/** Display name: "Rear wing · GT3 race", or the uploaded file's name. */
export function partName(part: PartInstance, assets: PartAsset[]) {
  if (part.kind === 'upload') return assets.find((a) => a.id === part.assetId)?.name ?? 'Missing part'
  const def = CATALOG[part.kind]
  const preset = def?.presets.find((p) => p.id === part.preset)
  return preset ? `${def.name} · ${preset.name}` : (def?.name ?? part.kind)
}
