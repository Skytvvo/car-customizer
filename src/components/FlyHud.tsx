import { useEffect, useRef, type MutableRefObject } from 'react'
import { bearingOf, HEADINGS } from '../lib/camera'
import type { HudState } from '../lib/hud'

const VISIBLE_DEG = 90 // degrees from the center of the compass to its edge
const TICKS = Array.from({ length: 24 }, (_, i) => i * 15 - 180)

const wrap = (deg: number) => ((((deg + 180) % 360) + 360) % 360) - 180

/** Game-style heading strip with a marker pointing back to the car, plus a crosshair. Free cam only. */
export default function FlyHud({ hudRef }: { hudRef: MutableRefObject<HudState> }) {
  const stripRef = useRef<HTMLDivElement>(null)
  const carRef = useRef<HTMLDivElement>(null)
  const headingRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    let frame = 0
    const place = (el: HTMLElement, deg: number) => {
      const off = wrap(deg)
      const visible = Math.abs(off) <= VISIBLE_DEG
      el.style.opacity = visible ? String(1 - (Math.abs(off) / VISIBLE_DEG) ** 3) : '0'
      el.style.left = `${50 + (off / VISIBLE_DEG) * 50}%`
    }
    const tick = () => {
      frame = requestAnimationFrame(tick)
      const { forward, position } = hudRef.current
      const heading = bearingOf(forward.x, forward.z)
      const items = stripRef.current?.querySelectorAll<HTMLElement>('[data-deg]') ?? []
      items.forEach((el) => place(el, Number(el.dataset.deg) - heading))
      // Bearing from the camera to the car's center.
      if (carRef.current) place(carRef.current, bearingOf(-position.x, -position.z) - heading)
      if (headingRef.current) headingRef.current.textContent = `${Math.round((heading + 360) % 360)}°`
    }
    tick()
    return () => cancelAnimationFrame(frame)
  }, [hudRef])

  return (
    <>
      <div className="compass" aria-hidden>
        <div className="compass-strip" ref={stripRef}>
          {TICKS.map((deg) => {
            const named = HEADINGS.find((h) => wrap(h.deg) === deg)
            return named ? (
              <span key={deg} data-deg={deg} className="compass-label">
                {named.label}
              </span>
            ) : (
              <span key={deg} data-deg={deg} className={deg % 45 === 0 ? 'compass-tick major' : 'compass-tick'} />
            )
          })}
          <div ref={carRef} className="compass-car" title="Direction to the car">
            ◆
          </div>
        </div>
        <span className="compass-needle" />
        <span className="compass-heading" ref={headingRef} />
      </div>
      <div className="crosshair" aria-hidden />
    </>
  )
}
