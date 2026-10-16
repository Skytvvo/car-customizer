import type { MouseEvent } from 'react'
import { VIEWS, type CameraMode, type CameraView } from '../lib/camera'
import type { LookMode } from '../lib/settings'
import { tip } from '../lib/tip'
import { Gamepad2, Orbit as OrbitIcon } from 'lucide-react'
import type { GizmoMode } from './PartsLayer'

interface Props {
  mode: CameraMode
  lookMode: LookMode
  showHints: boolean
  /** When a part is selected (orbit mode), the hint line explains how to move it. */
  partGizmo: GizmoMode | null
  onMode: (mode: CameraMode) => void
  onView: (view: CameraView) => void
}

const VIEW_TIPS: Record<CameraView, string> = {
  hero: 'Classic three-quarter front view.',
  front: 'Straight at the nose.',
  side: 'Full side profile.',
  rear: 'Straight at the tail.',
  top: 'From above, front pointing up.',
  low: 'Low dramatic angle from the front corner.',
}

const PART_HINTS: Record<GizmoMode, string[]> = {
  translate: ['Drag the part to slide it', 'Locks to an axis — pull sideways to free', 'Shift fine', 'Alt up / down'],
  rotate: ['Drag a ring to rotate'],
  scale: ['Drag a handle to stretch, center to resize'],
}

const LOOK_HINTS: Record<LookMode, string[]> = {
  drag: ['Drag look', 'Right-drag pan'],
  'hold-right': ['Hold right button look', 'Middle-drag pan', 'Right + scroll speed'],
  game: ['Click to capture mouse', 'Right-drag pan'],
}

// Drop focus after clicking so keys like W/A/S/D go to the free cam, not the button.
const blurAfter = (fn: () => void) => (e: MouseEvent<HTMLButtonElement>) => {
  e.currentTarget.blur()
  fn()
}

export default function ViewToolbar({ mode, lookMode, showHints, partGizmo, onMode, onView }: Props) {
  return (
    <>
      <div className="view-toolbar" role="toolbar" aria-label="Camera">
        <div className="segmented">
          <button aria-pressed={mode === 'orbit'} onClick={blurAfter(() => onMode('orbit'))} {...tip('Orbit', 'Drag to rotate around the car, right-drag to pan, scroll to zoom. Double-click a spot to orbit around it.', 'Esc')}>
            <OrbitIcon size={14} /> Orbit
          </button>
          <button aria-pressed={mode === 'fly'} onClick={blurAfter(() => onMode('fly'))} {...tip('Free cam', 'Fly around with W A S D, Q/E for down/up. Mouse look style is in Settings.', 'F')}>
            <Gamepad2 size={14} /> Free cam
          </button>
        </div>
        <span className="toolbar-divider" aria-hidden />
        {(Object.keys(VIEWS) as CameraView[]).map((view, i) => (
          <button key={view} className="view-btn" onClick={blurAfter(() => onView(view))} {...tip(`${VIEWS[view].label} view`, VIEW_TIPS[view], String(i + 1))}>
            {VIEWS[view].label}
          </button>
        ))}
      </div>

      {showHints && (
        <div className="camera-help" aria-live="polite">
          {mode === 'fly' ? (
            <>
              <span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> move</span>
              <span><kbd>Q</kbd><kbd>E</kbd> down / up</span>
              {LOOK_HINTS[lookMode].map((hint) => (
                <span key={hint}>{hint}</span>
              ))}
              <span><kbd>Shift</kbd> faster</span>
              <span><kbd>G</kbd> lock mouse</span>
              <span><kbd>Esc</kbd> exit</span>
            </>
          ) : partGizmo ? (
            <>
              {PART_HINTS[partGizmo].map((hint) => (
                <span key={hint}>{hint}</span>
              ))}
              <span><kbd>←</kbd><kbd>→</kbd><kbd>↑</kbd><kbd>↓</kbd> nudge 1 cm</span>
              <span><kbd>W</kbd><kbd>E</kbd><kbd>R</kbd> move / rotate / scale</span>
              <span><kbd>Esc</kbd> deselect</span>
            </>
          ) : (
            <>
              <span>Drag rotate</span>
              <span>Right-drag pan</span>
              <span>Double-click focus point</span>
              <span><kbd>F</kbd> free cam</span>
              <span><kbd>M</kbd> map</span>
            </>
          )}
        </div>
      )}
    </>
  )
}
