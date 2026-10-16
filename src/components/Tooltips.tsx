import { useEffect, useLayoutEffect, useRef, useState } from 'react'

interface Tip {
  title: string
  description?: string
  keys?: string[]
  anchor: DOMRect
}

const DELAY_MS = 550
const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
/** Show shortcuts the way the platform names them (⌘ / ⌥ on a Mac). */
const platformKey = (k: string) => (IS_MAC ? k.replace('Ctrl', '⌘').replace('Alt', '⌥') : k)
const GAP = 8

/**
 * Windows-style tooltips: rest the pointer on anything with `data-tip` (see lib/tip.ts) and a
 * card appears with what it does and its shortcut. Hidden on click, scroll and key presses.
 */
export default function Tooltips() {
  const [tip, setTip] = useState<Tip | null>(null)
  const [position, setPosition] = useState<{ left: number; top: number; above: boolean } | null>(null)
  const card = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let timer = 0
    let current: HTMLElement | null = null
    const hide = () => {
      window.clearTimeout(timer)
      current = null
      setTip(null)
    }
    const onOver = (e: MouseEvent) => {
      const el = (e.target as HTMLElement | null)?.closest?.<HTMLElement>('[data-tip]') ?? null
      if (el === current) return
      hide()
      current = el
      if (!el) return
      timer = window.setTimeout(() => {
        if (!el.isConnected) return
        setTip({
          title: el.dataset.tip!,
          description: el.dataset.tipDesc,
          keys: el.dataset.tipKeys?.split(' '),
          anchor: el.getBoundingClientRect(),
        })
      }, DELAY_MS)
    }
    document.addEventListener('mouseover', onOver)
    document.addEventListener('pointerdown', hide, true)
    document.addEventListener('keydown', hide, true)
    window.addEventListener('scroll', hide, true)
    window.addEventListener('blur', hide)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('mouseover', onOver)
      document.removeEventListener('pointerdown', hide, true)
      document.removeEventListener('keydown', hide, true)
      window.removeEventListener('scroll', hide, true)
      window.removeEventListener('blur', hide)
    }
  }, [])

  // Place below the element (above if there's no room), kept inside the window.
  useLayoutEffect(() => {
    if (!tip || !card.current) return setPosition(null)
    const { width, height } = card.current.getBoundingClientRect()
    const a = tip.anchor
    const above = a.bottom + GAP + height > window.innerHeight - 8
    const top = above ? a.top - GAP - height : a.bottom + GAP
    const left = Math.min(Math.max(8, a.left + a.width / 2 - width / 2), window.innerWidth - width - 8)
    setPosition({ left, top, above })
  }, [tip])

  if (!tip) return null
  return (
    <div
      ref={card}
      className="tooltip"
      role="tooltip"
      style={position ? { left: position.left, top: position.top } : { visibility: 'hidden', left: 0, top: 0 }}
    >
      <div className="tooltip-head">
        <strong>{tip.title}</strong>
        {tip.keys && (
          <span className="tooltip-keys">
            {tip.keys.map((k) => (
              <kbd key={k}>{platformKey(k)}</kbd>
            ))}
          </span>
        )}
      </div>
      {tip.description && <p>{tip.description}</p>}
    </div>
  )
}
