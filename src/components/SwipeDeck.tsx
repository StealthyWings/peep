import { useRef, useState, type ReactNode } from 'react'

interface Props<T> {
  items: T[]
  render: (item: T) => ReactNode
  keyOf: (item: T) => string
  end: ReactNode
  onFinished: () => void
}

/** Swipe left (or right) to see the next card. The deck ends — no infinite scroll. */
export function SwipeDeck<T>({ items, render, keyOf, end, onFinished }: Props<T>) {
  const [index, setIndex] = useState(0)
  const [dx, setDx] = useState(0)
  const [leaving, setLeaving] = useState<0 | 1 | -1>(0)
  const [dragging, setDragging] = useState(false)
  const start = useRef<number | null>(null)

  const advance = (dir: 1 | -1) => {
    setLeaving(dir)
    setTimeout(() => {
      setLeaving(0)
      setDx(0)
      setIndex(index + 1)
      if (index + 1 >= items.length) onFinished()
    }, 220)
  }

  if (index >= items.length) return <div className="deck">{end}</div>

  const onDown = (e: React.PointerEvent) => {
    start.current = e.clientX
    setDragging(true)
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
  }
  const onMove = (e: React.PointerEvent) => {
    if (start.current !== null) setDx(e.clientX - start.current)
  }
  const onUp = () => {
    if (start.current === null) return
    start.current = null
    setDragging(false)
    if (Math.abs(dx) > 90) advance(dx < 0 ? -1 : 1)
    else setDx(0)
  }

  const offset = leaving ? leaving * 600 : dx
  return (
    <div className="deck">
      <p className="deck-count">
        {index + 1} / {items.length}
      </p>
      <div className="deck-stack">
        {items[index + 1] && <div className="deck-card behind">{render(items[index + 1])}</div>}
        <div
          key={keyOf(items[index])}
          className="deck-card"
          style={{
            transform: `translateX(${offset}px) rotate(${offset / 25}deg)`,
            transition: dragging ? 'none' : 'transform .22s ease-out',
          }}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        >
          {render(items[index])}
        </div>
      </div>
      <div className="row center">
        <button className="btn" onClick={() => advance(-1)}>
          Next →
        </button>
      </div>
    </div>
  )
}
