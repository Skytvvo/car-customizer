import { useSyncExternalStore } from 'react'
import type { Vec3 } from './build'
import type { DragAxis } from './smartDrag'

/** Live readout of a part drag. Kept outside React state so dragging doesn't re-render the app. */
export interface DragInfo {
  position: Vec3
  axis: DragAxis | null
  free: boolean
  center: boolean
  fine: boolean
  vertical: boolean
  gain: number
}

let current: DragInfo | null = null
const listeners = new Set<() => void>()

export function setDragInfo(info: DragInfo | null) {
  current = info
  listeners.forEach((l) => l())
}

export function useDragInfo() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => current,
  )
}
