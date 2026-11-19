// All game rules live here, in one reducer.
// The UI only sends actions (PLAY, DRAW, PASS, CALL_UNO, ROULETTE, JUMP); this file decides what happens.
//
// DEATHMATCH PHASE: when every card is in someone's hand (nothing left to draw), drawing stops.
//   - can't play? you pass. Nobody can play for a full round? lowest points wins.
//   - draw penalties (+2, +4, stacks, roulette...) become penalty POINTS instead of cards, and the victim is skipped.
//   - when someone empties their hand they win, and everyone's leftover cards are scored (see cardPoints in deck.js).
//   - it lasts at most DEATHMATCH_TURNS turns; then the fewest points wins.
// Each mode (see modes.js) has its own deck and turns rules on through state.rules:
//   stacking, sevenO, drawUntil, jumpIn, mercy (card limit), flip, launcher, flex
import { COLORS, DARK_COLORS, meta, face, otherSide, isNumber, label, shuffle, cardPoints } from './deck.js'
import { MODES } from './modes.js'

export const HAND_SIZE = 7
// Deathmatch lasts at most this many turns. When they run out, the player with the fewest points wins.
export const DEATHMATCH_TURNS = 50

// ---------- Helpers the UI and bots use too ----------

export const topCard = (s) => s.discard[s.discard.length - 1]
export const faceOf = (s, card) => face(card, s.side)
export const colorsFor = (side) => (side === 'dark' ? DARK_COLORS : COLORS)
export const activePlayers = (s) => s.players.map((_, i) => i).filter((i) => !s.players[i].out)

// Can `player` put `card` on the pile right now?
// how many cards you'd hold after playing this card (Discard All also throws away every other card of its color)
export function cardsLeftAfter(card, s, player) {
  const f = faceOf(s, card)
  let left = player.hand.length - 1
  if (meta(f.value).discardAll) left -= player.hand.filter((c) => c.id !== card.id && faceOf(s, c).color === f.color).length
  return left
}

// UNO can be called when one of your playable cards would leave you with exactly one card
export function canCallUno(s, playerIndex) {
  const player = s.players[playerIndex]
  if (!player || s.saidUno) return false
  return player.hand.some(
    (c) => canPlay(c, s, player) && (s.drawnCardId === null || s.drawnCardId === undefined || c.id === s.drawnCardId) && cardsLeftAfter(c, s, player) === 1,
  )
}

export function canPlay(card, s, player) {
  if (s.roulette) return false
  const f = faceOf(s, card)
  const m = meta(f.value)
  // a stacked penalty is waiting: only an equal or bigger draw card may answer it
  if (s.pending) return !!m.draw && m.draw >= s.pending.last
  if (m.wild) {
    // Wild Draw Four (and similar) only when you hold no card of the current color
    if (m.restricted) return !player.hand.some((c) => c.id !== card.id && faceOf(s, c).color === s.currentColor)
    return true
  }
  const top = faceOf(s, topCard(s))
  if (f.color === s.currentColor || f.value === top.value) return true
  // Flex: with your power charged, a flex card may be played as its second color
  if (s.rules.flex && card.flex && player.power && card.flex === s.currentColor) return true
  return false
}

// Is the only way to play this card to flex it?
export function needsFlex(card, s) {
  const f = faceOf(s, card)
  return !!card.flex && !meta(f.value).wild && f.color !== s.currentColor && f.value !== faceOf(s, topCard(s)).value
}

// Jump-in: the exact same card as the top card can be played out of turn
export function canJumpIn(card, s, playerIndex) {
  if (!s.rules.jumpIn || s.pending || s.roulette || s.winner !== null) return false
  if (playerIndex === s.current || s.players[playerIndex].out) return false
  const f = faceOf(s, card)
  const top = faceOf(s, topCard(s))
  return !meta(f.value).wild && f.color === top.color && f.value === top.value
}

// What extra choices does playing this card need? (the UI asks a human; bots decide in bot.js)
export function choicesNeeded(card, s) {
  const f = faceOf(s, card)
  const m = meta(f.value)
  const flipsToWild = m.flip && meta(face(card, otherSide(s.side)).value).wild
  return {
    // Color Roulette is a wild card, but the NEXT player picks the color, not the one who plays it
    color: (m.wild && !m.roulette) || flipsToWild ? colorsFor(m.flip ? otherSide(s.side) : s.side) : null,
    target: (s.rules.sevenO && f.value === '7') || m.trade,
  }
}

// Index of the active player `steps` seats away in the current direction (eliminated players are skipped)
export function nextIndex(s, steps = 1, from = s.current) {
  const n = s.players.length
  let i = from
  if (steps === 0 && !s.players[i].out) return i
  let moved = 0
  for (let guard = 0; guard < n * 4 && moved < Math.max(steps, 1); guard++) {
    i = (((i + s.direction) % n) + n) % n
    if (!s.players[i].out) moved++
  }
  return i
}

// The card launcher (Attack): often fires nothing, sometimes a pile
export function launch() {
  if (Math.random() < 0.45) return 0
  const r = Math.random()
  return r < 0.3 ? 1 : r < 0.55 ? 2 : r < 0.75 ? 3 : r < 0.87 ? 4 : r < 0.95 ? 5 : 6
}

// ---------- Internal helpers ----------

function addLog(s, message) {
  s.log = [message, ...s.log].slice(0, 8)
}

function addEvent(s, kind, text) {
  s.eventId += 1
  s.event = { id: s.eventId, kind, text }
}

function reshuffle(s) {
  const top = s.discard.pop()
  s.drawPile = shuffle(s.discard)
  s.discard = [top]
}

function takeOne(s, p) {
  if (s.deathmatch) return null // Deathmatch lasts until the end: nobody draws again
  if (s.drawPile.length === 0) reshuffle(s)
  if (s.drawPile.length === 0) {
    // every card is already in someone's hand
    startDeathmatch(s)
    return null
  }
  const card = s.drawPile.pop()
  s.players[p].hand.push(card)
  return card
}

function drawCards(s, p, count) {
  let drawn = 0
  for (let i = 0; i < count; i++) if (takeOne(s, p)) drawn++
  // Deathmatch: cards that couldn't be drawn become penalty points
  if (drawn < count && s.deathmatch) addPenalty(s, p, count - drawn)
  checkMercy(s, p)
  return drawn
}

function addPenalty(s, p, points) {
  s.players[p].penalty += points
  addLog(s, `${s.players[p].name} takes ${points} penalty point${points === 1 ? '' : 's'}`)
}

function startDeathmatch(s) {
  if (s.deathmatch) return
  s.deathmatch = true
  s.deathmatchStart = s.turn
  addLog(s, `Nothing left to draw: DEATHMATCH! ${DEATHMATCH_TURNS} turns left, draw penalties are now points.`)
  addEvent(s, 'deathmatch', 'Deathmatch!')
}

// keep drawing until `test(card)` is true (or the cards run out)
function drawUntil(s, p, test) {
  const got = []
  for (let guard = 0; guard < 300; guard++) {
    const c = takeOne(s, p)
    if (!c) break
    got.push(c)
    if (test(c)) break
  }
  checkMercy(s, p)
  return got
}

// press the launcher; returns how many cards came out (in Deathmatch they turn into penalty points)
function hit(s, p) {
  const n = launch()
  drawCards(s, p, n)
  return n
}

// No Mercy: too many cards and you're out. Your cards go to the bottom of the draw pile.
function checkMercy(s, p) {
  const player = s.players[p]
  if (!s.rules.mercy || player.out || player.hand.length < s.rules.mercy) return
  player.out = true
  s.drawPile.unshift(...shuffle(player.hand))
  player.hand = []
  addLog(s, `${player.name} has ${s.rules.mercy}+ cards and is OUT`)
  addEvent(s, 'out', `${player.name} is out!`)
  const left = activePlayers(s)
  if (left.length === 1) {
    s.winner = left[0]
    addLog(s, `${s.players[left[0]].name} is the last one standing!`)
  }
}

// Whose point of view the table is shown from (their hand at the bottom)
function setView(s) {
  const cur = s.players[s.current]
  if (!cur.isBot) s.viewer = s.current
  else if (s.viewer === null) s.viewer = s.players.findIndex((p) => !p.isBot)
}

function advance(s, steps) {
  if (s.winner !== null) return
  if (s.deathmatch && s.turn + 1 - s.deathmatchStart >= DEATHMATCH_TURNS) {
    finishByPoints(s, 'Deathmatch time is up')
    return
  }
  let i = nextIndex(s, steps)
  if (s.players[i].out) i = nextIndex(s, 1, i)
  s.current = i
  s.turn += 1
  s.drawnCardId = null
  s.saidUno = false
  setView(s)
}

// after hitting the next player with a penalty: skip them (unless they were knocked out)
function skipVictim(s, victim) {
  advance(s, s.players[victim].out ? 1 : 2)
}

// remember which hands moved where, so the table can animate it
function noteHandMove(s, moves) {
  s.handMove = { id: (s.handMove?.id ?? 0) + 1, moves }
}

function swapHands(s, a, b) {
  const t = s.players[a].hand
  s.players[a].hand = s.players[b].hand
  s.players[b].hand = t
  noteHandMove(s, [[a, b], [b, a]])
}

// Seven-O: every hand moves to the next player in the direction of play
function rotateHands(s) {
  const order = []
  let i = s.current
  do {
    order.push(i)
    i = nextIndex(s, 1, i)
  } while (i !== s.current && order.length <= s.players.length)
  const hands = order.map((idx) => s.players[idx].hand)
  order.forEach((idx, k) => (s.players[order[(k + 1) % order.length]].hand = hands[k]))
  noteHandMove(s, order.map((idx, k) => [idx, order[(k + 1) % order.length]]))
}

function fewestCardsOpponent(s) {
  return activePlayers(s)
    .filter((i) => i !== s.current)
    .sort((a, b) => s.players[a].hand.length - s.players[b].hand.length)[0]
}

// a draw card was played: stack it, or make the next player draw now
function drawPenalty(s, amount) {
  if (s.rules.stacking) {
    s.pending = { amount: (s.pending?.amount ?? 0) + amount, last: amount }
    addEvent(s, 'stack', `+${s.pending.amount}`)
    advance(s, 1)
    return
  }
  const victim = nextIndex(s, 1)
  drawCards(s, victim, amount)
  addLog(s, `${s.players[victim].name} draws ${amount} and is skipped`)
  addEvent(s, 'draw', `+${amount}`)
  skipVictim(s, victim)
}

// Points in a hand (the side in play counts, for Flip), plus Deathmatch penalty points
export const handPoints = (s, hand) => hand.reduce((sum, c) => sum + cardPoints(faceOf(s, c)), 0)
const totalPoints = (s, i) => handPoints(s, s.players[i].hand) + s.players[i].penalty

// Score the game: the winner first, everyone else ranked by points (fewest first).
// The winner's score is everyone else's points added up. Shown on the win screen.
function scoreGame(s, reason) {
  const rows = activePlayers(s).map((i) => ({ index: i, points: totalPoints(s, i), cards: s.players[i].hand.length }))
  const winnerRow = rows.find((r) => r.index === s.winner)
  const others = rows.filter((r) => r.index !== s.winner).sort((a, b) => a.points - b.points || a.cards - b.cards)
  s.standings = [winnerRow, ...others]
  s.winnerScore = others.reduce((sum, r) => sum + r.points, 0)
  s.endReason = reason
}

// End the game on points: the lowest total wins (fewest cards breaks a tie)
function finishByPoints(s, reason) {
  const best = activePlayers(s).sort((a, b) => totalPoints(s, a) - totalPoints(s, b) || s.players[a].hand.length - s.players[b].hand.length)[0]
  s.winner = best
  scoreGame(s, reason)
  addLog(s, `${reason}: ${s.players[best].name} wins with the fewest points (${totalPoints(s, best)})!`)
}

// Nobody could play for a full round in Deathmatch (or nothing left to draw): decided on points
function endIfStuck(s) {
  s.stall += 1
  if (s.stall < activePlayers(s).length) return false
  finishByPoints(s, 'Nobody can play')
  return true
}

// ---------- New game ----------

export function newGame(seats, modeKey = 'classic', settings = {}) {
  const mode = MODES[modeKey] ?? MODES.classic
  const s = {
    mode: modeKey,
    rules: mode.rules(settings),
    settings, // kept so "Play again" can reuse them
    side: 'light', // Flip: which side of the cards is in play
    players: seats.map((p) => ({ ...p, hand: [], out: false, power: true, penalty: 0 })),
    drawPile: shuffle(mode.deck()),
    discard: [],
    currentColor: null,
    current: 0,
    direction: 1, // 1 = clockwise, -1 = counter-clockwise
    drawnCardId: null, // set after drawing a playable card: you may play it or pass
    saidUno: false,
    winner: null,
    log: [],
    viewer: null,
    turn: 0,
    lastPlay: null,
    event: null,
    eventId: 0,
    pending: null, // stacked draw penalty: { amount, last }
    roulette: false, // Color Roulette: the current player must pick a color and flip for it
    stall: 0, // turns in a row where nobody could play (see endIfStuck)
    deathmatch: false, // nothing left to draw (see the top of this file)
  }
  s.deckSize = s.drawPile.length

  for (let r = 0; r < (s.rules.handSize ?? HAND_SIZE); r++) {
    for (let p = 0; p < s.players.length; p++) takeOne(s, p)
  }

  // the first card must be a number; others go back to the bottom of the deck
  let first = s.drawPile.pop()
  while (!isNumber(face(first, 'light'))) {
    s.drawPile.unshift(first)
    first = s.drawPile.pop()
  }
  s.discard.push(first)
  s.currentColor = face(first, 'light').color

  addLog(s, `${mode.name} game started. First card: ${label(face(first, 'light'))}`)
  setView(s)
  return s
}

// ---------- Playing a card ----------

function play(s, cardId, opts = {}) {
  const player = s.players[s.current]
  const index = player.hand.findIndex((c) => c.id === cardId)
  if (index === -1) return null
  const card = player.hand[index]
  if (s.drawnCardId !== null && card.id !== s.drawnCardId) return null
  if (!canPlay(card, s, player)) return null

  const f = faceOf(s, card)
  const m = meta(f.value)
  const need = choicesNeeded(card, s)
  if (need.color && !need.color.includes(opts.color)) return null
  const flexing = s.rules.flex && !!card.flex && player.power && (opts.flex || needsFlex(card, s))
  if (opts.flex && !flexing) return null
  let target = null
  if (need.target) {
    target = opts.target
    if (target == null || target === s.current || !s.players[target] || s.players[target].out) target = fewestCardsOpponent(s)
  }

  // move the card (and, for Discard All, every card of that color) to the pile
  player.hand.splice(index, 1)
  if (m.discardAll) {
    const same = player.hand.filter((c) => faceOf(s, c).color === f.color)
    player.hand = player.hand.filter((c) => faceOf(s, c).color !== f.color)
    s.discard.push(...same)
    if (same.length) addLog(s, `${player.name} discards ${same.length} more ${f.color} card${same.length === 1 ? '' : 's'}`)
  }
  s.discard.push(card)
  s.lastPlay = { by: s.current, cardId: card.id }
  s.stall = 0

  if (flexing) {
    player.power = false
    s.currentColor = card.flex
    addLog(s, `${player.name} FLEXES ${label(f)} into ${card.flex}`)
    addEvent(s, 'flex', 'Flex!')
  } else if (m.roulette) {
    // the color stays as it is until the next player picks one
    addLog(s, `${player.name} plays ${label(f)}: the next player picks a color`)
  } else if (!m.flip) {
    s.currentColor = m.wild ? opts.color : f.color
    addLog(s, `${player.name} plays ${label(f)}${m.wild ? ` and picks ${opts.color}` : ''}`)
    if (m.wild && !m.draw) addEvent(s, 'color', opts.color)
  }

  // win
  if (player.hand.length === 0) {
    s.winner = s.current
    addLog(s, `${player.name} wins!`)
    if (s.deathmatch) scoreGame(s, 'Deathmatch')
    return s
  }

  // one card left: you must have called UNO (bots always remember)
  if (player.hand.length === 1) {
    if (player.isBot || s.saidUno) {
      if (player.isBot) {
        addLog(s, `${player.name} calls UNO!`)
        addEvent(s, 'uno', 'UNO!')
      }
    } else if (s.rules.launcher) {
      const n = hit(s, s.current) + hit(s, s.current)
      addLog(s, `${player.name} forgot to call UNO: 2 launcher hits, ${n} cards`)
    } else {
      drawCards(s, s.current, 2)
      addLog(s, `${player.name} forgot to call UNO and draws 2`)
    }
    if (player.out) return advance(s, 1), s
  }

  // ----- card effects -----
  const victim = nextIndex(s, 1)

  // Flex: flexed actions hit everyone
  if (flexing && m.draw) {
    for (const i of activePlayers(s)) if (i !== s.current) drawCards(s, i, m.draw)
    addLog(s, `Everyone else draws ${m.draw}`)
    addEvent(s, 'draw', `All +${m.draw}`)
    advance(s, 1)
  } else if (flexing && m.skip) {
    addLog(s, `${player.name} skips everyone and goes again`)
    addEvent(s, 'skip', 'Skip all!')
    advance(s, 0)
  } else if (flexing && m.reverse) {
    s.direction *= -1
    addLog(s, `${player.name} reverses and goes again`)
    addEvent(s, 'reverse', 'Reverse!')
    advance(s, 0)
  } else if (m.flip) {
    s.side = otherSide(s.side)
    s.drawPile.reverse() // the whole draw pile is turned over
    const nf = faceOf(s, card)
    s.currentColor = meta(nf.value).wild ? opts.color : nf.color
    addLog(s, `${player.name} plays Flip: everything turns to the ${s.side} side${meta(nf.value).wild ? ` (${opts.color})` : ''}`)
    addEvent(s, 'flip', s.side === 'dark' ? 'Dark side!' : 'Light side!')
    advance(s, 1)
  } else if (s.rules.sevenO && f.value === '7') {
    swapHands(s, s.current, target)
    addLog(s, `${player.name} swaps hands with ${s.players[target].name}`)
    addEvent(s, 'swap', 'Swap!')
    advance(s, 1)
  } else if (s.rules.sevenO && f.value === '0') {
    rotateHands(s)
    addLog(s, 'Every hand moves to the next player')
    addEvent(s, 'swap', 'Pass hands!')
    advance(s, 1)
  } else if (m.trade) {
    swapHands(s, s.current, target)
    addLog(s, `${player.name} trades hands with ${s.players[target].name}`)
    addEvent(s, 'swap', 'Trade!')
    advance(s, 1)
  } else if (m.skipAll) {
    addLog(s, `${player.name} skips everyone and goes again`)
    addEvent(s, 'skip', 'Skip all!')
    advance(s, 0)
  } else if (m.skip) {
    addLog(s, `${s.players[victim].name} is skipped`)
    addEvent(s, 'skip', 'Skip!')
    advance(s, 2)
  } else if (m.draw && m.reverse && activePlayers(s).length === 2) {
    // Wild Reverse Draw 4 with only 2 players: it skips the other player and YOU draw 4
    // (with stacking you may answer it yourself to send the penalty back)
    s.direction *= -1
    addEvent(s, 'reverse', 'Reverse!')
    if (s.rules.stacking) {
      s.pending = { amount: (s.pending?.amount ?? 0) + m.draw, last: m.draw }
      addLog(s, `With 2 players it comes back: ${player.name} must stack it or take +${s.pending.amount}`)
      advance(s, 0)
    } else {
      drawCards(s, s.current, m.draw)
      addLog(s, `With 2 players it comes back: ${player.name} draws ${m.draw}`)
      advance(s, 0)
    }
  } else if (m.draw) {
    if (m.reverse) {
      s.direction *= -1
      addEvent(s, 'reverse', 'Reverse!')
    }
    drawPenalty(s, m.draw)
  } else if (m.reverse) {
    addEvent(s, 'reverse', 'Reverse!')
    if (activePlayers(s).length === 2) advance(s, 2) // with 2 players, Reverse works like Skip
    else {
      s.direction *= -1
      addLog(s, 'Direction reversed')
      advance(s, 1)
    }
  } else if (m.drawColor) {
    const got = drawUntil(s, victim, (c) => faceOf(s, c).color === s.currentColor)
    if (s.deathmatch && got.length === 0) addPenalty(s, victim, 10)
    addLog(s, `${s.players[victim].name} draws ${got.length} looking for ${s.currentColor}`)
    addEvent(s, 'draw', `+${got.length}`)
    skipVictim(s, victim)
  } else if (m.roulette && s.deathmatch) {
    addPenalty(s, victim, 10) // nothing to flip: 10 points instead
    addEvent(s, 'roulette', '+10 pts')
    skipVictim(s, victim)
  } else if (m.roulette) {
    s.roulette = true
    addEvent(s, 'roulette', 'Roulette!')
    advance(s, 1)
  } else if (m.hits) {
    const n = hit(s, victim) + hit(s, victim)
    addLog(s, `${s.players[victim].name} hits the launcher twice: ${n} card${n === 1 ? '' : 's'}`)
    addEvent(s, 'launch', n ? `+${n}` : 'Phew!')
    skipVictim(s, victim)
  } else if (m.hitFire) {
    let n = 0
    for (let tries = 0; tries < 50 && n === 0; tries++) n = hit(s, victim)
    addLog(s, `${s.players[victim].name} hits the launcher until it fires: ${n} cards`)
    addEvent(s, 'launch', `+${n}`)
    skipVictim(s, victim)
  } else if (m.allHit) {
    let total = 0
    for (const i of activePlayers(s)) if (i !== s.current) total += hit(s, i)
    addLog(s, `Everyone else hits the launcher: ${total} cards in total`)
    addEvent(s, 'launch', total ? `+${total}` : 'Phew!')
    advance(s, 1)
  } else {
    advance(s, 1)
  }
  return s
}

// ---------- Reducer ----------

export function gameReducer(state, action) {
  if (action.type === 'NEW') return newGame(action.seats, action.mode, action.settings)
  if (action.type === 'QUIT') return null
  if (!state || state.winner !== null) return state

  const s = structuredClone(state) // work on a copy, never change the old state
  const player = s.players[s.current]

  switch (action.type) {
    case 'PLAY':
      return play(s, action.cardId, action) ?? state

    case 'JUMP': {
      const jumper = s.players[action.player]
      const card = jumper?.hand.find((c) => c.id === action.cardId)
      if (!card || !canJumpIn(card, s, action.player)) return state
      s.current = action.player
      s.drawnCardId = null
      s.saidUno = true // jumping in counts as calling UNO
      setView(s)
      addLog(s, `${jumper.name} jumps in!`)
      addEvent(s, 'jump', 'Jump in!')
      return play(s, card.id, action) ?? state
    }

    case 'DRAW': {
      if (s.roulette) return state
      // a stacked penalty is waiting: take it all, and your turn is over
      if (s.pending) {
        const amount = s.pending.amount
        s.pending = null
        if (s.rules.launcher) {
          let n = 0
          for (let i = 0; i < amount; i++) n += hit(s, s.current)
          addLog(s, `${player.name} takes the hit: ${n} cards`)
        } else {
          drawCards(s, s.current, amount)
          addLog(s, `${player.name} draws ${amount}`)
        }
        addEvent(s, 'draw', s.deathmatch ? `+${amount} pts` : `+${amount}`)
        advance(s, 1)
        return s
      }
      if (s.drawnCardId !== null) return state // already drew this turn

      // Deathmatch: nothing to draw, so "draw" means pass
      if (s.deathmatch) {
        addLog(s, `${player.name} can't play and passes`)
        if (endIfStuck(s)) return s
        advance(s, 1)
        return s
      }

      if (s.rules.flex && !player.power) {
        player.power = true
        addLog(s, `${player.name}'s power recharges`)
      }

      // Attack: hit the launcher instead of drawing. Your turn ends either way.
      if (s.rules.launcher) {
        const n = hit(s, s.current)
        addLog(s, `${player.name} hits the launcher: ${n ? `${n} card${n === 1 ? '' : 's'}!` : 'nothing!'}`)
        addEvent(s, 'launch', n ? `+${n}` : 'Phew!')
        advance(s, 1)
        return s
      }

      const got = s.rules.drawUntil
        ? drawUntil(s, s.current, (c) => canPlay(c, s, player))
        : [takeOne(s, s.current)].filter(Boolean)
      if (!s.rules.drawUntil) checkMercy(s, s.current)
      if (player.out || got.length === 0) {
        if (got.length === 0) {
          addLog(s, 'No cards left to draw')
          if (endIfStuck(s)) return s
        }
        advance(s, 1)
        return s
      }
      const card = got[got.length - 1]
      const count = got.length === 1 ? 'a card' : `${got.length} cards`
      if (canPlay(card, s, player)) {
        s.drawnCardId = card.id
        addLog(s, `${player.name} draws ${count}`)
      } else {
        addLog(s, `${player.name} draws ${count} and passes`)
        advance(s, 1)
      }
      return s
    }

    case 'PASS':
      if (s.drawnCardId === null) return state // you must draw before passing
      addLog(s, `${player.name} passes`)
      advance(s, 1)
      return s

    case 'ROULETTE': {
      if (!s.roulette || !colorsFor(s.side).includes(action.color)) return state
      s.roulette = false
      const got = drawUntil(s, s.current, (c) => faceOf(s, c).color === action.color)
      if (got.length === 0) addPenalty(s, s.current, 10)
      s.currentColor = action.color
      addLog(s, `${player.name} flips ${got.length} card${got.length === 1 ? '' : 's'} to find ${action.color}`)
      addEvent(s, 'draw', `+${got.length}`)
      advance(s, 1)
      return s
    }

    case 'CALL_UNO':
      // only when a card you can play now would leave you with one card (2 cards, or a Discard All that clears a color)
      if (!canCallUno(s, s.current)) return state
      s.saidUno = true
      addLog(s, `${player.name} calls UNO!`)
      addEvent(s, 'uno', 'UNO!')
      return s

    default:
      return state
  }
}
