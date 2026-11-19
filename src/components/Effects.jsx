import { useEffect, useState } from 'react'

// Decorative effects: floating confetti in the background, the big event banner, and win confetti

const rand = (seed) => {
  const x = Math.sin(seed * 9301 + 49297) * 233280
  return x - Math.floor(x)
}

export function Particles() {
  return (
    <div className="particles" aria-hidden="true">
      {Array.from({ length: 24 }, (_, i) => (
        <span
          key={i}
          style={{
            left: `${rand(i) * 100}%`,
            animationDelay: `${-rand(i + 50) * 14}s`,
            animationDuration: `${10 + rand(i + 99) * 10}s`,
            width: `${6 + rand(i + 7) * 10}px`,
            height: `${10 + rand(i + 3) * 14}px`,
          }}
        />
      ))}
    </div>
  )
}

// key={event.id} on this component (set by the parent) replays the animation for every new event
export function EventBanner({ event }) {
  if (!event) return null
  const tint = event.kind === 'color' ? ` c-${event.text}` : ''
  return <div className={`event-banner ${event.kind}${tint}`}>{event.text}</div>
}

const CONFETTI_COLORS = ['var(--red)', 'var(--yellow)', 'var(--green)', 'var(--blue)', '#fff']

export function Confetti() {
  return (
    <div className="confetti" aria-hidden="true">
      {Array.from({ length: 80 }, (_, i) => (
        <span
          key={i}
          style={{
            left: `${rand(i + 200) * 100}%`,
            background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
            animationDelay: `${rand(i + 300) * 1.5}s`,
            animationDuration: `${2.5 + rand(i + 400) * 2}s`,
            '--spin': `${rand(i + 500) * 1080 - 540}deg`,
            '--drift': `${rand(i + 600) * 200 - 100}px`,
          }}
        />
      ))}
    </div>
  )
}

// ---------- Menu background: the four UNO colors at random spots that keep wandering ----------
const BLOB_COLORS = ['229, 56, 59', '242, 183, 5', '34, 164, 93', '47, 111, 228'] // red, yellow, green, blue
const AREAS = [[25, 25], [75, 25], [75, 75], [25, 75]] // one area of the screen per color, so they stay spread out

function randomBlobs() {
  const areas = [...AREAS].sort(() => Math.random() - 0.5) // shuffle which color goes where
  return BLOB_COLORS.map((_, i) => ({
    x: areas[i][0] + (Math.random() - 0.5) * 36, // jitter inside its area
    y: areas[i][1] + (Math.random() - 0.5) * 36,
    size: 38 + Math.random() * 18, // how far the color spreads
  }))
}

export function ColorBlobs() {
  const [blobs, setBlobs] = useState(randomBlobs) // a new random look every time the page opens
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const timer = setInterval(() => setBlobs(randomBlobs()), 7000) // drift somewhere new every 7 seconds
    return () => clearInterval(timer)
  }, [])
  const style = {}
  blobs.forEach((b, i) => {
    style[`--x${i}`] = `${b.x}%`
    style[`--y${i}`] = `${b.y}%`
    style[`--s${i}`] = `${b.size}%`
  })
  return <div className="color-blobs" style={style} aria-hidden="true" />
}
