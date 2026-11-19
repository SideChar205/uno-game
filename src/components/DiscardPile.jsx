import Card from './Card.jsx'

// a little randomness per card (based on its id, so it never changes between renders)
const tilt = (id) => ((id * 37) % 31) - 15
const shift = (id) => ((id * 13) % 15) - 7

// where a played card flies in from, per seat position
const FROM = {
  bottom: ['0px', '320px'],
  left: ['-420px', '0px'],
  top: ['0px', '-300px'],
  right: ['420px', '0px'],
  deck: ['-150px', '0px'],
}

export default function DiscardPile({ discard, from, side = 'light', rules, flipIn }) {
  const cards = discard.slice(-5) // only the last few are visible
  // `from` is a seat name, or an exact [x, y] offset for seats around a big table
  const [fx, fy] = Array.isArray(from) ? from : FROM[from] ?? FROM.deck
  return (
    <div className="discard">
      {cards.map((c, i) => {
        const isTop = i === cards.length - 1
        return (
          <div
            key={c.id}
            className={`discard-card${isTop ? ' top' : ''}`}
            style={{ '--fx': fx, '--fy': fy, '--rot': `${tilt(c.id)}deg`, '--dx': `${shift(c.id)}px` }}
          >
            <Card card={c} side={side} rules={rules} flipIn={flipIn} />
          </div>
        )
      })}
    </div>
  )
}
