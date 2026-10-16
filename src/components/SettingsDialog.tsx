import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import {
  DEFAULT_SETTINGS,
  FLY_SPEED_RANGE,
  SENSITIVITY_RANGE,
  type LookMode,
  type Settings,
  type WheelMode,
} from '../lib/settings'

interface Props {
  open: boolean
  settings: Settings
  onChange: (patch: Partial<Settings>) => void
  onClose: () => void
}

const LOOK_MODES: { value: LookMode; title: string; text: string }[] = [
  {
    value: 'drag',
    title: 'Drag to look',
    text: 'Left-drag turns the camera, right-drag pans. Works well on trackpads.',
  },
  {
    value: 'hold-right',
    title: 'Hold right button',
    text: 'Hold the right mouse button to look around with the cursor hidden, like the Unreal and Unity editors. Middle-drag pans.',
  },
  {
    value: 'game',
    title: 'Game mode',
    text: 'Click the view to capture the mouse, like a first-person game. Esc releases it.',
  },
]

const WHEEL_MODES: { value: WheelMode; title: string }[] = [
  { value: 'forward', title: 'Move forward / back' },
  { value: 'speed', title: 'Change fly speed' },
]

export default function SettingsDialog({ open, settings, onChange, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      className="settings"
      aria-labelledby="settings-title"
      onClose={onClose}
      onClick={(e) => e.target === e.currentTarget && onClose()} // backdrop click
    >
      <div className="settings-body">
        <header className="settings-header">
          <h2 id="settings-title">Settings</h2>
          <button className="btn-icon" onClick={onClose} aria-label="Close settings">
            <X size={15} />
          </button>
        </header>

        <section>
          <h3>Free camera</h3>
          <fieldset className="choice-cards">
            <legend>Mouse look</legend>
            {LOOK_MODES.map((m) => (
              <label key={m.value} className="choice-card">
                <input
                  type="radio"
                  name="lookMode"
                  checked={settings.lookMode === m.value}
                  onChange={() => onChange({ lookMode: m.value })}
                />
                <span>
                  <strong>{m.title}</strong>
                  <small>{m.text}</small>
                </span>
              </label>
            ))}
          </fieldset>

          <div className="slider-field">
            <label htmlFor="sensitivity">Mouse sensitivity</label>
            <input
              id="sensitivity"
              type="range"
              min={SENSITIVITY_RANGE[0]}
              max={SENSITIVITY_RANGE[1]}
              step={0.1}
              value={settings.sensitivity}
              onChange={(e) => onChange({ sensitivity: Number(e.target.value) })}
            />
            <output>{settings.sensitivity.toFixed(1)}×</output>
          </div>

          <div className="slider-field">
            <label htmlFor="flySpeed">Fly speed</label>
            <input
              id="flySpeed"
              type="range"
              min={FLY_SPEED_RANGE[0]}
              max={FLY_SPEED_RANGE[1]}
              step={0.05}
              value={settings.flySpeed}
              onChange={(e) => onChange({ flySpeed: Number(e.target.value) })}
            />
            <output>{settings.flySpeed.toFixed(2)}×</output>
          </div>

          <fieldset className="inline-choices">
            <legend>Scroll wheel</legend>
            {WHEEL_MODES.map((m) => (
              <label key={m.value}>
                <input
                  type="radio"
                  name="wheel"
                  checked={settings.wheel === m.value}
                  onChange={() => onChange({ wheel: m.value })}
                />
                {m.title}
              </label>
            ))}
          </fieldset>

          <label className="check-row">
            <input type="checkbox" checked={settings.invertY} onChange={(e) => onChange({ invertY: e.target.checked })} />
            Invert vertical look
          </label>

          <p className="settings-tip">
            In any style: <kbd>G</kbd> locks the mouse, scroll while holding the right button changes speed.
          </p>
        </section>

        <section>
          <h3>Moving parts</h3>
          <label className="check-row">
            <input type="checkbox" checked={settings.dragAxisLock} onChange={(e) => onChange({ dragAxisLock: e.target.checked })} />
            <span>
              Axis lock <small className="muted-note">— a drag sticks to the line it starts along; pull sideways to break free</small>
            </span>
          </label>
          <label className="check-row">
            <input type="checkbox" checked={settings.dragCenterSnap} onChange={(e) => onChange({ dragCenterSnap: e.target.checked })} />
            <span>
              Snap to center line <small className="muted-note">— parts click into the car's middle</small>
            </span>
          </label>
          <label className="check-row">
            <input type="checkbox" checked={settings.dragPrecision} onChange={(e) => onChange({ dragPrecision: e.target.checked })} />
            <span>
              Precision speed <small className="muted-note">— slow mouse moves in fine steps (Shift is always extra fine)</small>
            </span>
          </label>
        </section>

        <section>
          <h3>Interface</h3>
          <label className="check-row">
            <input
              type="checkbox"
              checked={settings.showMinimap}
              onChange={(e) => onChange({ showMinimap: e.target.checked })}
            />
            Minimap <kbd>M</kbd>
          </label>
          <label className="check-row">
            <input
              type="checkbox"
              checked={settings.showViewCube}
              onChange={(e) => onChange({ showViewCube: e.target.checked })}
            />
            View cube
          </label>
          <label className="check-row">
            <input
              type="checkbox"
              checked={settings.showHints}
              onChange={(e) => onChange({ showHints: e.target.checked })}
            />
            Control hints
          </label>
        </section>

        <footer className="settings-footer">
          <span>Saved in this browser.</span>
          <button className="btn" onClick={() => onChange(DEFAULT_SETTINGS)}>
            Reset to defaults
          </button>
          <button className="btn btn-primary" onClick={onClose}>
            Done
          </button>
        </footer>
      </div>
    </dialog>
  )
}
