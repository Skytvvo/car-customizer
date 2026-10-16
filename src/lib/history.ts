import { useCallback, useMemo, useState } from 'react'
import type { Build } from './build'
import type { ModelTransform } from './types'

/** Everything the user edits on a car. History snapshots this; models and files stay outside. */
export interface EditDoc {
  name: string
  transform: ModelTransform
  build: Build
}

export interface HistoryEntry {
  label: string
  doc: EditDoc
  time: number
  /** Edits with the same key in quick succession (slider drags, typing) merge into one step. */
  key?: string
}

interface State {
  entries: HistoryEntry[]
  index: number
}

const MAX_ENTRIES = 200
const COALESCE_MS = 1500

/** Undo/redo over immutable snapshots of the edited document. */
export function useHistory() {
  const [state, setState] = useState<State | null>(null)

  const reset = useCallback((doc: EditDoc, label = 'Opened') => {
    setState({ entries: [{ label, doc, time: Date.now() }], index: 0 })
  }, [])

  const clear = useCallback(() => setState(null), [])

  const commit = useCallback((label: string, change: (doc: EditDoc) => EditDoc, key?: string) => {
    setState((s) => {
      if (!s) return s
      const top = s.entries[s.index]
      const doc = change(top.doc)
      if (doc === top.doc) return s
      const now = Date.now()
      const isLatest = s.index === s.entries.length - 1
      if (key && top.key === key && isLatest && s.index > 0 && now - top.time < COALESCE_MS) {
        const entries = s.entries.slice(0, s.index)
        entries.push({ ...top, doc, time: now })
        return { entries, index: s.index }
      }
      // A new edit after undoing drops the undone steps (standard editor behavior).
      const entries = s.entries.slice(0, s.index + 1)
      entries.push({ label, doc, time: now, key })
      const overflow = Math.max(0, entries.length - MAX_ENTRIES)
      return { entries: entries.slice(overflow), index: entries.length - 1 - overflow }
    })
  }, [])

  const jumpTo = useCallback((index: number) => {
    setState((s) => (s && index >= 0 && index < s.entries.length ? { ...s, index } : s))
  }, [])
  const undo = useCallback(() => setState((s) => (s && s.index > 0 ? { ...s, index: s.index - 1 } : s)), [])
  const redo = useCallback(
    () => setState((s) => (s && s.index < s.entries.length - 1 ? { ...s, index: s.index + 1 } : s)),
    [],
  )

  return useMemo(
    () => ({
      doc: state ? state.entries[state.index].doc : null,
      entries: state?.entries ?? [],
      index: state?.index ?? 0,
      canUndo: !!state && state.index > 0,
      canRedo: !!state && state.index < state.entries.length - 1,
      reset,
      clear,
      commit,
      undo,
      redo,
      jumpTo,
    }),
    [state, reset, clear, commit, undo, redo, jumpTo],
  )
}

export type History = ReturnType<typeof useHistory>
