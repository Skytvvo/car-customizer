import type { History } from '../lib/history'

const time = (t: number) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })

/** Every change as a step; click one to return to that state. Steps after the current one can be redone. */
export default function HistoryPanel({ history }: { history: History }) {
  const { entries, index } = history
  return (
    <div className="history">
      <div className="btn-row">
        <button className="btn" onClick={history.undo} disabled={!history.canUndo} title="Undo (Ctrl+Z)">
          ↶ Undo
        </button>
        <button className="btn" onClick={history.redo} disabled={!history.canRedo} title="Redo (Ctrl+Shift+Z)">
          ↷ Redo
        </button>
      </div>
      <ol className="history-list" reversed>
        {entries
          .map((entry, i) => ({ entry, i }))
          .reverse()
          .map(({ entry, i }) => (
            <li key={`${i}:${entry.time}`} className={i === index ? 'current' : i > index ? 'undone' : undefined}>
              <button onClick={() => history.jumpTo(i)} aria-current={i === index ? 'step' : undefined}>
                <span className="history-label">{entry.label}</span>
                <span className="history-time">{time(entry.time)}</span>
              </button>
            </li>
          ))}
      </ol>
      <p className="hint">Click a step to go back to it. Unsaved history is lost when you open another car.</p>
    </div>
  )
}
