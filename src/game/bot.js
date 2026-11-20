// Computer players: each function returns the action a bot wants to take
import { meta, face, otherSide } from './deck.js'
import { canPlay, canJumpIn, choicesNeeded, needsFlex, faceOf, colorsFor, activePlayers, freeDraw } from './rules.js'

// lower = played first: attack cards, then numbers, wilds saved for last
function priority(s, card) {
  const f = faceOf(s, card)
  const m = meta(f.value)
  if (m.wild) return m.draw || m.roulette || m.drawColor || m.hitFire || m.allHit ? 6 : 5
  if (m.draw || m.hits) return 0
  if (m.skip || m.skipAll || m.discardAll) return 1
  if (m.reverse || m.trade || m.flip) return 2
  return 3 + (card.flex ? 0.5 : 0) // keep flex cards a little longer
}

// the color the bot holds the most of (on the given side)
function favoriteColor(s, hand, side = s.side, skipId) {
  const palette = colorsFor(side)
  const counts = Object.fromEntries(palette.map((c) => [c, 0]))
  for (const c of hand) {
    const col = face(c, side).color
    if (c.id !== skipId && col in counts) counts[col]++
  }
  const random = palette[Math.floor(Math.random() * palette.length)]
  return palette.reduce((best, c) => (counts[c] > counts[best] ? c : best), random)
}

// the extra choices a card needs: color, swap target, flex
export function botChoices(s, card, playerIndex) {
  const me = s.players[playerIndex]
  const need = choicesNeeded(card, s)
  const out = {}
  if (need.color) {
    const flips = meta(faceOf(s, card).value).flip
    out.color = favoriteColor(s, me.hand, flips ? otherSide(s.side) : s.side, card.id)
  }
  if (need.target) {
    // swap with whoever has the fewest cards
    out.target = activePlayers(s)
      .filter((i) => i !== playerIndex)
      .sort((a, b) => s.players[a].hand.length - s.players[b].hand.length)[0]
  }
  if (s.rules.flex && card.flex && me.power && needsFlex(card, s)) out.flex = true
  return out
}

export function botMove(s) {
  const me = s.players[s.current]
  if (s.roulette) return { type: 'ROULETTE', color: favoriteColor(s, me.hand) }

  let options = me.hand.filter((c) => canPlay(c, s, me))
  if (s.drawnCardId !== null && !freeDraw(s)) options = options.filter((c) => c.id === s.drawnCardId)
  if (options.length === 0) return s.drawnCardId !== null ? { type: 'PASS' } : { type: 'DRAW' }

  options.sort((a, b) => priority(s, a) - priority(s, b))
  const card = options[0]
  return { type: 'PLAY', cardId: card.id, ...botChoices(s, card, s.current) }
}

// Jump-in: does any bot (other than the current player) hold the exact top card?
export function botJumpIn(s) {
  for (const i of activePlayers(s)) {
    const p = s.players[i]
    if (!p.isBot || i === s.current) continue
    const card = p.hand.find((c) => canJumpIn(c, s, i))
    if (card) return { type: 'JUMP', player: i, cardId: card.id, ...botChoices(s, card, i) }
  }
  return null
}
