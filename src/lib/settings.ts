/** How the mouse turns the free camera. */
export type LookMode = 'drag' | 'hold-right' | 'game'
/** What the scroll wheel does in free cam. */
export type WheelMode = 'forward' | 'speed'

export interface Settings {
  lookMode: LookMode
  /** Multiplier on mouse-look speed. */
  sensitivity: number
  invertY: boolean
  /** Multiplier on free-cam movement speed. */
  flySpeed: number
  wheel: WheelMode
  showMinimap: boolean
  showViewCube: boolean
  showHints: boolean
  /** Dragging a part sticks to the axis it starts along until pulled away. */
  dragAxisLock: boolean
  /** Parts snap to the car's center line when dragged near it. */
  dragCenterSnap: boolean
  /** Slow mouse movement moves parts in fine steps. */
  dragPrecision: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  lookMode: 'drag',
  sensitivity: 1,
  invertY: false,
  flySpeed: 1,
  wheel: 'forward',
  showMinimap: true,
  showViewCube: true,
  showHints: true,
  dragAxisLock: true,
  dragCenterSnap: true,
  dragPrecision: true,
}

export const FLY_SPEED_RANGE = [0.25, 6] as const
export const SENSITIVITY_RANGE = [0.2, 3] as const

const KEY = 'car-customizer:settings'

const clamp = (v: unknown, [min, max]: readonly [number, number], fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback

/** Preferences are per-browser conveniences; storage may be unavailable (private mode), so never throw. */
export function loadSettings(): Settings {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Settings>
    const pick = <T>(value: unknown, allowed: readonly T[], fallback: T) =>
      allowed.includes(value as T) ? (value as T) : fallback
    const bool = (value: unknown, fallback: boolean) => (typeof value === 'boolean' ? value : fallback)
    const d = DEFAULT_SETTINGS
    return {
      lookMode: pick(saved.lookMode, ['drag', 'hold-right', 'game'] as const, d.lookMode),
      sensitivity: clamp(saved.sensitivity, SENSITIVITY_RANGE, d.sensitivity),
      invertY: bool(saved.invertY, d.invertY),
      flySpeed: clamp(saved.flySpeed, FLY_SPEED_RANGE, d.flySpeed),
      wheel: pick(saved.wheel, ['forward', 'speed'] as const, d.wheel),
      showMinimap: bool(saved.showMinimap, d.showMinimap),
      showViewCube: bool(saved.showViewCube, d.showViewCube),
      showHints: bool(saved.showHints, d.showHints),
      dragAxisLock: bool(saved.dragAxisLock, d.dragAxisLock),
      dragCenterSnap: bool(saved.dragCenterSnap, d.dragCenterSnap),
      dragPrecision: bool(saved.dragPrecision, d.dragPrecision),
    }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function saveSettings(settings: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings))
  } catch {
    // Storage blocked: settings just won't persist.
  }
}

export const clampFlySpeed = (v: number) => clamp(v, FLY_SPEED_RANGE, DEFAULT_SETTINGS.flySpeed)
