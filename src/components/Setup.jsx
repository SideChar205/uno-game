import { useState } from 'react'
import { Particles, ColorBlobs } from './Effects.jsx'
import { MODES, allDefaultSettings } from '../game/modes.js'
import ModePicker from './ModePicker.jsx'
import { BOT_NAMES, randomBotName, randomBotNames } from '../game/botNames.js'

// seat 1 is you; the others start as bots with random names
const startingSeats = () => [{ name: 'Player 1', isBot: false }, ...randomBotNames(9).map((name) => ({ name, isBot: true }))]

export default function Setup({ onStart, onOnline }) {
  const [mode, setMode] = useState('classic')
  // every mode remembers its own settings while you switch between them
  const [allSettings, setAllSettings] = useState(allDefaultSettings)
  const settings = allSettings[mode] ?? {}
  const setSettings = (next) => setAllSettings({ ...allSettings, [mode]: next })
  const [count, setCount] = useState(3)
  const [seats, setSeats] = useState(startingSeats)

  // each mode has its own player range; the count is kept inside it
  const range = MODES[mode].players
  const playerCount = Math.min(Math.max(count, range.min), range.max)
  const active = seats.slice(0, playerCount)
  const humans = active.filter((s) => !s.isBot).length
  const update = (i, patch) => setSeats(seats.map((s, j) => (j === i ? { ...s, ...patch } : s)))
  const otherNames = (i) => seats.filter((_, j) => j !== i).map((s) => s.name)

  // switching a seat to Bot gives it a random name; switching back to Human gives "Player N"
  function makeBot(i) {
    if (seats[i].isBot) return
    update(i, { isBot: true, name: randomBotName(otherNames(i)) })
  }
  function makeHuman(i) {
    if (!seats[i].isBot) return
    update(i, { isBot: false, name: BOT_NAMES.includes(seats[i].name) ? `Player ${i + 1}` : seats[i].name })
  }

  function start() {
    onStart(
      active.map((s, i) => ({ name: s.name.trim() || `Player ${i + 1}`, isBot: s.isBot })),
      mode,
      settings,
    )
  }

  return (
    <div className="setup-page fit">
      <ColorBlobs />
      <Particles />
      <div className="setup-grid">
        <header className="setup-head">
          <h1 className="title compact">UNO</h1>
          <p className="muted">Pick a game, set the table, and play.</p>
        </header>

        <section className="panel game-panel">
          <h2>Game</h2>
          <ModePicker mode={mode} setMode={setMode} settings={settings} setSettings={setSettings} />
        </section>

        <aside className="panel players-panel">
          <button className="online-banner compact" onClick={onOnline}>
            <span className="online-icon">🌐</span>
            <span>
              <strong>Play online</strong>
              <small>Invite friends with a code</small>
            </span>
            <span className="online-arrow">→</span>
          </button>

          <h2>Players on this device</h2>
          <div className="seg">
            {Array.from({ length: range.max - range.min + 1 }, (_, k) => range.min + k).map((n) => (
              <button key={n} className={n === playerCount ? 'active' : ''} onClick={() => setCount(n)}>{n}</button>
            ))}
          </div>

          <ul className="seat-list">
            {active.map((s, i) => (
              <li key={i}>
                <input value={s.name} maxLength={12} onChange={(e) => update(i, { name: e.target.value })} />
                {s.isBot && (
                  <button className="dice" title="New random name" onClick={() => update(i, { name: randomBotName(otherNames(i)) })}>
                    🎲
                  </button>
                )}
                <div className="seg small">
                  <button className={!s.isBot ? 'active' : ''} onClick={() => makeHuman(i)}>Human</button>
                  <button className={s.isBot ? 'active' : ''} onClick={() => makeBot(i)}>Bot</button>
                </div>
              </li>
            ))}
          </ul>

          {humans === 0 && <p className="warn">Add at least one human player.</p>}
          {humans > 1 && <p className="muted small">Pass-and-play: on each turn the table switches to that player's view.</p>}

          <button className="btn wide start-btn" disabled={humans === 0} onClick={start}>
            Start {MODES[mode].name}
          </button>
        </aside>
      </div>
    </div>
  )
}
