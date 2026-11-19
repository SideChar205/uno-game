import { useEffect, useRef } from 'react'

// The big rotating ring of arrows that shows which way play is going.
// Each arrow is one filled shape: a tail that grows thicker along the circle, ending in an arrowhead.

const C = 200 // center of the 400x400 drawing
const R = 158 // radius of the ring
const rad = (deg) => (deg * Math.PI) / 180
const at = (radius, deg) => `${(C + radius * Math.cos(rad(deg))).toFixed(1)} ${(C + radius * Math.sin(rad(deg))).toFixed(1)}`

function arrowPath(start, end) {
  const steps = 28
  const outer = []
  const inner = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const deg = start + (end - start) * t
    const w = 1.5 + 6.5 * t * t // half-width: thin tail, thicker near the head
    outer.push(at(R + w, deg))
    inner.push(at(R - w, deg))
  }
  const headLen = 16 // degrees the head extends past the body
  const headHalf = 22 // half-width of the head in px
  return [
    `M ${outer[0]}`,
    ...outer.slice(1).map((p) => `L ${p}`),
    `L ${at(R + headHalf, end)}`, // head: outer corner
    `L ${at(R, end + headLen)}`, // tip
    `L ${at(R - headHalf, end)}`, // head: inner corner
    ...inner.reverse().map((p) => `L ${p}`),
    'Z',
  ].join(' ')
}

const ARROW_A = arrowPath(-160, -55)
const ARROW_B = arrowPath(20, 125)

const BASE_SPEED = 22 // degrees per second while idle
const BURST_SPEED = 520 // degrees per second right after a Reverse

export default function DirectionRing({ direction }) {
  const spinner = useRef(null)
  const motion = useRef({ angle: 0, speed: BASE_SPEED, last: null })
  const first = useRef(true)

  // spin with requestAnimationFrame so the speed can change smoothly
  useEffect(() => {
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    let frame
    const tick = (time) => {
      const m = motion.current
      const dt = m.last === null ? 0 : Math.min(0.05, (time - m.last) / 1000)
      m.last = time
      m.speed += (BASE_SPEED - m.speed) * Math.min(1, dt * 2.2) // ease back to the idle speed
      m.angle = (m.angle + (still ? 0 : m.speed * dt)) % 360
      if (spinner.current) spinner.current.style.transform = `rotate(${m.angle}deg)`
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  // a Reverse: give the ring a burst of speed while it flips around
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    motion.current.speed = BURST_SPEED
  }, [direction])

  // the arrows are drawn clockwise; counter-clockwise is the same ring flipped like a coin (rotateY)
  return (
    <div className={`ring ${direction === 1 ? 'cw' : 'ccw'}`} aria-hidden="true">
      <div key={direction} className="ring-flash" />
      <div className="ring-flip">
        <svg viewBox="0 0 400 400">
          <defs>
            <filter id="ring-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="6" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <g ref={spinner} style={{ transformOrigin: '200px 200px' }}>
            <circle cx={C} cy={C} r={R} fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="2 10" strokeLinecap="round" opacity=".45" />
            <g filter="url(#ring-glow)" fill="currentColor" stroke="currentColor" strokeWidth="3" strokeLinejoin="round">
              <path d={ARROW_A} />
              <path d={ARROW_B} />
            </g>
          </g>
        </svg>
      </div>
    </div>
  )
}
