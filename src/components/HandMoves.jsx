// Seven-O (and Flex trades): when hands change owners, a bundle of face-down cards flies
// from each old owner to the new one, so everyone can see who got whose hand.
import { useEffect, useLayoutEffect, useRef, useState } from 'react'

const MOVE_MS = 900
export const HAND_ARRIVES_MS = 650 // your new hand is dealt in once its bundle has (almost) landed

let nextKey = 0

// where a player sits on screen: their avatar (yours is in the bar at the bottom)
function spotOf(i, viewer) {
  const el = i === viewer ? document.querySelector('.me .me-bar .avatar') : document.querySelector(`.seat[data-seat="${i}"] .avatar`)
  if (!el) return null
  const r = el.getBoundingClientRect()
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
}

export function useHandMoves(game, viewer) {
  const [moves, setMoves] = useState([])
  const lastId = useRef(game.handMove?.id ?? null)
  const timers = useRef([])
  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  useLayoutEffect(() => {
    const hm = game.handMove
    if (!hm || hm.id === lastId.current) return
    lastId.current = hm.id
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const list = []
    hm.moves.forEach(([from, to], k) => {
      const a = spotOf(from, viewer)
      const b = spotOf(to, viewer)
      if (!a || !b) return
      list.push({
        key: nextKey++,
        x: a.x,
        y: a.y,
        dx: b.x - a.x,
        dy: b.y - a.y,
        cards: Math.min(5, game.players[to].hand.length), // the bundle shows the hand that is moving
        delay: hm.moves.length > 2 ? k * 60 : 0, // passing all hands: a little ripple around the table
        spin: hm.moves.length > 2 ? 360 : 180,
      })
    })
    if (!list.length) return
    setMoves((m) => [...m, ...list])
    const t = setTimeout(() => setMoves((m) => m.filter((x) => !list.includes(x))), MOVE_MS + list.length * 60 + 50)
    timers.current.push(t)
  }, [game.handMove, game.players, viewer])

  return moves
}

export function HandMoves({ moves }) {
  return moves.map((m) => (
    <div
      key={m.key}
      className="hand-move"
      style={{ left: m.x, top: m.y, '--dx': `${m.dx}px`, '--dy': `${m.dy}px`, '--delay': `${m.delay}ms`, '--spin': `${m.spin}deg`, '--ms': `${MOVE_MS}ms` }}
    >
      {Array.from({ length: Math.max(1, m.cards) }, (_, i) => (
        <span key={i} className="bundle-card" style={{ '--i': i, '--n': m.cards }} />
      ))}
    </div>
  ))
}
