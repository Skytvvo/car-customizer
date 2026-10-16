import type { ModelRecord } from '../lib/types'
import { formatBytes } from '../lib/format'
import { tip } from '../lib/tip'
import { Trash2 } from 'lucide-react'

interface Props {
  models: ModelRecord[]
  activeId?: string
  usage?: number
  onOpen: (record: ModelRecord) => void
  onDelete: (record: ModelRecord) => void
}

export default function Library({ models, activeId, usage, onOpen, onDelete }: Props) {
  return (
    <section className="library" aria-label="Saved models">
      <h2>
        Library <span className="count">{models.length}</span>
      </h2>
      {models.length === 0 && <p className="hint">Saved models appear here. They're stored in this browser only.</p>}
      <ul>
        {models.map((r) => (
          <li key={r.id} className={r.id === activeId ? 'active' : undefined}>
            <button className="card" onClick={() => onOpen(r)}>
              {r.thumbnail ? <img src={r.thumbnail} alt="" /> : <div className="thumb-placeholder" />}
              <span className="card-name">{r.name}</span>
              <span className="card-meta">
                {r.format.toUpperCase()} · {r.stats.dimensions[2].toFixed(2)} m · {formatBytes(r.stats.sizeBytes)}
              </span>
            </button>
            <button className="btn-icon delete" onClick={() => onDelete(r)} {...tip(`Delete ${r.name}`, 'Removes this car and its saved build from this browser.')}>
              <Trash2 size={14} />
            </button>
          </li>
        ))}
      </ul>
      {usage !== undefined && <p className="usage">Browser storage used: {formatBytes(usage)}</p>}
    </section>
  )
}
