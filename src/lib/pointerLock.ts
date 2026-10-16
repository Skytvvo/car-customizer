import { useEffect, useState } from 'react'

// Browsers release pointer lock on Esc themselves. Remember when that happened so the same
// key press isn't also treated as "exit free cam".
let lastUnlock = 0
if (typeof document !== 'undefined') {
  document.addEventListener('pointerlockchange', () => {
    if (!document.pointerLockElement) lastUnlock = performance.now()
  })
}

export const isPointerLocked = () => !!document.pointerLockElement

/** True while locked or for a moment after unlocking. */
export const pointerLockBusy = () => isPointerLocked() || performance.now() - lastUnlock < 400

/** Requests pointer lock, ignoring refusals (no user gesture, sandboxed frame, unsupported device). */
export function requestPointerLock(el: HTMLElement) {
  try {
    const result = el.requestPointerLock() as unknown
    if (result instanceof Promise) result.catch(() => {})
  } catch {
    // Not available here; callers fall back to drag-to-look.
  }
}

export function usePointerLocked() {
  const [locked, setLocked] = useState(isPointerLocked)
  useEffect(() => {
    const onChange = () => setLocked(isPointerLocked())
    document.addEventListener('pointerlockchange', onChange)
    return () => document.removeEventListener('pointerlockchange', onChange)
  }, [])
  return locked
}

/** True once the browser has refused a pointer-lock request in this page (embedded frames, some browsers). */
export function usePointerLockRefused() {
  const [refused, setRefused] = useState(false)
  useEffect(() => {
    const onError = () => setRefused(true)
    document.addEventListener('pointerlockerror', onError)
    return () => document.removeEventListener('pointerlockerror', onError)
  }, [])
  return refused
}
