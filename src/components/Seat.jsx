import Avatar from './Avatar.jsx'
import { face, otherSide } from '../game/deck.js'

// Deathmatch: a player's points, split into cards in hand + penalty points = total
export function PointsBreakdown({ cards, penalty }) {
  return (
    <div className="points-row" title={`${cards} points from cards in hand + ${penalty} penalty points`}>
      <span className="pts-cards">🃏 {cards}</span>
      {penalty > 0 && <span key={`pen-${penalty}`} className="pts-pen">+{penalty}</span>}
      <span key={`tot-${cards + penalty}`} className="pts-total">= {cards + penalty} pts</span>
    </div>
  )
}

// Flex: shows whether this player's power is charged
export function PowerBadge({ on }) {
  return (
    <span className={`power ${on ? 'on' : 'off'}`} title={on ? 'Flex power charged' : 'Flex power used (draw to recharge)'}>
      ⚡
    </span>
  )
}

// An opponent at the table: avatar, name, card count and a fan of their cards (backs, or in Flip the other side)
// position: top/left/right, or 'arc' with a spot {x, y} (in %) for tables with 4+ opponents
export default function Seat({ player, index, active, position, spot, side, rules, deathmatch }) {
  const n = player.hand.length
  const shown = Math.min(n, position === 'arc' ? 6 : 10)
  const vertical = position === 'left' || position === 'right'
  const danger = rules.mercy && n >= rules.mercy - 5

  return (
    <div
      className={`seat ${position}${active ? ' active' : ''}${player.out ? ' out' : ''}`}
      style={spot ? { left: `${spot.x}%`, top: `${spot.y}%` } : undefined}
    >
      <div className="seat-head">
        <Avatar player={player} index={index} active={active} size={position === 'arc' ? 48 : 72} />
        <div className="seat-info">
          <div className="name-tag">{player.name}</div>
          <div className="seat-meta">
            {/* key={n} remounts the badge when the count changes, replaying the bump animation */}
            <div key={`count-${n}`} className={`count-badge${danger ? ' danger' : ''}`} title={danger ? `Out at ${rules.mercy} cards` : `${n} cards in hand`}>
              {n}
            </div>
            {rules.flex && <PowerBadge on={player.power} />}
          </div>
          {/* Deathmatch: opponents only show their penalty points; their card points stay secret */}
          {deathmatch && player.penalty > 0 && (
            <span key={`pen-${player.penalty}`} className="penalty-chip" title="Penalty points">
              +{player.penalty} pen
            </span>
          )}
          {active && player.isBot && <div className="thinking"><span /><span /><span /></div>}
        </div>
      </div>

      <div className={`fan${vertical ? ' vertical' : ''}`}>
        {player.hand.slice(0, shown).map((card, i) => {
          // Flip: everyone sees the OTHER side of your cards
          const other = rules.flip ? face(card, otherSide(side)) : null
          return (
            <span
              key={i}
              className={`fan-card${other ? ` peek-face ${other.color}` : ''}`}
              style={{
                '--r': `${(i - (shown - 1) / 2) * 6}deg`,
                '--i': i,
              }}
            />
          )
        })}
      </div>

      {n === 1 && !player.out && <div className="uno-flag">UNO!</div>}
      {player.out && <div className="out-stamp">OUT</div>}
    </div>
  )
}
