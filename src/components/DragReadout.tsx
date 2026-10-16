import { useDragInfo } from '../lib/dragInfo'

const m = (v: number) => `${v >= 0 ? ' ' : '−'}${Math.abs(v).toFixed(3)}`

/** Live position and mode while a part is being dragged. */
export default function DragReadout() {
  const info = useDragInfo()
  if (!info) return null
  const [x, y, z] = info.position
  const mode = info.vertical
    ? 'Up / down'
    : info.axis
      ? `Locked to ${info.axis.toUpperCase()} — pull sideways to free`
      : info.free
        ? 'Free'
        : 'Choosing axis…'
  return (
    <div className="drag-readout" role="status">
      <span className="coords">
        <b className="x">X</b>
        {m(x)} <b className="y">Y</b>
        {m(y)} <b className="z">Z</b>
        {m(z)} m
      </span>
      <span className="tags">
        <span className={info.axis ? `tag axis-${info.axis}` : 'tag'}>{mode}</span>
        {info.center && <span className="tag center">Centered</span>}
        {info.fine ? <span className="tag">Fine ×0.15</span> : info.gain < 0.95 && <span className="tag">Precise ×{info.gain.toFixed(2)}</span>}
      </span>
    </div>
  )
}
