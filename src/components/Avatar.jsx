// A simple generated avatar: a colored badge with a robot face for bots, or the first letter for humans
const SKINS = [
  ['#f97316', '#fb923c'],
  ['#8b5cf6', '#a78bfa'],
  ['#06b6d4', '#22d3ee'],
  ['#22c55e', '#4ade80'],
]

export default function Avatar({ player, index, active, size = 72 }) {
  const [a, b] = SKINS[index % SKINS.length]
  return (
    <div
      className={`avatar${active ? ' active' : ''}`}
      style={{ width: size, height: size, background: `linear-gradient(145deg, ${a}, ${b})` }}
    >
      {player.isBot ? (
        <svg viewBox="0 0 40 40" width="70%" height="70%" aria-hidden="true">
          <line x1="20" y1="4" x2="20" y2="10" stroke="#1f2937" strokeWidth="2" />
          <circle cx="20" cy="4" r="2.5" fill="#fde047" />
          <rect x="7" y="10" width="26" height="22" rx="8" fill="#1f2937" />
          <circle className="eye" cx="15" cy="20" r="3" fill="#fde047" />
          <circle className="eye" cx="25" cy="20" r="3" fill="#fde047" />
          <path d="M15 26 Q20 29 25 26" stroke="#fde047" strokeWidth="2" fill="none" strokeLinecap="round" />
        </svg>
      ) : (
        <span className="avatar-letter">{player.name.trim()[0]?.toUpperCase() ?? '?'}</span>
      )}
    </div>
  )
}
