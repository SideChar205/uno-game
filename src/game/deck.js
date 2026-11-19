// Cards, colors and helpers shared by every mode

export const COLORS = ['red', 'yellow', 'green', 'blue'] // also the Light side in Flip
export const DARK_COLORS = ['pink', 'teal', 'orange', 'purple'] // Flip's Dark side

// What each card value does. Number cards ('0'-'9') have no entry.
//   draw: next player draws this many    wild: you pick the color    restricted: only if you hold no card of the current color
export const VALUES = {
  skip: { name: 'Skip', skip: true, text: 'The next player loses their turn.' },
  reverse: { name: 'Reverse', reverse: true, text: 'Play changes direction.' },
  draw1: { name: 'Draw One', draw: 1, text: 'The next player draws 1 and loses their turn.' },
  draw2: { name: 'Draw Two', draw: 2, text: 'The next player draws 2 and loses their turn.' },
  draw4: { name: 'Draw Four', draw: 4, text: 'The next player draws 4 and loses their turn.' },
  draw5: { name: 'Draw Five', draw: 5, text: 'The next player draws 5 and loses their turn.' },
  skipall: { name: 'Skip Everyone', skipAll: true, text: 'Everyone else is skipped: you play again.' },
  discardall: { name: 'Discard All', discardAll: true, text: 'Also discard every other card of this color from your hand.' },
  flip: { name: 'Flip', flip: true, text: 'Every card turns over to the other side.' },
  hit2: { name: 'Hit 2', hits: 2, text: 'The next player hits the launcher twice and loses their turn.' },
  trade: { name: 'Trade Hands', trade: true, text: 'Swap your whole hand with a player you pick.' },
  wild: { name: 'Wild', wild: true, text: 'Play on anything and pick the next color.' },
  wild4: { name: 'Wild Draw Four', wild: true, draw: 4, restricted: true, text: 'Pick the color; the next player draws 4. Only when you have no card of the current color.' },
  wilddraw2: { name: 'Wild Draw Two', wild: true, draw: 2, restricted: true, text: 'Pick the color; the next player draws 2. Only when you have no card of the current color.' },
  wilddrawcolor: { name: 'Wild Draw Color', wild: true, drawColor: true, restricted: true, text: 'Pick a color; the next player draws until they get that color. Only when you have no card of the current color.' },
  wildrev4: { name: 'Wild Reverse Draw Four', wild: true, reverse: true, draw: 4, text: 'Reverse direction, pick the color, and the next player draws 4. With only 2 players it skips the other player and YOU draw 4 (unless you stack it back).' },
  wild6: { name: 'Wild Draw Six', wild: true, draw: 6, text: 'Pick the color; the next player draws 6.' },
  wild10: { name: 'Wild Draw Ten', wild: true, draw: 10, text: 'Pick the color; the next player draws 10.' },
  roulette: { name: 'Wild Color Roulette', wild: true, roulette: true, text: 'The NEXT player picks a color, then reveals cards until they get that color (wilds do not count). They keep them all and lose their turn.' },
  wildhitfire: { name: 'Wild Hit-Fire', wild: true, hitFire: true, text: 'Pick the color; the next player hits the launcher until it fires.' },
  wildallhit: { name: 'Wild All Hit', wild: true, allHit: true, text: 'Pick the color; everyone else hits the launcher once.' },
}

// Deathmatch points for cards left in a hand (lower is better):
//   number cards = face value, wild cards = 10, draw cards = how many they make you draw, other actions = 5
const POINTS = {
  draw1: 1, draw2: 2, draw4: 4, draw5: 5,
  wilddraw2: 2, wild4: 4, wildrev4: 4, wild6: 6, wild10: 10,
  wild: 10, wilddrawcolor: 10, roulette: 10, wildhitfire: 10, wildallhit: 10,
}
export const cardPoints = (f) => (isNumber(f) ? Number(f.value) : POINTS[f.value] ?? 5)

// Special powers some modes give to normal cards (shown as a badge on the card)
export function specialOf(f, rules = {}) {
  if (rules.sevenO && f.value === '7') return { icon: 'trade', name: 'Seven-O', text: 'Swap hands with a player you pick.' }
  if (rules.sevenO && f.value === '0') return { icon: 'rotate', name: 'Seven-O', text: 'Every hand moves to the next player.' }
  return null
}

export const meta = (value) => VALUES[value] ?? {}

// Flip cards have two faces; every other card is its own face
export const face = (card, side = 'light') => (card.faces ? card.faces[side] : card)
export const otherSide = (side) => (side === 'light' ? 'dark' : 'light')

export const isNumber = (f) => /^\d$/.test(f.value)

const cap = (s) => s[0].toUpperCase() + s.slice(1)

// "Red 7", "Teal Draw Five", "Wild Draw Ten"
export function label(f) {
  const v = VALUES[f.value]?.name ?? f.value
  return f.color === 'wild' ? v : `${cap(f.color)} ${v}`
}

// Fisher-Yates shuffle: returns a new shuffled array
export function shuffle(cards) {
  const a = [...cards]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
