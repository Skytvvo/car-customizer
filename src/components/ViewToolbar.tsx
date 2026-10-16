import type { MouseEvent } from 'react'
import { VIEWS, type CameraMode, type CameraView } from '../lib/camera'

interface Props {
  mode: CameraMode
  onMode: (mode: CameraMode) => void
  onView: (view: CameraView) => void
}

// Drop focus after clicking so keys like W/A/S/D go to the free cam, not the button.
const blurAfter = (fn: () => void) => (e: MouseEvent<HTMLButtonElement>) => {
  e.currentTarget.blur()
  fn()
}

export default function ViewToolbar({ mode, onMode, onView }: Props) {
  return (
    <>
      <div className="view-toolbar" role="toolbar" aria-label="Camera">
        <div className="segmented">
          <button aria-pressed={mode === 'orbit'} onClick={blurAfter(() => onMode('orbit'))} title="Orbit around the car (Esc)">
            Orbit
          </button>
          <button aria-pressed={mode === 'fly'} onClick={blurAfter(() => onMode('fly'))} title="Free camera (F)">
            Free cam
          </button>
        </div>
        <span className="toolbar-divider" aria-hidden />
        {(Object.keys(VIEWS) as CameraView[]).map((view, i) => (
          <button key={view} className="view-btn" onClick={blurAfter(() => onView(view))} title={`${VIEWS[view].label} view (${i + 1})`}>
            {VIEWS[view].label}
          </button>
        ))}
      </div>

      <div className="camera-help" aria-live="polite">
        {mode === 'fly' ? (
          <>
            <span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> move</span>
            <span><kbd>Q</kbd><kbd>E</kbd> down / up</span>
            <span>Drag look</span>
            <span>Right-drag pan</span>
            <span>Scroll forward</span>
            <span><kbd>Shift</kbd> faster</span>
            <span><kbd>Esc</kbd> exit</span>
          </>
        ) : (
          <>
            <span>Drag rotate</span>
            <span>Right-drag pan</span>
            <span>Double-click focus point</span>
            <span><kbd>F</kbd> free cam</span>
          </>
        )}
      </div>
    </>
  )
}
