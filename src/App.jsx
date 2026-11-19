import { useReducer, useState } from 'react'
import { gameReducer } from './game/rules.js'
import Setup from './components/Setup.jsx'
import Game from './components/Game.jsx'
import Online from './online/Online.jsx'

export default function App() {
  const [game, dispatch] = useReducer(gameReducer, null)
  // an invite link (?room=CODE) opens the online screen straight away
  const [screen, setScreen] = useState(() => (new URLSearchParams(window.location.search).has('room') ? 'online' : 'local'))

  if (screen === 'online') return <Online onBack={() => setScreen('local')} />

  if (!game) {
    return (
      <Setup
        onStart={(seats, mode, settings) => dispatch({ type: 'NEW', seats, mode, settings })}
        onOnline={() => setScreen('online')}
      />
    )
  }

  // "Play again" keeps the same players, mode and settings
  const seats = game.players.map(({ name, isBot }) => ({ name, isBot }))
  return (
    <Game
      game={game}
      dispatch={dispatch}
      onRestart={() => dispatch({ type: 'NEW', seats, mode: game.mode, settings: game.settings })}
      onQuit={() => dispatch({ type: 'QUIT' })}
    />
  )
}
