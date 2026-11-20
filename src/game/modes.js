// The game modes: each one has its own deck and its own rules.
import { COLORS, DARK_COLORS, shuffle } from './deck.js'

// helper: builds cards with ids. add(color, value, copies, extra)
function builder() {
  const cards = []
  const add = (color, value, copies = 1, extra = {}) => {
    for (let i = 0; i < copies; i++) cards.push({ id: cards.length, color, value, ...extra })
  }
  return { cards, add }
}
const range = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => String(from + i))

// ---------- Classic: 108 cards ----------
function classicDeck() {
  const { cards, add } = builder()
  for (const c of COLORS) {
    add(c, '0')
    for (const n of range(1, 9)) add(c, n, 2)
    for (const a of ['skip', 'reverse', 'draw2']) add(c, a, 2)
  }
  add('wild', 'wild', 4)
  add('wild', 'wild4', 4)
  return cards
}

// ---------- No Mercy: 168 cards ----------
function noMercyDeck() {
  const { cards, add } = builder()
  for (const c of COLORS) {
    for (const n of range(0, 9)) add(c, n, 2)
    add(c, 'draw2', 3)
    add(c, 'draw4', 2)
    add(c, 'skip', 3)
    add(c, 'reverse', 3)
    add(c, 'skipall', 2)
    add(c, 'discardall', 3)
  }
  add('wild', 'wildrev4', 8)
  add('wild', 'wild6', 4)
  add('wild', 'wild10', 4)
  add('wild', 'roulette', 8)
  return cards
}

// ---------- Flip: 112 double-sided cards ----------
function flipDeck() {
  const side = (colors, actions, wilds) => {
    const { cards, add } = builder()
    for (const c of colors) {
      for (const n of range(1, 9)) add(c, n, 2)
      for (const a of actions) add(c, a, 2)
    }
    for (const w of wilds) add('wild', w, 4)
    return cards
  }
  const light = side(COLORS, ['draw1', 'reverse', 'skip', 'flip'], ['wild', 'wilddraw2'])
  const dark = shuffle(side(DARK_COLORS, ['draw5', 'reverse', 'skipall', 'flip'], ['wild', 'wilddrawcolor']))
  // pair each light face with a random dark face (like a printed double-sided card)
  return light.map((l, i) => ({
    id: i,
    faces: { light: { color: l.color, value: l.value }, dark: { color: dark[i].color, value: dark[i].value } },
  }))
}

// ---------- Attack: 112 cards ----------
function attackDeck() {
  const { cards, add } = builder()
  for (const c of COLORS) {
    for (const n of range(1, 9)) add(c, n, 2)
    add(c, 'reverse', 2)
    add(c, 'skip', 2)
    add(c, 'hit2', 2)
    add(c, 'discardall', 1)
    add(c, 'trade', 1)
  }
  add('wild', 'wild', 4)
  add('wild', 'wildhitfire', 2)
  add('wild', 'wildallhit', 2)
  return cards
}

// ---------- Flex: classic deck where some cards can "flex" to a second color ----------
function flexDeck() {
  const { cards, add } = builder()
  COLORS.forEach((c, ci) => {
    const flex = COLORS[(ci + 2) % 4] // the opposite color
    add(c, '0')
    for (const n of range(1, 9)) {
      add(c, n, 1, { flex })
      add(c, n)
    }
    for (const a of ['skip', 'reverse', 'draw2']) {
      add(c, a, 1, { flex })
      add(c, a)
    }
  })
  add('wild', 'wild', 4)
  add('wild', 'wild4', 4)
  return cards
}

// Settings a mode can offer on the setup screen.
//   toggle: on/off        choice: pick one of `options` ({ value, label })
const JUMP_IN = { key: 'jumpIn', type: 'toggle', name: 'Jump-in', text: 'Hold the exact same card as the top card? Play it out of turn.', default: false }

export const CLASSIC_SETTINGS = [
  { key: 'stacking', type: 'toggle', name: 'Stacking', text: 'Answer a +2 or +4 with an equal or bigger draw card to pass the penalty on.', default: false },
  { key: 'sevenO', type: 'toggle', name: 'Seven-O', text: '7: swap hands with a player you pick. 0: every hand moves to the next player.', default: false },
  { key: 'drawUntil', type: 'toggle', name: 'Draw until you can play', text: 'No match? Keep drawing until you get a playable card.', default: false },
  JUMP_IN,
]

const NO_MERCY_SETTINGS = [
  {
    key: 'mercy',
    type: 'choice',
    name: 'Card limit',
    text: 'Reach this many cards and you are out. No limit: nobody is knocked out.',
    options: [
      { value: 15, label: '15' },
      { value: 25, label: '25' },
      { value: 35, label: '35' },
      { value: 0, label: 'No limit' },
    ],
    default: 25,
  },
  {
    key: 'handSize',
    type: 'choice',
    name: 'Starting hand',
    text: 'How many cards everyone is dealt.',
    options: [
      { value: 7, label: '7' },
      { value: 10, label: '10' },
      { value: 15, label: '15' },
    ],
    default: 7,
  },
  JUMP_IN,
]

// the starting values of a mode's settings
export const defaultSettings = (modeKey) =>
  Object.fromEntries((MODES[modeKey]?.settings ?? []).map((s) => [s.key, s.default]))
export const allDefaultSettings = () => Object.fromEntries(Object.keys(MODES).map((k) => [k, defaultSettings(k)]))

export const MODES = {
  classic: {
    deckSize: 108,
    showcase: [
      { color: 'red', value: 'skip' },
      { color: 'green', value: 'reverse' },
      { color: 'blue', value: 'draw2' },
      { color: 'wild', value: 'wild' },
      { color: 'wild', value: 'wild4' },
    ],
    points: [
      'Match the top card by color or by number/symbol.',
      'Wild Draw Four only when you have no card of the current color.',
      'Press UNO! when you are about to play your second-to-last card.',
    ],
    name: 'Classic',
    tagline: 'The original 108-card game. Turn on house rules below.',
    deck: classicDeck,
    players: { min: 2, max: 10 },
    settings: CLASSIC_SETTINGS,
    rules: (settings = {}) => ({ ...settings }),
    accent: ['#e5383b', '#f2b705', '#22a45d', '#2f6fe4'],
  },
  nomercy: {
    deckSize: 168,
    showcase: [
      { color: 'blue', value: 'draw4' },
      { color: 'green', value: 'skipall' },
      { color: 'yellow', value: 'discardall' },
      { color: 'red', value: '7' },
      { color: 'wild', value: 'wildrev4' },
      { color: 'wild', value: 'wild6' },
      { color: 'wild', value: 'wild10' },
      { color: 'wild', value: 'roulette' },
    ],
    points: [
      'Stacking: answer a draw card with an equal or bigger one to pass the penalty on.',
      'Seven-O: a 7 swaps hands with a player you pick, a 0 moves every hand along.',
      'Draw as many cards as you like, then play or pass. Careful: hit the card limit and you are out.',
      'Reach the card limit (25 unless you change it) and you are out. Last one standing wins too.',
    ],
    name: 'No Mercy',
    tagline: '168 brutal cards: +6, +10, Skip Everyone, Discard All. Stacking and 7-0 always on. Too many cards and you are out.',
    deck: noMercyDeck,
    players: { min: 2, max: 6 },
    settings: NO_MERCY_SETTINGS,
    rules: (settings = {}) => ({
      stacking: true,
      sevenO: true,
      drawUntil: false, // draw as many as you like, one at a time (careful: the card limit still knocks you out)
      mercy: settings.mercy ?? 25, // 0 = no limit
      handSize: settings.handSize ?? 7,
      jumpIn: !!settings.jumpIn,
    }),
    accent: ['#111827', '#e5383b', '#111827', '#e5383b'],
  },
  flip: {
    deckSize: 112,
    showcase: [
      { color: 'red', value: 'draw1' },
      { color: 'blue', value: 'flip' },
      { color: 'wild', value: 'wilddraw2' },
      { color: 'pink', value: 'draw5', side: 'dark' },
      { color: 'teal', value: 'skipall', side: 'dark' },
      { color: 'wild', value: 'wilddrawcolor', side: 'dark' },
    ],
    points: [
      'Every card has a Light side and a Dark side. You start on the Light side.',
      'A Flip card turns all cards over: hands, draw pile and discard pile.',
      'You can see the other side of everyone else\'s cards.',
      'Wild Draw Two / Draw Color only when you have no card of the current color.',
    ],
    name: 'Flip',
    tagline: 'Double-sided cards. A Flip card turns everything to the Dark side, with Draw Five and Skip Everyone.',
    deck: flipDeck,
    players: { min: 2, max: 10 },
    rules: () => ({ flip: true }),
    accent: ['#e5383b', '#2f6fe4', '#ec4899', '#14b8a6'],
  },
  attack: {
    deckSize: 112,
    showcase: [
      { color: 'red', value: 'hit2' },
      { color: 'yellow', value: 'discardall' },
      { color: 'green', value: 'trade' },
      { color: 'wild', value: 'wildhitfire' },
      { color: 'wild', value: 'wildallhit' },
    ],
    points: [
      'Instead of drawing, hit the launcher: it fires 0 to 6 random cards.',
      'Hitting the launcher always ends your turn.',
      'Forget to call UNO? Hit the launcher twice.',
    ],
    name: 'Attack',
    tagline: 'No drawing: hit the card launcher instead. It might fire nothing... or a pile.',
    deck: attackDeck,
    players: { min: 2, max: 10 },
    rules: () => ({ launcher: true }),
    accent: ['#f97316', '#e5383b', '#f2b705', '#e5383b'],
  },
  flex: {
    deckSize: 108,
    showcase: [
      { color: 'red', value: '4', flex: 'green' },
      { color: 'blue', value: 'draw2', flex: 'yellow' },
      { color: 'yellow', value: 'skip', flex: 'blue' },
      { color: 'green', value: 'reverse', flex: 'red' },
      { color: 'wild', value: 'wild4' },
    ],
    points: [
      'Cards with ⚡ have a second color. While your power is charged you can play them as that color.',
      'Flexed actions hit everyone: all draw 2, skip everyone, or reverse and go again.',
      'Using flex spends your power. Drawing a card recharges it.',
    ],
    name: 'Flex',
    tagline: 'Flex cards can switch color while your power is charged. Flexed actions hit everyone.',
    deck: flexDeck,
    players: { min: 2, max: 6 },
    rules: () => ({ flex: true }),
    accent: ['#22a45d', '#e5383b', '#22a45d', '#2f6fe4'],
    note: 'Our own take on UNO Flex: the official card list may differ.',
  },
}
