import { useEffect, useRef, useState } from 'react'
import { canPlay, canJumpIn, choicesNeeded, needsFlex, topCard, faceOf, colorsFor, activePlayers, DEATHMATCH_TURNS, handPoints } from '../game/rules.js'
import { botMove, botJumpIn } from '../game/bot.js'
import { MODES } from '../game/modes.js'
import { face, otherSide, meta } from '../game/deck.js'
import Card from './Card.jsx'
import { useDrawFlights, DrawFlights } from './DrawFlights.jsx'
import { useHandMoves, HandMoves, HAND_ARRIVES_MS } from './HandMoves.jsx'
import { backImageFor } from '../game/cardImages.js'
import Seat, { PowerBadge, PointsBreakdown } from './Seat.jsx'
import Avatar from './Avatar.jsx'
import DiscardPile from './DiscardPile.jsx'
import DirectionRing from './DirectionRing.jsx'
import { Particles, EventBanner } from './Effects.jsx'
import { ColorPicker, ChoiceDialog, GameOver } from './Overlays.jsx'

const BOT_DELAY = 1100 // ms a bot "thinks" before moving
const JUMP_DELAY = 650 // ms before a bot jumps in
const GLOW = {
  red: '#e5383b', yellow: '#f2b705', green: '#22a45d', blue: '#2f6fe4',
  pink: '#ec4899', teal: '#14b8a6', orange: '#f97316', purple: '#8b5cf6',
}
const ORDER = ['red', 'yellow', 'green', 'blue', 'pink', 'teal', 'orange', 'purple', 'wild']
// where opponents sit, going clockwise from you (bottom)
const LAYOUT = { 1: ['top'], 2: ['left', 'right'], 3: ['left', 'top', 'right'] }

// 4 or more opponents: spaced evenly from left to right, each sitting on the top half of the oval
function arcSeat(k, total) {
  const x = 8 + (k * 84) / (total - 1) // % of the table width
  const dx = (x - 50) / 44
  const y = 62 - 40 * Math.sqrt(Math.max(0, 1 - dx * dx)) // % of the table height; the top seat stays clear of the turn indicator
  return {
    x,
    y,
    // a played card flies in from this direction
    from: [`${Math.round(((x - 50) / 50) * 520)}px`, `${Math.round(((y - 62) / 40) * 300)}px`],
  }
}

export default function Game({ game, dispatch, onRestart, onQuit, online }) {
  // a card waiting for choices (color, swap target, flex) before it is played
  const [choice, setChoice] = useState(null)
  // which card in your hand the mouse is over (the hand spreads around it)
  const [hovered, setHovered] = useState(null)

  // Deathmatch warning: shown to everyone the moment Deathmatch starts
  const [dmNotice, setDmNotice] = useState(false)
  const wasDeathmatch = useRef(game.deathmatch)
  useEffect(() => {
    if (game.deathmatch && !wasDeathmatch.current) setDmNotice(true)
    wasDeathmatch.current = game.deathmatch
  }, [game.deathmatch])
  useEffect(() => {
    if (!dmNotice) return
    const timer = setTimeout(() => setDmNotice(false), 3000) // shows for 3 seconds
    return () => clearTimeout(timer)
  }, [dmNotice])

  const { players, rules, side } = game
  const mode = MODES[game.mode]
  const current = players[game.current]
  const over = game.winner !== null
  const viewer = online ? online.seat : game.viewer
  const runBots = !online || online.isHost // in an online room only the host's browser runs the bots
  const me = players[viewer]
  const myTurn = !over && !current.isBot && viewer === game.current
  const passAndPlay = !online && players.filter((p) => !p.isBot).length > 1
  const face_ = (c) => faceOf(game, c)

  // remember the previous viewer so we know when the view just switched
  const lastViewer = useRef(viewer)
  const justSwitched = lastViewer.current !== viewer
  useEffect(() => {
    lastViewer.current = viewer
  }, [viewer])

  // cards flying from the draw pile to whoever drew them
  const { flights, arriving } = useDrawFlights(game, viewer)

  // Seven-O / trades: hands fly between players; your new hand is dealt in once it lands
  const moves = useHandMoves(game, viewer)
  const lastMove = useRef(game.handMove?.id ?? null)
  const lateDeal = useRef(new Map()) // card id -> deal-in delay (ms)
  if ((game.handMove?.id ?? null) !== lastMove.current) {
    lastMove.current = game.handMove?.id ?? null
    if (game.handMove?.moves.some(([, to]) => to === viewer)) {
      lateDeal.current = new Map(players[viewer].hand.map((c, i) => [c.id, HAND_ARRIVES_MS + i * 45]))
    }
  }

  // your turn: a quick "Your turn!" pop when it starts, and the browser tab says so too
  const [turnFlash, setTurnFlash] = useState(0)
  const turnKey = myTurn ? `${game.current}:${viewer}` : null
  const lastTurnKey = useRef(null)
  useEffect(() => {
    if (turnKey && turnKey !== lastTurnKey.current) setTurnFlash((n) => n + 1)
    lastTurnKey.current = turnKey
  }, [turnKey])
  useEffect(() => {
    if (!turnFlash) return
    const t = setTimeout(() => setTurnFlash(0), 1400)
    return () => clearTimeout(t)
  }, [turnFlash])
  useEffect(() => {
    const base = 'UNO | Card Game'
    document.title = myTurn && !over ? '● Your turn! | UNO' : base
    return () => {
      document.title = base
    }
  }, [myTurn, over])

  // keep track of the screen width so the hand can squeeze to fit
  const [screenWidth, setScreenWidth] = useState(() => window.innerWidth)
  useEffect(() => {
    const onResize = () => setScreenWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Flip: on the render right after the side changes, cards play a flip-over animation
  const lastSide = useRef(side)
  const justFlipped = lastSide.current !== side
  useEffect(() => {
    lastSide.current = side
  }, [side])

  // bots: take their turn after a short delay
  useEffect(() => {
    if (over || !current.isBot || !runBots || dmNotice) return // bots wait while the Deathmatch warning is up
    const timer = setTimeout(() => dispatch(botMove(game)), BOT_DELAY)
    return () => clearTimeout(timer)
  }, [game, over, current, dispatch, runBots, dmNotice])

  // bots: jump in when they hold the exact top card (Jump-in rule)
  useEffect(() => {
    if (over || !rules.jumpIn || !runBots) return
    const jump = botJumpIn(game)
    if (!jump || Math.random() < 0.4) return
    const timer = setTimeout(() => dispatch(jump), JUMP_DELAY)
    return () => clearTimeout(timer)
  }, [game, over, rules.jumpIn, dispatch, runBots])

  // your own card points (only you see your full breakdown in Deathmatch)
  const myPoints = handPoints(game, players[viewer].hand)

  // ---- seating: the viewer sits at the bottom, everyone else around the table ----
  const anchor = viewer
  const others = Array.from({ length: players.length - 1 }, (_, k) => (anchor + 1 + k) % players.length)
  const positionOf = { [anchor]: 'bottom' }
  const arc = {} // seat spots for big tables
  others.forEach((idx, k) => {
    if (others.length <= 3) positionOf[idx] = LAYOUT[others.length][k]
    else {
      positionOf[idx] = 'arc'
      arc[idx] = arcSeat(k, others.length)
    }
  })
  const flyFrom = (idx) => (positionOf[idx] === 'arc' ? arc[idx].from : positionOf[idx])

  const hand = [...me.hand].sort(
    (a, b) => ORDER.indexOf(face_(a).color) - ORDER.indexOf(face_(b).color) || face_(a).value.localeCompare(face_(b).value),
  )

  // which of my cards can be played right now (or jumped in with)
  const playable = new Set(
    myTurn
      ? me.hand.filter((c) => canPlay(c, game, me)).filter((c) => game.drawnCardId === null || c.id === game.drawnCardId).map((c) => c.id)
      : [],
  )
  const jumpable = new Set(!myTurn && !over && !me.out ? me.hand.filter((c) => canJumpIn(c, game, viewer)).map((c) => c.id) : [])
  const mustDraw = myTurn && !game.roulette && game.drawnCardId === null && playable.size === 0

  // ---- playing a card: collect any choices it needs, then dispatch ----
  function proceed(sel) {
    const need = choicesNeeded(sel.card, game)
    const canFlex = rules.flex && sel.card.flex && me.power
    if (sel.flex === undefined && canFlex) {
      if (needsFlex(sel.card, game)) sel = { ...sel, flex: true }
      else return setChoice({ ...sel, step: 'flex' })
    }
    if (need.color && !sel.color) return setChoice({ ...sel, step: 'color', colors: need.color })
    if (need.target && sel.target == null) {
      const opponents = activePlayers(game).filter((i) => i !== viewer)
      if (opponents.length === 1) sel = { ...sel, target: opponents[0] }
      else return setChoice({ ...sel, step: 'target' })
    }
    dispatch({
      type: sel.jump ? 'JUMP' : 'PLAY',
      player: viewer,
      cardId: sel.card.id,
      color: sel.color,
      target: sel.target,
      flex: sel.flex,
    })
    setChoice(null)
  }
  const startPlay = (card, jump = false) => proceed({ card, jump })

  // ---- status line ----
  let status
  if (over) status = `${players[game.winner].name} wins!`
  else if (me.out && viewer === anchor && !myTurn && !current.isBot) status = `${current.name}'s turn`
  else if (current.isBot) status = `${current.name} is thinking…`
  else if (!myTurn) status = `${current.name}'s turn`
  else if (game.roulette) status = 'Color Roulette! Pick a color'
  else if (game.pending && game.deathmatch) status = playable.size ? `Stack a draw card, or take +${game.pending.amount} points` : `Take +${game.pending.amount} points`
  else if (game.pending) status = playable.size ? `Stack a draw card, or take +${game.pending.amount}` : `Take +${game.pending.amount}`
  else if (mustDraw && game.deathmatch) status = 'Deathmatch: no match, pass your turn'
  else if (game.drawnCardId !== null) status = 'Play the card you drew, or pass'
  else if (mustDraw) status = rules.launcher ? 'No match. Hit the launcher!' : 'No match. Draw a card'
  else status = passAndPlay ? `${current.name}'s turn` : 'Your turn'

  // spread the hand so it always fits the screen: the more cards, the more they overlap
  // big hands are squeezed tighter, and the hovered card gets room to show itself
  const cardWidth = screenWidth <= 760 ? 60 : 84
  const room = Math.min(screenWidth - 60, hand.length > 12 ? 880 : 1100)
  let step = cardWidth - 24 // distance between card edges when there is plenty of room
  if (hand.length > 1 && cardWidth + (hand.length - 1) * step > room) step = (room - cardWidth) / (hand.length - 1)
  const overlap = step - cardWidth
  const spread = Math.max(0, (cardWidth * 1.05 - step) / 2) // how far neighbours slide away from the hovered card
  const fan = hand.length > 1 ? Math.min(5, 40 / hand.length) : 0 // degrees between cards
  const top = topCard(game)
  const nextDraw = game.drawPile[game.drawPile.length - 1]

  const backImg = backImageFor(game.mode) // optional image file for this mode's card back
  return (
    <div
      className={`table side-${side} theme-${game.mode}${game.deathmatch ? ' deathmatch' : ''}${backImg ? ' has-back-img' : ''}${others.length > 3 ? ' big-table' : ''}`}
      style={{ '--glow': GLOW[game.currentColor] ?? '#e5383b', ...(backImg && { '--back-img': `url(${backImg})` }) }}
    >
      <Particles />

      <header className="topbar">
        <span className="brand">
          UNO <span className="mode-name">{mode.name}</span>
          {online && <span className="room-chip" title="Online room code">🌐 {online.code}</span>}
          {game.deathmatch && <span className="room-chip dm" title="Nothing left to draw: draw penalties become points">☠ Deathmatch</span>}
          {rules.flip && (
            <span key={side} className={`side-badge ${side}`}>
              {side === 'dark' ? 'Dark side' : 'Light side'}
            </span>
          )}
        </span>
        <span className="pill-stack">
          <span className={`turn-pill${myTurn ? ' mine' : ''}`}>{status}</span>
          {/* Deathmatch lasts DEATHMATCH_TURNS turns: always show how many are left */}
          {game.deathmatch && !over && (() => {
            const left = DEATHMATCH_TURNS - (game.turn - game.deathmatchStart)
            return (
              <span key={game.turn} className={`turns-left${left <= 10 ? ' urgent' : ''}`} title="When Deathmatch runs out of turns, fewest points wins">
                ☠ {left} turn{left === 1 ? '' : 's'} left
              </span>
            )
          })()}
        </span>
        <button className="btn-ghost" onClick={onQuit}>Quit</button>
      </header>

      <div className="arena">
        {/* opponents. key={anchor}: when the view switches to another player, the seats fade in again */}
        <div key={anchor} className="opponents">
          {others.map((idx) => (
            <Seat
              key={idx}
              player={players[idx]}
              index={idx}
              position={positionOf[idx]}
              spot={arc[idx]}
              deathmatch={game.deathmatch}
              active={idx === game.current && !over}
              side={side}
              rules={rules}
            />
          ))}
        </div>

        {/* middle of the table */}
        <div className="center">
          <DirectionRing direction={game.direction} />

          {rules.launcher ? (
            <button className={`launcher${mustDraw ? ' hint' : ''}`} disabled={!myTurn || game.drawnCardId !== null} onClick={() => dispatch({ type: 'DRAW' })} title="Hit the launcher">
              <span className="launcher-dome">HIT</span>
              <span className="deck-count">{game.drawPile.length}</span>
            </button>
          ) : (
            <button
              className={`deck${mustDraw || (myTurn && game.pending) ? ' hint' : ''}`}
              disabled={!myTurn || game.drawnCardId !== null || game.roulette}
              onClick={() => dispatch({ type: 'DRAW' })}
              title={game.pending ? `Take +${game.pending.amount}` : game.deathmatch ? 'Nothing to draw: pass' : 'Draw a card'}
            >
              {/* Flip: you can see the other side of the top card of the draw pile */}
              {game.deathmatch ? (
                <span className="empty-deck">☠</span>
              ) : rules.flip && nextDraw ? (
                <Card card={nextDraw} side={otherSide(side)} peek />
              ) : (
                <Card faceDown />
              )}
              {/* the number of cards left is always shown; what clicking the deck does is a separate label */}
              <span className="deck-count" title="Cards left in the draw pile">{game.drawPile.length}</span>
              {myTurn && (game.pending || game.deathmatch) && (
                <span className="deck-action">
                  {game.pending ? `Take +${game.pending.amount}${game.deathmatch ? ' pts' : ''}` : 'Pass'}
                </span>
              )}
            </button>
          )}

          <div className="discard-wrap">
            <DiscardPile discard={game.discard} side={side} rules={rules} flipIn={justFlipped} from={game.lastPlay ? flyFrom(game.lastPlay.by) : 'deck'} />
            <span className="deck-count discard-count" title="Cards in the discard pile">{game.discard.length}</span>
            {game.pending && (
              <div key={game.pending.amount} className="stack-badge">+{game.pending.amount}</div>
            )}
            {meta(faceOf(game, top).value).wild && (
              <span className={`color-chip ${game.currentColor}`}>{game.currentColor}</span>
            )}
          </div>
          {game.event?.kind !== 'deathmatch' && <EventBanner key={game.event?.id ?? 0} event={game.event} />}
        </div>

        <ul className="log">
          {game.log.slice(0, 2).map((m, i) => <li key={i}>{m}</li>)}
        </ul>
      </div>

      {/* you */}
      <div className={`me${myTurn ? ' my-turn' : ''}${me.out ? ' out' : ''}`}>
        <div className="me-bar">
          <div className="me-id">
            <Avatar player={me} index={anchor} active={anchor === game.current && !over} size={52} />
            <div>
              <div className="name-tag">
                {me.name}
                {myTurn && <span className="your-turn-tag">Your turn</span>}
              </div>
              <div className="seat-meta">
                <div key={`count-${me.hand.length}`} title={`${me.hand.length} cards in hand`} className={`count-badge${rules.mercy && me.hand.length >= rules.mercy - 5 ? ' danger' : ''}`}>
                  {me.hand.length}
                </div>
                {rules.flex && <PowerBadge on={me.power} />}
              </div>
              {game.deathmatch && <PointsBreakdown cards={myPoints} penalty={me.penalty} />}
            </div>
          </div>
          <div className="row">
            {jumpable.size > 0 && <span className="jump-hint">Same card! Jump in →</span>}
            {myTurn && me.hand.length === 2 && playable.size > 0 && (
              <button className={`btn uno${game.saidUno ? '' : ' pulse'}`} disabled={game.saidUno} onClick={() => dispatch({ type: 'CALL_UNO' })}>
                {game.saidUno ? 'UNO called' : 'UNO!'}
              </button>
            )}
            {myTurn && game.drawnCardId !== null && (
              <button className="btn-ghost" onClick={() => dispatch({ type: 'PASS' })}>Pass</button>
            )}
          </div>
        </div>

        {me.out ? (
          <p className="out-note">You're out: {rules.mercy}+ cards. Watch the others finish!</p>
        ) : (
          /* key={anchor}: a new point of view re-deals that player's hand */
          <div key={anchor} className="hand">
            {hand.map((c, i) => {
              const offset = i - (hand.length - 1) / 2
              const canUse = playable.has(c.id) || jumpable.has(c.id)
              const shift = hovered === null || hovered === i ? 0 : i < hovered ? -spread : spread
              return (
                <div
                  key={c.id}
                  data-id={c.id}
                  className={`hand-slot${hovered === i ? ' hovered' : ''}${arriving.has(c.id) ? ' arriving' : ''}`}
                  onMouseEnter={() => setHovered(i)}
                  onMouseLeave={() => setHovered((h) => (h === i ? null : h))}
                  style={{
                    '--shift': `${shift}px`,
                    '--r': `${hovered === i ? 0 : offset * fan}deg`,
                    '--y': `${Math.min(28, Math.abs(offset) * Math.abs(offset) * fan * 0.25)}px`, // the curve never drops cards off the screen
                    marginLeft: i === 0 ? 0 : overlap,
                    animationDelay: lateDeal.current.has(c.id) ? `${lateDeal.current.get(c.id)}ms` : game.turn === 0 || justSwitched ? `${i * 70}ms` : '0ms',
                  }}
                >
                  <Card
                    card={c}
                    side={side}
                    rules={rules}
                    playable={playable.has(c.id)}
                    jumpable={jumpable.has(c.id)}
                    dim={myTurn && !playable.has(c.id)}
                    flipIn={justFlipped}
                    onClick={canUse ? () => startPlay(c, jumpable.has(c.id)) : undefined}
                  />
                </div>
              )
            })}
          </div>
        )}
      </div>

      <DrawFlights flights={flights} side={side} rules={rules} />
      <HandMoves moves={moves} />
      {turnFlash > 0 && <div key={turnFlash} className="turn-flash">Your turn!</div>}

      {/* ---- dialogs ---- */}
      {choice?.step === 'flex' && (
        <ChoiceDialog
          kicker="Flex card"
          title="Use your Flex power?"
          onCancel={() => setChoice(null)}
          options={[
            {
              key: 'normal',
              label: `Play as ${face_(choice.card).color}`,
              sub: 'Keep your power charged',
              icon: <span className={`dot ${face_(choice.card).color}`} />,
              onPick: () => proceed({ ...choice, flex: false }),
            },
            {
              key: 'flex',
              label: `Flex to ${choice.card.flex} ⚡`,
              sub: meta(face_(choice.card).value).draw
                ? 'Everyone else draws!'
                : meta(face_(choice.card).value).skip
                  ? 'Skip everyone and go again'
                  : meta(face_(choice.card).value).reverse
                    ? 'Reverse and go again'
                    : 'Change its color',
              tone: 'accent',
              icon: <span className={`dot ${choice.card.flex}`} />,
              onPick: () => proceed({ ...choice, flex: true }),
            },
          ]}
        />
      )}
      {choice?.step === 'color' && (
        <ColorPicker
          colors={choice.colors}
          card={choice.card}
          hand={me.hand}
          side={meta(face_(choice.card).value).flip ? otherSide(side) : side}
          kicker={meta(face_(choice.card).value).flip ? 'Flip: the other side is a Wild' : meta(face_(choice.card).value).name}
          onPick={(color) => proceed({ ...choice, color })}
          onCancel={() => setChoice(null)}
        />
      )}
      {choice?.step === 'target' && (
        <ChoiceDialog
          kicker={meta(face_(choice.card).value).trade ? 'Trade Hands' : 'Seven-O'}
          title="Swap hands with…"
          onCancel={() => setChoice(null)}
          options={activePlayers(game)
            .filter((i) => i !== viewer)
            .map((i) => ({
              key: i,
              label: players[i].name,
              sub: `${players[i].hand.length} card${players[i].hand.length === 1 ? '' : 's'}`,
              icon: <Avatar player={players[i]} index={i} size={40} />,
              onPick: () => proceed({ ...choice, target: i }),
            }))}
        />
      )}
      {myTurn && game.roulette && (
        <ColorPicker
          colors={colorsFor(side)}
          hand={me.hand}
          side={side}
          kicker="Wild Color Roulette"
          title="Pick a color"
          hint="You'll reveal cards until that color shows up (wild cards don't count), keep them all, and lose your turn."
          onPick={(color) => dispatch({ type: 'ROULETTE', color })}
        />
      )}

      {/* pass-and-play: a name ribbon sweeps across whenever the view switches to another player */}
      {passAndPlay && !over && <TurnRibbon key={anchor} player={me} index={anchor} />}
      {dmNotice && !over && <DeathmatchNotice />}
      {over && (
        <GameOver
          winner={players[game.winner]}
          players={players}
          standings={game.standings}
          winnerScore={game.winnerScore}
          reason={game.endReason}
          onRestart={onRestart}
          onQuit={onQuit}
        />
      )}
    </div>
  )
}

// Big ribbon with the player's avatar and name
function TurnRibbon({ player, index }) {
  return (
    <div className="turn-ribbon" aria-live="polite">
      <Avatar player={player} index={index} size={56} />
      <span>
        <small>Pass to</small>
        {player.name}
      </span>
    </div>
  )
}

// A short warning everyone sees when Deathmatch starts. It closes by itself; the full rules are in the menu.
function DeathmatchNotice() {
  return (
    <div className="dm-overlay" aria-live="assertive">
      <div className="dm-card">
        <div className="dm-skull">☠</div>
        <h2>Deathmatch!</h2>
        <p>Nothing left to draw · {DEATHMATCH_TURNS} turns to finish</p>
        <div className="dm-timer" />
      </div>
    </div>
  )
}
