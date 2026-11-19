import { useEffect, useState } from 'react'
import { face } from '../game/deck.js'
import { Confetti } from './Effects.jsx'

// ---------- Color picker: a radial menu with one segment per color ----------
const SIZE = 340
const C = SIZE / 2 // center
const R = 150 // outer radius
const r = 66 // inner radius (the hole for the hub)
const GAP = 7 // px gap between segments
const SHADES = {
  red: ['#ff7a7c', '#e5383b'],
  yellow: ['#ffd84d', '#f2b705'],
  green: ['#55d98f', '#22a45d'],
  blue: ['#6f9eff', '#2f6fe4'],
  pink: ['#f9a8d4', '#ec4899'],
  teal: ['#5eead4', '#14b8a6'],
  orange: ['#fdba74', '#f97316'],
  purple: ['#c4b5fd', '#8b5cf6'],
}
const DARK_TEXT = ['yellow']
const rad = (deg) => (deg * Math.PI) / 180
const pt = (radius, deg) => [C + radius * Math.cos(rad(deg)), C + radius * Math.sin(rad(deg))]

// a ring segment from angle `from` to `to`, with an even gap on both sides
function segmentPath(from, to) {
  const gapOuter = (GAP / R) * (180 / Math.PI)
  const gapInner = (GAP / r) * (180 / Math.PI)
  const [x0, y0] = pt(R, from + gapOuter)
  const [x1, y1] = pt(R, to - gapOuter)
  const [x2, y2] = pt(r, to - gapInner)
  const [x3, y3] = pt(r, from + gapInner)
  return `M${x0} ${y0} A${R} ${R} 0 0 1 ${x1} ${y1} L${x2} ${y2} A${r} ${r} 0 0 0 ${x3} ${y3} Z`
}

const cap = (c) => c[0].toUpperCase() + c.slice(1)

// colors: the 4 colors to offer   side: which card side to count your colors on (Flip)
export function ColorPicker({ colors, card, hand = [], side = 'light', kicker, title = 'Choose a color', hint, onPick, onCancel }) {
  const [hover, setHover] = useState(null)
  const segments = colors.map((color, i) => ({ color, from: 180 + i * 90, to: 270 + i * 90, light: SHADES[color][0], base: SHADES[color][1] }))

  // how many cards of each color you hold (not counting the card being played)
  const counts = Object.fromEntries(colors.map((c) => [c, hand.filter((h) => h.id !== card?.id && face(h, side).color === c).length]))
  const most = Math.max(...Object.values(counts))
  const best = most > 0 ? colors.find((c) => counts[c] === most) : null

  // keyboard: 1-4 or the first letter of the color to pick, Esc to cancel
  useEffect(() => {
    function onKey(e) {
      const k = e.key.toLowerCase()
      if (k === 'escape' && onCancel) return onCancel()
      const byLetter = colors.filter((c) => c[0] === k)
      const pick = colors[Number(k) - 1] ?? (byLetter.length === 1 ? byLetter[0] : null)
      if (pick) onPick(pick)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [colors, onPick, onCancel])

  const hovered = segments.find((s) => s.color === hover)
  const value = card ? face(card, side === 'light' ? 'light' : side).value : null

  return (
    <div className="overlay picker-overlay" style={{ '--pick': hovered?.base ?? '#0b0b12' }} onClick={onCancel}>
      <div className="picker" onClick={(e) => e.stopPropagation()}>
        <div className="picker-title">
          {kicker && <small>{kicker}</small>}
          <h2>{title}</h2>
          {hint && <p className="muted small picker-hint">{hint}</p>}
        </div>

        <div className="radial">
          <svg viewBox={`0 0 ${SIZE} ${SIZE}`}>
            <defs>
              {segments.map((s) => (
                <radialGradient key={s.color} id={`seg-${s.color}`} cx={C} cy={C} r={R} gradientUnits="userSpaceOnUse">
                  <stop offset="40%" stopColor={s.light} />
                  <stop offset="100%" stopColor={s.base} />
                </radialGradient>
              ))}
            </defs>

            {segments.map((s, i) => {
              const mid = (s.from + s.to) / 2
              const [lx, ly] = pt((R + r) / 2 + 4, mid)
              const ink = DARK_TEXT.includes(s.color) ? '#2a1d00' : '#fff'
              return (
                <g
                  key={s.color}
                  className={`segment${hover === s.color ? ' active' : ''}${best === s.color ? ' best' : ''}`}
                  style={{ '--i': i, '--c': s.base, '--tx': `${Math.cos(rad(mid)) * 12}px`, '--ty': `${Math.sin(rad(mid)) * 12}px` }}
                  role="button"
                  tabIndex={0}
                  aria-label={`${s.color}, ${counts[s.color]} in hand`}
                  onMouseEnter={() => setHover(s.color)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(s.color)}
                  onBlur={() => setHover(null)}
                  onClick={() => onPick(s.color)}
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onPick(s.color)}
                >
                  <path d={segmentPath(s.from, s.to)} fill={`url(#seg-${s.color})`} stroke={s.base} strokeWidth="6" strokeLinejoin="round" />
                  <text x={lx} y={ly - 4} textAnchor="middle" className="seg-name" fill={ink}>{cap(s.color)}</text>
                  <text x={lx} y={ly + 15} textAnchor="middle" className="seg-count" fill={ink}>
                    {best === s.color ? '★ ' : ''}
                    {counts[s.color]} in hand
                  </text>
                </g>
              )
            })}
          </svg>

          {/* center: the color you're pointing at, or a spinning wheel */}
          <div className="hub" style={hovered ? { background: hovered.base } : undefined}>
            {hovered ? (
              <span key={hovered.color} className={`hub-label${DARK_TEXT.includes(hovered.color) ? ' dark' : ''}`}>{hovered.color}</span>
            ) : (
              <span className="hub-wild" style={{ background: `conic-gradient(${colors.map((c, i) => `${SHADES[c][1]} ${i * 25}% ${(i + 1) * 25}%`).join(', ')})` }}>
                {value && /^\+/.test(value) ? value : ''}
              </span>
            )}
          </div>
        </div>

        <div className="picker-foot">
          <span className="muted small">Keys <kbd>1</kbd>–<kbd>4</kbd></span>
          {onCancel && <button className="btn-ghost" onClick={onCancel}>Cancel <kbd>Esc</kbd></button>}
        </div>
      </div>
    </div>
  )
}

// A simple list of choices: who to swap hands with, or whether to flex a card
export function ChoiceDialog({ kicker, title, options, onCancel }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onCancel?.()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])
  return (
    <div className="overlay" onClick={onCancel}>
      <div className="modal pop choice" onClick={(e) => e.stopPropagation()}>
        {kicker && <small className="kicker">{kicker}</small>}
        <h2>{title}</h2>
        <div className="choice-list">
          {options.map((o, i) => (
            <button key={o.key} className={`choice-btn${o.tone ? ` ${o.tone}` : ''}`} style={{ '--i': i }} onClick={o.onPick}>
              {o.icon}
              <span className="choice-text">
                <strong>{o.label}</strong>
                {o.sub && <small>{o.sub}</small>}
              </span>
            </button>
          ))}
        </div>
        {onCancel && <button className="btn-ghost" onClick={onCancel}>Cancel</button>}
      </div>
    </div>
  )
}

// standings: set when the game went to Deathmatch (or was decided on points) - see scoreGame in rules.js
export function GameOver({ winner, players, standings, winnerScore, reason, onRestart, onQuit }) {
  return (
    <div className="overlay">
      <Confetti />
      <div className="modal pop">
        <div className="trophy">🏆</div>
        <h2 className="big">{winner.name} wins!</h2>
        {standings && (
          <>
            <p className="muted small end-reason">
              {reason === 'Deathmatch' ? '☠ Deathmatch: leftover cards are scored' : `☠ ${reason}: fewest points wins`}
            </p>
            <div className="winner-score">
              <span>{winner.name} scores</span>
              <strong>{winnerScore}</strong>
              <span>points</span>
            </div>
            <ol className="standings">
              {standings.map((r, i) => (
                <li key={r.index} style={{ '--i': i }}>
                  <span className="place">{i + 1}</span>
                  <span className="who">{players[r.index].name}</span>
                  <span className="pts">{r.points} pts</span>
                  <span className="cnt">
                    {r.cards} card{r.cards === 1 ? '' : 's'}
                    {players[r.index].penalty > 0 ? ` +${players[r.index].penalty} penalty` : ''}
                  </span>
                </li>
              ))}
            </ol>
            <p className="muted small points-key">Points: number = face value · wild = 10 · +N = N · other actions = 5</p>
          </>
        )}
        {onRestart ? (
          <div className="row">
            <button className="btn" onClick={onRestart}>Play again</button>
            <button className="btn-ghost" onClick={onQuit}>Change players</button>
          </div>
        ) : (
          <div className="row">
            <span className="muted">Waiting for the host to start the next game…</span>
            <button className="btn-ghost" onClick={onQuit}>Leave</button>
          </div>
        )}
      </div>
    </div>
  )
}
