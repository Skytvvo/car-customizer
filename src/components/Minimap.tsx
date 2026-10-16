import { useEffect, useRef, type MutableRefObject, type PointerEvent } from 'react'
import type { HudState } from '../lib/hud'

const SIZE = 184 // CSS pixels

interface Props {
  hudRef: MutableRefObject<HudState>
  /** Click on the map: move the camera to this ground point (meters). */
  onMoveTo: (x: number, z: number) => void
}

const niceStep = (range: number) => {
  const raw = range / 2.5
  const pow = 10 ** Math.floor(Math.log10(raw))
  return [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw
}

/**
 * Top-down radar, front of the car up. Shows the car outline, the camera with its
 * field-of-view cone and the orbit pivot. Auto-zooms so the camera always stays on the map.
 */
export default function Minimap({ hudRef, onMoveTo }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const range = useRef(10) // meters from center to edge, smoothed

  useEffect(() => {
    const canvas = canvasRef.current!
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = canvas.height = SIZE * dpr
    const ctx = canvas.getContext('2d')!
    let frame = 0

    const draw = () => {
      frame = requestAnimationFrame(draw)
      const hud = hudRef.current
      const [w, , l] = hud.dims
      const cam = hud.position
      const camDist = Math.hypot(cam.x, cam.z)
      const wanted = Math.max(l * 0.8, camDist * 1.25)
      range.current += (wanted - range.current) * 0.12

      const c = SIZE / 2
      const k = c / range.current // pixels per meter
      // World → map: car's right (−X) to the right, front (+Z) up.
      const mx = (x: number) => c - x * k
      const my = (z: number) => c - z * k

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, SIZE, SIZE)

      // Range rings with distance labels.
      const step = niceStep(range.current)
      ctx.lineWidth = 1
      ctx.font = '10px Inter, system-ui, sans-serif'
      ctx.textAlign = 'left'
      for (let r = step; r < range.current * 1.45; r += step) {
        ctx.strokeStyle = 'rgba(139, 146, 163, 0.18)'
        ctx.beginPath()
        ctx.arc(c, c, r * k, 0, Math.PI * 2)
        ctx.stroke()
        if (r * k < c - 8) {
          ctx.fillStyle = 'rgba(139, 146, 163, 0.6)'
          ctx.fillText(`${+r.toFixed(1)} m`, c + r * k * 0.71 + 3, c - r * k * 0.71 - 2)
        }
      }
      // Car axes
      ctx.strokeStyle = 'rgba(139, 146, 163, 0.12)'
      ctx.beginPath()
      ctx.moveTo(c, 0)
      ctx.lineTo(c, SIZE)
      ctx.moveTo(0, c)
      ctx.lineTo(SIZE, c)
      ctx.stroke()

      // Car outline (or a plain footprint until the outline is baked).
      if (hud.silhouette) {
        const s = hud.silhouetteHalf * 2 * k
        ctx.drawImage(hud.silhouette, c - s / 2, c - s / 2, s, s)
      } else {
        ctx.fillStyle = 'rgba(205, 212, 225, 0.85)'
        ctx.fillRect(c - (w / 2) * k, c - (l / 2) * k, w * k, l * k)
      }
      // Front marker
      ctx.fillStyle = '#e8452c'
      const fy = my(l / 2) - 6
      ctx.beginPath()
      ctx.moveTo(c, fy - 5)
      ctx.lineTo(c - 4, fy + 1)
      ctx.lineTo(c + 4, fy + 1)
      ctx.fill()

      // Orbit pivot
      if (hud.target) {
        const tx = mx(hud.target.x)
        const ty = my(hud.target.z)
        ctx.strokeStyle = 'rgba(232, 234, 239, 0.7)'
        ctx.beginPath()
        ctx.moveTo(tx - 4, ty)
        ctx.lineTo(tx + 4, ty)
        ctx.moveTo(tx, ty - 4)
        ctx.lineTo(tx, ty + 4)
        ctx.stroke()
      }

      // Camera, clamped to the map edge if it's outside.
      let px = mx(cam.x)
      let py = my(cam.z)
      const edge = c - 6
      const off = Math.hypot(px - c, py - c)
      if (off > edge) {
        px = c + ((px - c) / off) * edge
        py = c + ((py - c) / off) * edge
      }
      const fx = -hud.forward.x
      const fz = -hud.forward.z
      const horizontal = Math.hypot(fx, fz)
      if (horizontal > 0.02) {
        // Field-of-view cone; it shortens as the camera looks more steeply down.
        const heading = Math.atan2(fz, fx)
        const len = SIZE * 0.42 * Math.min(1, horizontal * 1.6)
        const grad = ctx.createRadialGradient(px, py, 0, px, py, len)
        grad.addColorStop(0, 'rgba(232, 69, 44, 0.55)')
        grad.addColorStop(1, 'rgba(232, 69, 44, 0)')
        ctx.fillStyle = grad
        ctx.beginPath()
        ctx.moveTo(px, py)
        ctx.arc(px, py, len, heading - hud.fovH / 2, heading + hud.fovH / 2)
        ctx.closePath()
        ctx.fill()
      }
      ctx.fillStyle = '#e8452c'
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(px, py, 4.5, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
    }
    draw()
    return () => cancelAnimationFrame(frame)
  }, [hudRef])

  const onPointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const c = SIZE / 2
    const k = c / range.current
    const sx = ((e.clientX - rect.left) / rect.width) * SIZE
    const sy = ((e.clientY - rect.top) / rect.height) * SIZE
    onMoveTo(-(sx - c) / k, -(sy - c) / k)
  }

  return (
    <div className="minimap" aria-label="Minimap">
      <div className="minimap-label">
        <span>Map</span>
        <span>front ↑</span>
      </div>
      <canvas
        ref={canvasRef}
        style={{ width: SIZE, height: SIZE }}
        onPointerDown={onPointerDown}
        title="Click to move the camera there"
      />
      <div className="minimap-height">
        <MinimapReadout hudRef={hudRef} />
      </div>
    </div>
  )
}

/** Camera height and distance from the car, updated without re-rendering React. */
function MinimapReadout({ hudRef }: { hudRef: MutableRefObject<HudState> }) {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    let frame = 0
    const tick = () => {
      frame = requestAnimationFrame(tick)
      const p = hudRef.current.position
      if (ref.current) ref.current.textContent = `Height ${p.y.toFixed(2)} m · ${Math.hypot(p.x, p.z).toFixed(1)} m from car`
    }
    tick()
    return () => cancelAnimationFrame(frame)
  }, [hudRef])
  return <span ref={ref} />
}
