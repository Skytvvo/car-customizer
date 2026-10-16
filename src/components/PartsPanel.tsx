import type { Build, FinishType, MeshIndex, PartInstance } from '../lib/build'
import { meshLabel } from '../lib/build'
import { CATALOG, formatParam } from '../parts/catalog'
import { FINISHES, SWATCHES } from '../parts/finishes'
import type { GizmoMode, PickMode } from './PartsLayer'

interface Props {
  build: Build
  meshIndex: MeshIndex | null
  selectedId: string | null
  gizmoMode: GizmoMode
  pickMode: PickMode
  onAdd: (kind: string) => void
  onSelect: (id: string | null) => void
  onUpdate: (id: string, patch: Partial<PartInstance>) => void
  onRemove: (id: string) => void
  onDuplicate: (id: string) => void
  onGizmoMode: (mode: GizmoMode) => void
  onPickMode: (mode: PickMode) => void
  onToggleHidden: (path: string) => void
  onShowAll: () => void
}

const GIZMO_MODES: { mode: GizmoMode; label: string }[] = [
  { mode: 'translate', label: 'Move' },
  { mode: 'rotate', label: 'Rotate' },
  { mode: 'scale', label: 'Scale' },
]

export default function PartsPanel(p: Props) {
  const selected = p.build.parts.find((part) => part.id === p.selectedId) ?? null
  const def = selected ? CATALOG[selected.kind] : null

  return (
    <div className="parts">
      <section>
        <h4>Add part</h4>
        <div className="catalog">
          {Object.values(CATALOG).map((d) => (
            <button key={d.kind} className="catalog-card" onClick={() => p.onAdd(d.kind)} title={d.description}>
              <WingIcon />
              <span>{d.name}</span>
            </button>
          ))}
          <div className="catalog-card soon" aria-hidden>
            <span>More parts soon</span>
          </div>
        </div>
      </section>

      {p.build.parts.length > 0 && (
        <section>
          <h4>Installed</h4>
          <ul className="part-list">
            {p.build.parts.map((part, i) => (
              <li key={part.id} className={part.id === p.selectedId ? 'active' : undefined}>
                <button className="part-name" onClick={() => p.onSelect(part.id === p.selectedId ? null : part.id)}>
                  {CATALOG[part.kind]?.name ?? part.kind} {countLabel(p.build.parts, part, i)}
                </button>
                <button className="btn-icon subtle" onClick={() => p.onDuplicate(part.id)} title="Duplicate">
                  ⧉
                </button>
                <button className="btn-icon subtle" onClick={() => p.onRemove(part.id)} title="Remove (Delete)">
                  ×
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {selected && def && (
        <section className="part-editor">
          <h4>{def.name}</h4>
          <div className="segmented small" role="group" aria-label="Gizmo">
            {GIZMO_MODES.map((g) => (
              <button key={g.mode} aria-pressed={p.gizmoMode === g.mode} onClick={() => p.onGizmoMode(g.mode)}>
                {g.label}
              </button>
            ))}
          </div>
          <div className="btn-row">
            <button
              className={`btn${p.pickMode === 'place' ? ' active' : ''}`}
              onClick={() => p.onPickMode(p.pickMode === 'place' ? null : 'place')}
              title="Click a spot on the car to move the part there"
            >
              Place on body
            </button>
            <button
              className="btn"
              onClick={() => p.onUpdate(selected.id, { position: [0, selected.position[1], selected.position[2]] })}
              title="Center on the car's middle line"
            >
              Center
            </button>
            <button
              className="btn"
              onClick={() => p.onUpdate(selected.id, { rotation: [0, 0, 0], scale: [1, 1, 1] })}
              title="Reset rotation and size"
            >
              Reset
            </button>
          </div>

          <div className="params">
            {def.params.map((param) =>
              param.kind === 'toggle' ? (
                <label key={param.key} className="check-row">
                  <input
                    type="checkbox"
                    checked={Boolean(selected.params[param.key])}
                    onChange={(e) =>
                      p.onUpdate(selected.id, { params: { ...selected.params, [param.key]: e.target.checked } })
                    }
                  />
                  {param.label}
                </label>
              ) : (
                <div key={param.key} className="slider-field compact">
                  <label htmlFor={`param-${param.key}`}>{param.label}</label>
                  <input
                    id={`param-${param.key}`}
                    type="range"
                    min={param.min}
                    max={param.max}
                    step={param.step}
                    value={Number(selected.params[param.key])}
                    onChange={(e) =>
                      p.onUpdate(selected.id, { params: { ...selected.params, [param.key]: Number(e.target.value) } })
                    }
                  />
                  <output>{formatParam(param, selected.params[param.key])}</output>
                </div>
              ),
            )}
          </div>

          <div className="finish">
            <span className="label">Finish</span>
            <div className="chips">
              {FINISHES.map((f) => (
                <button
                  key={f.type}
                  className="chip"
                  aria-pressed={selected.finish.type === f.type}
                  onClick={() => p.onUpdate(selected.id, { finish: { ...selected.finish, type: f.type as FinishType } })}
                >
                  {f.label}
                </button>
              ))}
            </div>
            {selected.finish.type !== 'carbon' && (
              <div className="swatches">
                {SWATCHES.map((color) => (
                  <button
                    key={color}
                    className="swatch"
                    style={{ background: color }}
                    aria-label={`Color ${color}`}
                    aria-pressed={selected.finish.color.toLowerCase() === color}
                    onClick={() => p.onUpdate(selected.id, { finish: { ...selected.finish, color } })}
                  />
                ))}
                <input
                  type="color"
                  value={selected.finish.color}
                  onChange={(e) => p.onUpdate(selected.id, { finish: { ...selected.finish, color: e.target.value } })}
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
        >
          {p.pickMode === 'hide' ? 'Done hiding' : 'Hide parts by clicking'}
        </button>
        <p className="hint">Remove the stock spoiler, badges or wipers. Some models merge parts into one mesh.</p>
        {p.build.hidden.length > 0 && (
          <>
            <ul className="part-list">
              {p.build.hidden.map((path) => (
                <li key={path}>
                  <span className="part-name muted">{meshLabel(p.meshIndex?.byPath.get(path), path)}</span>
                  <button className="btn-icon subtle" onClick={() => p.onToggleHidden(path)} title="Show again">
                    ↺
                  </button>
                </li>
              ))}
            </ul>
            <button className="btn" onClick={p.onShowAll}>
              Show all
            </button>
          </>
        )}
      </section>
    </div>
  )
}

/** "#2" suffix when there are several parts of the same kind. */
function countLabel(parts: PartInstance[], part: PartInstance, index: number) {
  const same = parts.filter((x) => x.kind === part.kind)
  if (same.length < 2) return ''
  return `#${parts.slice(0, index + 1).filter((x) => x.kind === part.kind).length}`
}

function WingIcon() {
  return (
    <svg viewBox="0 0 64 32" width="56" height="28" aria-hidden>
      <path d="M6 10 Q32 4 58 10 L58 14 Q32 9 6 14 Z" fill="currentColor" />
      <rect x="4" y="6" width="3" height="12" rx="1" fill="currentColor" />
      <rect x="57" y="6" width="3" height="12" rx="1" fill="currentColor" />
      <path d="M20 13 L18 28 L22 28 L24 13 Z M44 13 L46 28 L42 28 L40 13 Z" fill="currentColor" opacity="0.7" />
    </svg>
  )
}
