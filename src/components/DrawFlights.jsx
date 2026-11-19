// Cards flying from the draw pile to whoever drew them.
//  - You: the card leaves the pile face-down, flips over on the way and lands in its spot in your hand.
//  - Opponents: a face-down card flies to their seat (in Flip you see its other side, like their fan).
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import Card from './Card.jsx'
import { otherSide } from '../game/deck.js'

const FLY_MS = 560 // how long one card takes to fly
const GAP_MS = 110 // time between cards when several are drawn at once (+4, draw until you can play...)
const MAX_FLIGHTS = 10 // more cards than this just appear (a +10 shouldn't take forever)

let nextKey = 0

// Watches the game and returns the cards currently in the air,
// plus the ids of your new cards that are still on their way (their spot in the hand stays empty until they land).
export function useDrawFlights(game, viewer) {
  const prev = useRef(null)
  const [flights, setFlights] = useState([])
  const [arriving, setArriving] = useState(() => new Set())
  const timers = useRef([])
  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  // runs after the new cards are on the page but before the screen is painted, so we can measure where they go
  useLayoutEffect(() => {
    const before = prev.current
    const now = {
      pile: game.drawPile.length,
      turn: game.turn,
      viewer,
      mine: game.players[viewer].hand.map((c) => c.id),
      counts: game.players.map((p) => p.hand.length),
    }
    prev.current = now
    // only animate real draws: not the first deal, a new game, a change of point of view,
    // or hands moving around without touching the pile (Seven-O swaps)
    if (!before || before.viewer !== viewer || now.turn < before.turn || now.pile === before.pile) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return

    const deckCard = document.querySelector('.center .deck .card')
    const launcher = document.querySelector('.center .launcher')
    if (!deckCard && !launcher) return
    let from = (deckCard ?? launcher).getBoundingClientRect()
    if (!deckCard) {
      // Attack: cards come out of the launcher, card-sized
      const cx = from.left + from.width / 2
      const cy = from.top + from.height / 2
      from = { left: cx - 42, top: cy - 63, width: 84, height: 126 }
    }
    const fromX = from.left + from.width / 2
    const fromY = from.top + from.height / 2

    const list = []
    const add = (target, extra) => {
      if (list.length >= MAX_FLIGHTS) return
      const r = target.getBoundingClientRect()
      list.push({
        key: nextKey++,
        left: from.left,
        top: from.top,
        w: from.width,
        h: from.height,
        dx: r.left + r.width / 2 - fromX,
        dy: r.top + r.height / 2 - fromY,
        delay: list.length * GAP_MS,
        ...extra,
      })
    }

    // your new cards
    const old = new Set(before.mine)
    for (const card of game.players[viewer].hand) {
      if (old.has(card.id)) continue
      const slot = document.querySelector(`.hand-slot[data-id="${card.id}"]`)
      if (slot) add(slot, { card, rot: slot.style.getPropertyValue('--r') || '0deg', s: 1 })
    }
    // everyone else's
    game.players.forEach((p, i) => {
      const more = now.counts[i] - before.counts[i]
      if (i === viewer || more <= 0) return
      const seat = document.querySelector(`.seat[data-seat="${i}"] .avatar`) ?? document.querySelector(`.seat[data-seat="${i}"]`)
      if (!seat) return
      for (let k = 0; k < more; k++) {
        add(seat, { toSeat: true, peek: game.rules.flip ? p.hand[p.hand.length - more + k] : null, rot: '0deg', s: 0.45 })
      }
    })
    if (!list.length) return

    setFlights((f) => [...f, ...list])
    const ids = list.filter((f) => f.card).map((f) => f.card.id)
    if (ids.length) setArriving((a) => new Set([...a, ...ids]))
    for (const f of list) {
      const t = setTimeout(() => {
        setFlights((all) => all.filter((x) => x.key !== f.key))
        if (f.card) {
          setArriving((a) => {
            const next = new Set(a)
            next.delete(f.card.id)
            return next
          })
        }
      }, f.delay + FLY_MS + 20)
      timers.current.push(t)
    }
  }, [game, viewer])

  return { flights, arriving }
}

// The flying cards themselves. Rendered inside the table so they pick up the mode's card style.
export function DrawFlights({ flights, side, rules }) {
  return flights.map((f) => (
    <div
      key={f.key}
      className={`flight${f.toSeat ? ' to-seat' : ''}`}
      style={{
        left: f.left,
        top: f.top,
        width: f.w,
        height: f.h,
        '--dx': `${f.dx}px`,
        '--dy': `${f.dy}px`,
        '--s': f.s,
        '--rot': f.rot,
        '--delay': `${f.delay}ms`,
        '--ms': `${FLY_MS}ms`,
      }}
    >
      <div className="flight-inner">
        <div className="flight-face flight-back">
          {/* the side you see while it's on the pile: a card back, or in Flip the card's other side */}
          {rules.flip && (f.card || f.peek) ? <Card card={f.card ?? f.peek} side={otherSide(side)} peek /> : <Card faceDown />}
        </div>
        {f.card && (
          <div className="flight-face flight-front">
            <Card card={f.card} side={side} rules={rules} />
          </div>
        )}
      </div>
    </div>
  ))
}
