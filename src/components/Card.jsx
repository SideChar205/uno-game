import { label, face as faceOf, meta, specialOf } from '../game/deck.js'
import { cardImage } from '../game/cardImages.js'

const FOUR = ['#e5383b', '#2f6fe4', '#f2b705', '#22a45d']
const FLEX_HEX = { red: '#e5383b', yellow: '#f2b705', green: '#22a45d', blue: '#2f6fe4' }

// Drawn icons for action cards (they use currentColor, so they match the card)
function Icon({ name, small }) {
  const common = { viewBox: '0 0 40 40', width: '100%', height: '100%', 'aria-hidden': true }
  const sw = small ? 5 : 4.5
  switch (name) {
    case 'skip':
      return (
        <svg {...common}>
          <circle cx="20" cy="20" r="12.5" fill="none" stroke="currentColor" strokeWidth={sw} />
          <line x1="11.5" y1="28.5" x2="28.5" y2="11.5" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" />
        </svg>
      )
    case 'reverse':
      return (
        <svg {...common} fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 23 V16 Q9 11 14 11 H25" />
          <polyline points="21,5.5 27,11 21,16.5" />
          <path d="M31 17 V24 Q31 29 26 29 H15" />
          <polyline points="19,23.5 13,29 19,34.5" />
        </svg>
      )
    case 'trade':
      return (
        <svg {...common} fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 14 H31" />
          <polyline points="25,8 31,14 25,20" />
          <path d="M32 27 H9" />
          <polyline points="15,21 9,27 15,33" />
        </svg>
      )
    case 'cards2':
      return (
        <svg {...common}>
          <rect x="7" y="12" width="15" height="21" rx="3" transform="rotate(-14 14 22)" fill="currentColor" stroke="#fff" strokeWidth="2" />
          <rect x="18" y="7" width="15" height="21" rx="3" transform="rotate(10 25 17)" fill="currentColor" stroke="#fff" strokeWidth="2" />
        </svg>
      )
    case 'cards3':
      return (
        <svg {...common}>
          {[-16, 0, 16].map((r, i) => (
            <rect key={r} x={9 + i * 5} y="8" width="14" height="20" rx="3" transform={`rotate(${r} ${16 + i * 5} 30)`} fill="currentColor" stroke="#fff" strokeWidth="2" />
          ))}
        </svg>
      )
    case 'four':
      return (
        <svg {...common}>
          {FOUR.map((c, i) => (
            <rect key={c} x={6 + i * 6.5} y="10" width="12" height="18" rx="2.5" transform={`rotate(${-21 + i * 14} ${12 + i * 6.5} 34)`} fill={c} stroke="#fff" strokeWidth="1.6" />
          ))}
        </svg>
      )
    case 'flip':
      return (
        <svg {...common} fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="13" y="9" width="14" height="20" rx="3" fill="currentColor" stroke="#fff" strokeWidth="2" transform="skewY(-8) translate(0 3)" />
          <path d="M6 22 Q6 34 18 34" />
          <polyline points="14,30 18,34 14,38" />
          <path d="M34 18 Q34 6 22 6" />
          <polyline points="26,2 22,6 26,10" />
        </svg>
      )
    case 'rotate':
      return (
        <svg {...common} fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M31 20 A11 11 0 1 1 26 10.5" />
          <polyline points="27,3.5 27,11 19.5,11" />
        </svg>
      )
    case 'pile6':
    case 'pile10': {
      // a messy pile of little cards: 6 or 10 of them
      const n = name === 'pile6' ? 6 : 10
      const spots = [[6, 9, -18], [15, 5, 8], [22, 12, -6], [9, 18, 14], [19, 20, -14], [26, 4, 20], [3, 24, 6], [24, 24, 10], [13, 12, 2], [28, 15, -22]]
      return (
        <svg {...common}>
          {spots.slice(0, n).map(([x, y, r], i) => (
            <rect key={i} x={x} y={y} width="10" height="14" rx="2" transform={`rotate(${r} ${x + 5} ${y + 7})`} fill={FOUR[i % 4]} stroke="#fff" strokeWidth="1.4" />
          ))}
        </svg>
      )
    }
    case 'target':
      return (
        <svg {...common} fill="none" stroke="currentColor" strokeWidth="3.5">
          <circle cx="20" cy="20" r="14" />
          <circle cx="20" cy="20" r="7.5" />
          <circle cx="20" cy="20" r="2" fill="currentColor" />
        </svg>
      )
    case 'wheel':
      return (
        <svg {...common}>
          {FOUR.map((c, i) => {
            const a0 = (i * Math.PI) / 2 - Math.PI / 2
            const a1 = a0 + Math.PI / 2
            const p = (a) => `${20 + 15 * Math.cos(a)} ${20 + 15 * Math.sin(a)}`
            return <path key={c} d={`M20 20 L${p(a0)} A15 15 0 0 1 ${p(a1)} Z`} fill={c} />
          })}
          <circle cx="20" cy="20" r="15" fill="none" stroke="#fff" strokeWidth="2" />
        </svg>
      )
    default:
      return null
  }
}

// How each value looks: corner text or icon, and the center (icon and/or big text)
const LOOK = {
  skip: { corner: 'skip', icon: 'skip' },
  reverse: { corner: 'reverse', icon: 'reverse' },
  draw1: { corner: '+1', text: '+1' },
  draw2: { corner: '+2', icon: 'cards2' },
  draw4: { corner: '+4', text: '+4' },
  draw5: { corner: '+5', text: '+5' },
  skipall: { corner: 'skip', icon: 'skip', sub: 'ALL' },
  discardall: { corner: 'ALL', icon: 'cards3', sub: 'ALL' },
  flip: { corner: 'flip', icon: 'flip' },
  hit2: { corner: 'H2', icon: 'target', sub: 'HIT 2' },
  trade: { corner: 'trade', icon: 'trade' },
  // wild cards: the oval itself is the four-color wheel, so they only need text or a white icon
  wild: { corner: 'wheel' },
  wild4: { corner: '+4', text: '+4' },
  wilddraw2: { corner: '+2', text: '+2' },
  wilddrawcolor: { corner: '+?', text: '+?' },
  wildrev4: { corner: '4', cornerIcon: 'reverse', icon: 'reverse', sub: '+4' },
  wild6: { corner: '+6', icon: 'pile6', plain: true },
  wild10: { corner: '+10', icon: 'pile10', plain: true },
  roulette: { corner: '?', text: '?' },
  wildhitfire: { corner: 'HF', icon: 'target', sub: 'FIRE' },
  wildallhit: { corner: 'AH', text: 'ALL', sub: 'HIT' },
}

const ICON_CORNERS = ['skip', 'reverse', 'trade', 'flip', 'wheel']

// The small mark in two corners: a number, a short text like "+4", an icon, or an icon + text
function Corner({ f, className }) {
  const look = LOOK[f.value]
  const c = look ? look.corner : f.value
  const icon = look?.cornerIcon ?? (ICON_CORNERS.includes(c) ? c : null)
  const text = ICON_CORNERS.includes(c) ? null : c
  return (
    <span className={`corner ${className}${text && text.length > 2 ? ' long' : ''}`}>
      {icon && (
        <span className="corner-icon">
          <Icon name={icon} small />
        </span>
      )}
      {text && <span className="corner-text">{text}</span>}
    </span>
  )
}

function Center({ f }) {
  const look = LOOK[f.value]
  if (!look) return f.value
  return (
    <span className="face-center">
      {look.icon && (
        <span className="center-icon">
          <Icon name={look.icon} />
        </span>
      )}
      {look.text && <span className="center-text">{look.text}</span>}
      {look.sub && <span className="center-sub">{look.sub}</span>}
    </span>
  )
}

// One card. `side` picks the face for Flip cards. `peek` shows a card's other side (Flip).
// faceDown shows the back. onClick makes it clickable.
// rules: the game's rules, so cards can show special powers (like Seven-O on 7 and 0)
export default function Card({ card, side = 'light', rules, faceDown, peek, playable, jumpable, dim, flipIn, onClick }) {
  if (faceDown) {
    // the table sets --back-img when there is an image for this mode's back (see Game.jsx)
    return (
      <div className="card back">
        <span className="back-mark">★</span>
      </div>
    )
  }

  const f = faceOf(card, side)
  const m = meta(f.value)
  const image = cardImage(f)
  const special = specialOf(f, rules)
  // hover text: the card's name and what it does
  const tip = [label(f), m.text, special && `${special.name}: ${special.text}`, card.flex && `Flex: can become ${card.flex} while your power is charged.`]
    .filter(Boolean)
    .join('\n')
  const classes = [
    'card',
    f.color,
    `v-${f.value}`,
    m.wild && 'any-wild',
    LOOK[f.value]?.plain && 'plain-oval',
    card.flex && 'has-flex',
    side === 'dark' && 'dark-face',
    peek && 'peek',
    image && 'has-img',
    playable && 'playable',
    jumpable && 'jumpable',
    dim && 'dim',
    flipIn && 'flip-in',
    special && 'has-special',
  ]
    .filter(Boolean)
    .join(' ')

  // a <button> only when it can be clicked; otherwise a <div>, so it never blocks clicks on a parent (like the deck)
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      {...(onClick ? { type: 'button', onClick } : {})}
      className={classes}
      title={tip}
      style={card.flex ? { '--flex': FLEX_HEX[card.flex] } : undefined}
    >
      {image ? (
        <img src={image} alt={label(f)} draggable="false" />
      ) : (
        <>
          <Corner f={f} className="tl" />
          <span className="oval">
            <Center f={f} />
          </span>
          <Corner f={f} className="br" />
        </>
      )}
      {special && (
        <span className="rule-badge" title={`${special.name}: ${special.text}`}>
          <Icon name={special.icon} small />
        </span>
      )}
      {card.flex && (
        <span className="flex-badge" style={{ '--flex': FLEX_HEX[card.flex] }} title={`Flex: can become ${card.flex}`}>
          ⚡
        </span>
      )}
    </Tag>
  )
}
