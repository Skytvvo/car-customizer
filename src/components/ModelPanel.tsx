import { useEffect, useState, type ReactNode } from 'react'
import type { ModelView } from '../App'
import type { EditDoc, History } from '../lib/history'
import { tip } from '../lib/tip'
import { Car, FlipHorizontal2, History as HistoryIcon, Redo2, RotateCw, Sparkles, Undo2, Wrench } from 'lucide-react'
import type { QuarterTurns } from '../lib/types'
import { formatBytes } from '../lib/format'

interface Props {
  model: ModelView
  dimensions: [number, number, number]
  stats: { meshes: number; triangles: number }
  toggles: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }[]
  saving: boolean
  onChange: (patch: Partial<Pick<EditDoc, 'name' | 'transform'>>) => void
  onAutoOrient: () => void
  onSave: () => void
  tab: PanelTab
  onTab: (tab: PanelTab) => void
  partsCount: number
  partsPanel: ReactNode
  history: History
  historyPanel: ReactNode
}

export type PanelTab = 'model' | 'parts' | 'history'

const m = (v: number) => `${v.toFixed(2)} m`

export default function ModelPanel(p: Props) {
  const { model, dimensions, stats } = p
  const [width, height, length] = dimensions
  const [lengthInput, setLengthInput] = useState(String(model.transform.targetLength))

  useEffect(() => setLengthInput(String(model.transform.targetLength)), [model.key, model.transform.targetLength])

  const turn = (axis: 0 | 1 | 2, by: number) => {
    const rotation = [...model.transform.rotation] as QuarterTurns
    rotation[axis] = (rotation[axis] + by) % 4
    p.onChange({ transform: { ...model.transform, rotation } })
  }

  const commitLength = () => {
    const value = parseFloat(lengthInput.replace(',', '.'))
    if (value >= 0.5 && value <= 30) p.onChange({ transform: { ...model.transform, targetLength: value } })
    else setLengthInput(String(model.transform.targetLength))
  }

  const size = model.files.reduce((sum, f) => sum + f.blob.size, 0)

  return (
    <section className="panel" aria-label="Model settings">
      <input
        className="name-input"
        value={model.name}
        onChange={(e) => p.onChange({ name: e.target.value })}
        aria-label="Model name"
        placeholder="Model name"
      />

      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={p.tab === 'model'} onClick={() => p.onTab('model')} {...tip('Model', 'Size, orientation and view options for the car.')}>
          <Car size={14} /> Model
        </button>
        <button role="tab" aria-selected={p.tab === 'parts'} onClick={() => p.onTab('parts')} {...tip('Parts', 'Add, shape and paint wings, splitters, skirts and your own parts.')}>
          <Wrench size={14} /> Parts {p.partsCount > 0 && <span className="count">{p.partsCount}</span>}
        </button>
        <button role="tab" aria-selected={p.tab === 'history'} onClick={() => p.onTab('history')} {...tip('History', 'Every change you made; click one to go back to it.')}>
          <HistoryIcon size={14} />
        </button>
        <span className="tabs-actions">
          <button className="btn-icon subtle" onClick={p.history.undo} disabled={!p.history.canUndo} {...tip('Undo', undoDescription(p.history, -1), 'Ctrl+Z')}>
            <Undo2 size={15} />
          </button>
          <button className="btn-icon subtle" onClick={p.history.redo} disabled={!p.history.canRedo} {...tip('Redo', undoDescription(p.history, 1), 'Ctrl+Shift+Z')}>
            <Redo2 size={15} />
          </button>
        </span>
      </div>

      {p.tab === 'parts' && p.partsPanel}
      {p.tab === 'history' && p.historyPanel}
      {p.tab === 'model' && (
        <>
          <div className="field">
            <label htmlFor="length">Real length</label>
            <div className="input-unit">
              <input
                id="length"
                inputMode="decimal"
                value={lengthInput}
                onChange={(e) => setLengthInput(e.target.value)}
                onBlur={commitLength}
                onKeyDown={(e) => e.key === 'Enter' && commitLength()}
              />
              <span>m</span>
            </div>
          </div>
          <dl className="dims">
            <div>
              <dt>Length</dt>
              <dd>{m(length)}</dd>
            </div>
            <div>
              <dt>Width</dt>
              <dd>{m(width)}</dd>
            </div>
            <div>
              <dt>Height</dt>
              <dd>{m(height)}</dd>
            </div>
          </dl>

          <div className="field">
            <span className="label">Orientation</span>
            <div className="btn-row">
              <button className="btn" onClick={() => turn(1, 2)} {...tip('Flip front', 'Turns the car 180° so the front faces the other way. Use it if the 3/4 view shows the rear.')}>
                <FlipHorizontal2 size={14} /> Flip front
              </button>
              <button className="btn" onClick={() => turn(1, 1)} {...tip('Turn 90°', 'Rotates the car a quarter turn around the vertical axis.')}>
                <RotateCw size={14} /> Turn
              </button>
              <button className="btn" onClick={() => turn(0, 1)} {...tip('Tilt 90°', 'Pitches the car a quarter turn — for models lying on their nose or tail.')}>
                Tilt
              </button>
              <button className="btn" onClick={() => turn(2, 1)} {...tip('Roll 90°', 'Rolls the car a quarter turn — for models lying on their side.')}>
                Roll
              </button>
              <button className="btn" onClick={p.onAutoOrient} {...tip('Auto', 'Guesses the orientation from the proportions: height smallest, length largest.')}>
                <Sparkles size={14} /> Auto
              </button>
            </div>
          </div>

          <div className="toggles">
            {p.toggles.map((t) => (
              <label key={t.label} {...(t.hint ? tip(t.label, t.hint) : {})}>
                <input type="checkbox" checked={t.checked} onChange={(e) => t.onChange(e.target.checked)} />
                {t.label}
              </label>
            ))}
          </div>

          <p className="meta">
            {model.format.toUpperCase()} · {formatBytes(size)} · {stats.meshes} meshes ·{' '}
            {stats.triangles.toLocaleString()} triangles
          </p>
          {model.missing.length > 0 && (
            <p className="warning">
              Missing files: {model.missing.slice(0, 4).join(', ')}
              {model.missing.length > 4 && ` +${model.missing.length - 4} more`}. Upload them together (or as a .zip).
            </p>
          )}
        </>
      )}

      <button className="btn btn-primary btn-block" onClick={p.onSave} disabled={p.saving || !model.dirty}>
        {model.savedId ? (model.dirty ? 'Save changes' : 'Saved') : 'Save to library'}
      </button>
    </section>
  )
}

/** "Undo: Added Rear wing" — names the step an undo/redo would apply. */
function undoDescription(history: History, direction: -1 | 1) {
  const entry = direction < 0 ? history.entries[history.index] : history.entries[history.index + 1]
  if (!entry || (direction < 0 && history.index === 0)) return 'Nothing to ' + (direction < 0 ? 'undo' : 'redo')
  return entry.label
}
