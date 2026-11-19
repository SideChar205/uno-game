// Fun names for computer players
export const BOT_NAMES = [
  'Pixel', 'Mochi', 'Turbo', 'Biscuit', 'Nova', 'Waffles', 'Ziggy', 'Sprocket', 'Pepper', 'Noodle',
  'Comet', 'Jinx', 'Echo', 'Maple', 'Rocket', 'Tofu', 'Gizmo', 'Sunny', 'Clank', 'Bloop',
  'Widget', 'Nugget', 'Cosmo', 'Taco', 'Blitz', 'Dumpling', 'Zappy', 'Marble', 'Fizz', 'Boomer',
]

// a random name nobody at the table is using yet
export function randomBotName(taken = []) {
  const free = BOT_NAMES.filter((n) => !taken.includes(n))
  const pool = free.length ? free : BOT_NAMES
  return pool[Math.floor(Math.random() * pool.length)]
}

// several different random names at once
export function randomBotNames(count, taken = []) {
  const names = []
  for (let i = 0; i < count; i++) names.push(randomBotName([...taken, ...names]))
  return names
}
