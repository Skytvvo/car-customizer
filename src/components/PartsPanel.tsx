import { useRef, useState, type ReactNode } from 'react'
import type { Build, FinishType, MeshIndex, PartInstance } from '../lib/build'
import { meshLabel } from '../lib/build'
import type { PartAsset } from '../lib/types'
import { ACCEPT } from '../lib/loaders'
import { CATALOG, formatParam, partName } from '../parts/catalog'
import { FINISHES, SWATCHES } from '../parts/finishes'
import { isDeformed, NO_DEFORM } from '../parts/deform'
import type { Deform } from '../lib/build'
import type { GizmoMode, PickMode } from './PartsLayer'
import { tip } from '../lib/tip'
import {
  AlignCenterVertical,
  Copy,
  Eye,
  EyeOff,
  MousePointerClick,
  Move,
  Plus,
  Rotate3d,
  RotateCcw,
  Scaling,
  Trash2,
  Upload,
  type LucideIcon,
} from 'lucide-react'

interface Props {
  build: Build
  assets: PartAsset[]
  meshIndex: MeshIndex | null
  selectedId: string | null
  gizmoMode: GizmoMode
  pickMode: PickMode
  onAdd: (kind: string, presetId?: string) => void
  onAddAsset: (assetId: string) => void
  onUploadParts: (files: File[]) => void
  onDeleteAsset: (asset: PartAsset) => void
  onSelect: (id: string | null) => void
  /** `label` names the step in the history; edits sharing `key` within a moment merge into one step. */
  onUpdate: (id: string, patch: Partial<PartInstance>, label: string, key?: string) => void
  onApplyPreset: (id: string, presetId: string) => void
  onRemove: (id: string) => void
  onDuplicate: (id: string) => void
  onGizmoMode: (mode: GizmoMode) => void
  onPickMode: (mode: PickMode) => void
  onToggleHidden: (path: string) => void
  onShowAll: () => void
}

const SHAPE_CONTROLS: { key: keyof Deform; label: string; hint: string; min: number; max: number; step: number }[] = [
  { key: 'bend', label: 'Bend', hint: 'Curl the ends up (or down)', min: -60, max: 60, step: 1 },
  { key: 'sweep', label: 'Sweep', hint: 'Curve the ends back (or forward), seen from above', min: -60, max: 60, step: 1 },
  { key: 'twist', label: 'Twist', hint: 'Twist the two ends in opposite directions', min: -60, max: 60, step: 1 },
  { key: 'taper', label: 'Taper', hint: 'Make the part thinner toward its ends', min: 0, max: 0.9, step: 0.01 },
]

const FINISH_TIPS: Record<FinishType, string> = {
  original: "Keeps the uploaded model's own materials and textures.",
  gloss: 'Shiny paint with a clear coat.',
  metallic: 'Paint with metal flake and clear coat.',
  satin: 'Soft sheen between gloss and matte.',
  matte: 'Flat, no reflections.',
  carbon: 'Twill-weave carbon fiber under clear coat.',
  chrome: 'Mirror metal. Pick a color for tinted chrome (gold, black chrome…).',
}

const GIZMO_MODES: { mode: GizmoMode; label: string; icon: LucideIcon; key: string; tip: string }[] = [
  {
    mode: 'translate',
    label: 'Move',
    icon: Move,
    key: 'W',
    tip: 'Drag the part itself to slide it: it locks to the axis you start along (pull sideways to break free) and snaps to the center line. Shift = fine, Alt = up/down. Or drag the arrows.',
  },
  { mode: 'rotate', label: 'Rotate', icon: Rotate3d, key: 'E', tip: 'Drag the rings to turn the part around each axis.' },
  { mode: 'scale', label: 'Scale', icon: Scaling, key: 'R', tip: 'Drag a handle to stretch along one axis, or the center to resize evenly.' },
]

export default function PartsPanel(p: Props) {
  const [openKind, setOpenKind] = useState<string | null>(null)
  const uploadInput = useRef<HTMLInputElement>(null)
  const selected = p.build.parts.find((part) => part.id === p.selectedId) ?? null
  const def = selected && selected.kind !== 'upload' ? CATALOG[selected.kind] : null
  const name = selected ? partName(selected, p.assets) : ''
  const update = (patch: Partial<PartInstance>, label: string, key?: string) =>
    selected && p.onUpdate(selected.id, patch, label, key)

  return (
    <div className="parts">
      <section>
        <h4>Add part</h4>
        <div className="catalog">
          {Object.values(CATALOG).map((d) => (
            <button
              key={d.kind}
              className="catalog-card"
              aria-expanded={openKind === d.kind}
              onClick={() => setOpenKind(openKind === d.kind ? null : d.kind)}
              {...tip(d.name, `${d.description} Click to see styles.`)}
            >
              {ICONS[d.kind]}
              <span>{d.name}</span>
            </button>
          ))}
        </div>
        {openKind && (
          <div className="presets" role="group" aria-label={`${CATALOG[openKind].name} styles`}>
            {CATALOG[openKind].presets.map((preset) => (
              <button
                key={preset.id}
                className="preset"
                onClick={() => p.onAdd(openKind, preset.id)}
                {...tip(`Add ${preset.name}`, `Adds a ${CATALOG[openKind].name.toLowerCase()} in this style. You can change every setting afterwards.`)}
              >
                <Plus size={13} /> {preset.name}
              </button>
            ))}
          </div>
        )}
      </section>

      <section>
        <h4>My parts</h4>
        <input
          ref={uploadInput}
          type="file"
          multiple
          accept={ACCEPT}
          hidden
          onChange={(e) => {
            const files = [...(e.target.files ?? [])]
            e.target.value = ''
            if (files.length) p.onUploadParts(files)
          }}
        />
        <button
          className="btn btn-block"
          onClick={() => uploadInput.current?.click()}
          {...tip('Upload part', 'Add your own 3D part (.glb, .gltf, .fbx, .obj or a .zip with textures) to your parts library. Its units are detected automatically.')}
        >
          <Upload size={15} /> Upload part
        </button>
        {p.assets.length > 0 && (
          <ul className="part-list">
            {p.assets.map((asset) => (
              <li key={asset.id}>
                <button className="part-name" onClick={() => p.onAddAsset(asset.id)} {...tip(`Add ${asset.name}`, 'Puts it on the car, then click where it should go.')}>
                  <Plus size={13} /> {asset.name}
                  <small> {asset.size.map((v) => Math.round(v * 100)).join('×')} cm</small>
                </button>
                <button className="btn-icon subtle" onClick={() => p.onDeleteAsset(asset)} {...tip('Delete from library', 'Removes the uploaded file. Cars using it will show it as missing.')}>
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {p.build.parts.length > 0 && (
        <section>
          <h4>Installed</h4>
          <ul className="part-list">
            {p.build.parts.map((part) => (
              <li key={part.id} className={part.id === p.selectedId ? 'active' : undefined}>
                <button
                  className="part-name"
                  onClick={() => p.onSelect(part.id === p.selectedId ? null : part.id)}
                  {...tip(partName(part, p.assets), 'Select to edit. You can also click the part on the car.', 'Esc')}
                >
                  {partName(part, p.assets)}
                </button>
                <button className="btn-icon subtle" onClick={() => p.onDuplicate(part.id)} {...tip('Duplicate', 'Makes a copy slightly above, ready to move.')}>
                  <Copy size={14} />
                </button>
                <button className="btn-icon subtle" onClick={() => p.onRemove(part.id)} {...tip('Remove', 'Takes the part off the car (undo with Ctrl+Z).', 'Delete')}>
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {selected && (
        <section className="part-editor">
          <h4>{name}</h4>

          {def && (
            <div className="presets" role="group" aria-label="Style">
              {def.presets.map((preset) => (
                <button
                  key={preset.id}
                  className="preset"
                  aria-pressed={selected.preset === preset.id}
                  onClick={() => p.onApplyPreset(selected.id, preset.id)}
                  {...tip(preset.name, 'Restyle with this preset. Position, rotation and size stay.')}
                >
                  {preset.name}
                </button>
              ))}
            </div>
          )}

          <div className="segmented small" role="group" aria-label="Gizmo">
            {GIZMO_MODES.map((g) => (
              <button key={g.mode} aria-pressed={p.gizmoMode === g.mode} onClick={() => p.onGizmoMode(g.mode)} {...tip(g.label, g.tip, g.key)}>
                <g.icon size={14} /> {g.label}
              </button>
            ))}
          </div>
          <div className="btn-row">
            <button
              className={`btn${p.pickMode === 'place' ? ' active' : ''}`}
              onClick={() => p.onPickMode(p.pickMode === 'place' ? null : 'place')}
              {...tip('Place on body', 'Then click a spot on the car: the part jumps there and sits on the surface. Near the middle it snaps to the center line.')}
            >
              <MousePointerClick size={14} /> Place
            </button>
            <button
              className="btn"
              onClick={() => update({ position: [0, selected.position[1], selected.position[2]] }, `Centered ${name}`)}
              {...tip('Center', "Moves the part onto the car's center line (left–right middle).")}
            >
              <AlignCenterVertical size={14} /> Center
            </button>
            <button
              className="btn"
              onClick={() => {
                const fit = Number(selected.params.fit ?? 1)
                update({ rotation: [0, 0, 0], scale: [fit, fit, fit] }, `Reset ${name}`)
              }}
              {...tip('Reset', 'Straightens the rotation and restores the original size. Position stays.')}
            >
              <RotateCcw size={14} /> Reset
            </button>
          </div>

          {def && (
            <div className="params">
              {def.params.map((param) => {
                const key = `param:${selected.id}:${param.key}`
                const set = (value: number | boolean | string) =>
                  update({ params: { ...selected.params, [param.key]: value } }, `${param.label}: ${name}`, key)
                if (param.kind === 'toggle') {
                  return (
                    <label key={param.key} className="check-row">
                      <input type="checkbox" checked={Boolean(selected.params[param.key])} onChange={(e) => set(e.target.checked)} />
                      {param.label}
                    </label>
                  )
                }
                if (param.kind === 'select') {
                  return (
                    <div key={param.key} className="select-field">
                      <span>{param.label}</span>
                      <div className="chips">
                        {param.options.map((o) => (
                          <button key={o.value} className="chip" aria-pressed={selected.params[param.key] === o.value} onClick={() => set(o.value)}>
                            {o.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )
                }
                return (
                  <div key={param.key} className="slider-field compact">
                    <label htmlFor={`param-${param.key}`}>{param.label}</label>
                    <input
                      id={`param-${param.key}`}
                      type="range"
                      min={param.min}
                      max={param.max}
                      step={param.step}
                      value={Number(selected.params[param.key])}
                      onChange={(e) => set(Number(e.target.value))}
                    />
                    <output>{formatParam(param, selected.params[param.key])}</output>
                  </div>
                )
              })}
            </div>
          )}

          <div className="shape">
            <div className="shape-head">
              <span className="label">Shape</span>
              {isDeformed(selected.deform) && (
                <button
                  className="btn-link"
                  onClick={() => update({ deform: undefined }, `Straightened ${name}`)}
                  {...tip('Straighten', 'Removes all bend, sweep, twist and taper.')}
                >
                  Straighten
                </button>
              )}
            </div>
            {SHAPE_CONTROLS.map((c) => {
              const value = selected.deform?.[c.key] ?? 0
              const set = (v: number) =>
                update({ deform: { ...NO_DEFORM, ...selected.deform, [c.key]: v } }, `${c.label}: ${name}`, `deform:${selected.id}:${c.key}`)
              return (
                <div key={c.key} className="slider-field compact">
                  <label htmlFor={`shape-${c.key}`} {...tip(c.label, `${c.hint}. Double-click the slider to reset.`)}>
                    {c.label}
                  </label>
                  <input
                    id={`shape-${c.key}`}
                    type="range"
                    min={c.min}
                    max={c.max}
                    step={c.step}
                    value={value}
                    onChange={(e) => set(Number(e.target.value))}
                    onDoubleClick={() => set(0)}
                  />
                  <output>{c.key === 'taper' ? `${Math.round(value * 100)}%` : `${value}°`}</output>
                </div>
              )
            })}
          </div>

          <div className="finish">
            <span className="label">Finish</span>
            <div className="chips">
              {FINISHES.filter((f) => f.type !== 'original' || selected.kind === 'upload').map((f) => (
                <button
                  key={f.type}
                  className="chip"
                  aria-pressed={selected.finish.type === f.type}
                  onClick={() => update({ finish: { ...selected.finish, type: f.type as FinishType } }, `${f.label} finish: ${name}`)}
                  {...tip(f.label, FINISH_TIPS[f.type])}
                >
                  {f.label}
                </button>
              ))}
            </div>
            {selected.finish.type !== 'carbon' && selected.finish.type !== 'original' && (
              <div className="swatches">
                {SWATCHES.map((color) => (
                  <button
                    key={color}
                    className="swatch"
                    style={{ background: color }}
                    aria-label={`Color ${color}`}
                    aria-pressed={selected.finish.color.toLowerCase() === color}
                    onClick={() => update({ finish: { ...selected.finish, color } }, `Color: ${name}`)}
                  />
                ))}
                <input
                  type="color"
                  value={selected.finish.color}
                  onChange={(e) =>
                    update({ finish: { ...selected.finish, color: e.target.value } }, `Color: ${name}`, `color:${selected.id}`)
                  }
                  aria-label="Custom color"
                />
              </div>
            )}
          </div>
        </section>
      )}

      <section>
        <h4>Original parts</h4>
        <button
          className={`btn btn-block${p.pickMode === 'hide' ? ' active' : ''}`}
          onClick={() => p.onPickMode(p.pickMode === 'hide' ? null : 'hide')}
          {...tip('Hide parts by clicking', 'Then click pieces of the car (stock spoiler, badges, wipers) to hide them. Click again here or press Esc when done.', 'Esc')}
        >
          <EyeOff size={15} /> {p.pickMode === 'hide' ? 'Done hiding' : 'Hide parts by clicking'}
        </button>
        <p className="hint">Remove the stock spoiler, badges or wipers. Some models merge parts into one mesh.</p>
        {p.build.hidden.length > 0 && (
          <>
            <ul className="part-list">
              {p.build.hidden.map((path) => (
                <li key={path}>
                  <span className="part-name muted">{meshLabel(p.meshIndex?.byPath.get(path), path)}</span>
                  <button className="btn-icon subtle" onClick={() => p.onToggleHidden(path)} {...tip('Show again', 'Brings this hidden piece back.')}>
                    <Eye size={14} />
                  </button>
                </li>
              ))}
            </ul>
            <button className="btn" onClick={p.onShowAll} {...tip('Show all', 'Brings back every hidden piece of the car.')}>
              <Eye size={14} /> Show all
            </button>
          </>
        )}
      </section>
    </div>
  )
}

const svg = (children: ReactNode) => (
  <svg viewBox="0 0 64 32" width="52" height="26" aria-hidden fill="currentColor">
    {children}
  </svg>
)

const ICONS: Record<string, ReactNode> = {
  'gt-wing': svg(
    <>
      <path d="M6 10 Q32 4 58 10 L58 14 Q32 9 6 14 Z" />
      <rect x="4" y="6" width="3" height="12" rx="1" />
      <rect x="57" y="6" width="3" height="12" rx="1" />
      <path d="M20 13 L18 28 L22 28 L24 13 Z M44 13 L46 28 L42 28 L40 13 Z" opacity="0.7" />
    </>,
  ),
  ducktail: svg(<path d="M4 24 L44 24 Q54 22 60 10 L62 12 Q56 26 44 28 L4 28 Z" />),
  splitter: svg(
    <>
      <path d="M4 12 Q32 6 60 12 L60 16 Q32 10 4 16 Z" opacity="0.5" />
      <path d="M2 20 L62 20 L58 26 L6 26 Z" />
    </>,
  ),
  skirts: svg(
    <>
      <path d="M4 8 L60 8 L60 14 L4 14 Z" opacity="0.4" />
      <path d="M4 18 L60 18 L58 26 L6 26 Z" />
    </>,
  ),
  diffuser: svg(
    <>
      <path d="M4 10 L60 10 L54 16 L10 16 Z" />
      <path d="M14 16 L16 28 L18 16 Z M24 16 L26 28 L28 16 Z M36 16 L38 28 L40 16 Z M46 16 L48 28 L50 16 Z" opacity="0.7" />
    </>,
  ),
  canards: svg(
    <>
      <path d="M4 14 L22 8 L24 12 L6 18 Z" />
      <path d="M60 14 L42 8 L40 12 L58 18 Z" />
      <path d="M6 22 L20 18 L22 21 L8 25 Z M58 22 L44 18 L42 21 L56 25 Z" opacity="0.6" />
    </>,
  ),
}
