// Online play: create a room (host) or join one with an invite code (guest).
// The host's browser runs the real game; guests send their moves and get back what they're allowed to see.
import { useEffect, useRef, useState } from 'react'
import Peer from 'peerjs'
import { gameReducer } from '../game/rules.js'
import { MODES, allDefaultSettings } from '../game/modes.js'
import Game from '../components/Game.jsx'
import Avatar from '../components/Avatar.jsx'
import ModePicker from '../components/ModePicker.jsx'
import { Particles, ColorBlobs } from '../components/Effects.jsx'
import { randomBotName } from '../game/botNames.js'
import { PREFIX, PEER_OPTIONS, CONNECT_OPTIONS, JOIN_TIMEOUT, makeCode, cleanCode, allowed, viewFor, playerId } from './net.js'

const PING_EVERY = 2000 // ms between heartbeat messages
const TIMEOUT = 8000 // ms of silence before someone counts as gone

// Invite links must work on your friends' devices: "localhost" only means "this computer",
// so in that case we use your network address instead (worked out in vite.config.js).
const isLocal = ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname)
const shareOrigin = isLocal && typeof __LAN_URL__ !== 'undefined' ? __LAN_URL__ : window.location.origin
const inviteLink = (code) => `${shareOrigin}${window.location.pathname}?room=${code}`

// ---------------- Menu: your name, then create or join ----------------
export default function Online({ onBack }) {
  const fromLink = cleanCode(new URLSearchParams(window.location.search).get('room') ?? '')
  const [name, setName] = useState('')
  const [code, setCode] = useState(fromLink)
  const [room, setRoom] = useState(null) // { role: 'host' } or { role: 'guest', code }

  function leave() {
    setRoom(null)
    window.history.replaceState(null, '', window.location.pathname) // drop ?room= from the address
  }

  const player = name.trim() || 'Player'
  if (room?.role === 'host') return <HostRoom name={player} onLeave={leave} />
  if (room?.role === 'guest') return <GuestRoom name={player} code={room.code} onLeave={leave} />

  return (
    <div className="setup-page">
      <ColorBlobs />
      <Particles />
      <div className="setup online-menu">
        <h1 className="title compact">UNO <span className="title-tag">Online</span></h1>
        <p className="muted">Play with friends on other devices using an invite code.</p>

        <div className="panel">
          <h2>Your name</h2>
          <input className="text-input" value={name} maxLength={12} placeholder="e.g. Steven" onChange={(e) => setName(e.target.value)} />

          <div className="online-choices">
            <div className="online-card">
              <h3>Create a room</h3>
              <p className="muted small">You'll get a code to share. Empty seats can be filled with bots.</p>
              <button className="btn wide" onClick={() => setRoom({ role: 'host' })}>Create room</button>
            </div>
            <div className="online-card">
              <h3>Join a room</h3>
              <input
                className="text-input code-input"
                value={code}
                placeholder="CODE"
                onChange={(e) => setCode(cleanCode(e.target.value))}
                onKeyDown={(e) => e.key === 'Enter' && code.length === 5 && setRoom({ role: 'guest', code })}
              />
              <button className="btn wide" disabled={code.length !== 5} onClick={() => setRoom({ role: 'guest', code })}>
                Join
              </button>
            </div>
          </div>

          <button className="btn-ghost back" onClick={onBack}>← Back to local game</button>
        </div>
      </div>
    </div>
  )
}

// ---------------- Host ----------------
function HostRoom({ name, onLeave }) {
  const [code] = useState(makeCode)
  const [status, setStatus] = useState('connecting') // connecting | open | error
  const [error, setError] = useState(null)
  // seat 0 is always the host. id = the player's browser id (see playerId), used to let them rejoin
  const [seats, setSeats] = useState(() => [{ name, isBot: false, peer: null, id: playerId() }])
  const [mode, setMode] = useState('classic')
  const [allSettings, setAllSettings] = useState(allDefaultSettings) // each mode keeps its own settings
  const settings = allSettings[mode] ?? {}
  const setSettings = (next) => setAllSettings((all) => ({ ...all, [mode]: next }))
  const [game, setGame] = useState(null)
  const [connecting, setConnecting] = useState(0) // guests whose connection hasn't opened yet
  const [failedJoins, setFailedJoins] = useState(0) // guests whose connection never opened
  const conns = useRef(new Map()) // peer id -> connection
  const live = useRef({}) // latest values, for the PeerJS event handlers
  live.current = { seats, game, mode }

  useEffect(() => {
    const peer = new Peer(PREFIX + code, PEER_OPTIONS)
    peer.on('open', () => setStatus('open'))
    peer.on('error', (e) => {
      setError(e.type === 'unavailable-id' ? 'That room code is already in use. Leave and create a new room.' : `Connection problem (${e.type}).`)
      setStatus('error')
    })

    const lastSeen = new Map() // peer id -> time of their last message

    // a guest left: in the lobby they lose their seat; during a game a bot takes over (they can rejoin from the same browser)
    function handleLeave(peerId) {
      const conn = conns.current.get(peerId)
      if (!conn) return
      // forget them first: closing the connection fires 'close', which calls this again
      conns.current.delete(peerId)
      lastSeen.delete(peerId)
      conn.close()
      const { seats, game } = live.current
      const idx = seats.findIndex((x) => x.peer === peerId)
      if (idx < 0) return
      if (!game) {
        setSeats((s) => s.filter((x) => x.peer !== peerId))
        return
      }
      setSeats((s) => s.map((x, i) => (i === idx ? { ...x, peer: null, isBot: true } : x)))
      setGame((g) =>
        g && {
          ...g,
          players: g.players.map((p, i) => (i === idx && !p.isBot ? { ...p, isBot: true, name: `${p.name} (bot)` } : p)),
          log: [`${g.players[idx].name} left. A bot takes over.`, ...g.log].slice(0, 8),
        },
      )
    }

    // heartbeat: ping everyone, and drop anyone who has been silent too long
    const beat = setInterval(() => {
      const now = Date.now()
      conns.current.forEach((c, id) => {
        if (c.open) c.send({ type: 'ping' })
        if (now - (lastSeen.get(id) ?? now) > TIMEOUT) handleLeave(id)
      })
    }, PING_EVERY)

    peer.on('connection', (conn) => {
      // someone found the room; now their browser and ours try to connect directly
      setConnecting((n) => n + 1)
      let opened = false
      const giveUp = setTimeout(() => {
        if (opened) return
        setConnecting((n) => Math.max(0, n - 1))
        setFailedJoins((n) => n + 1)
        conn.close()
      }, JOIN_TIMEOUT)
      conn.on('open', () => {
        opened = true
        clearTimeout(giveUp)
        setConnecting((n) => Math.max(0, n - 1))
        conns.current.set(conn.peer, conn)
        lastSeen.set(conn.peer, Date.now())
      })

      conn.on('data', (msg) => {
        lastSeen.set(conn.peer, Date.now())
        const { seats, game, mode } = live.current
        if (msg.type === 'hello') {
          const id = typeof msg.id === 'string' ? msg.id.slice(0, 80) : null
          if (!id) return conn.send({ type: 'refused', reason: 'Please reload the page and try again.' })
          if (id === seats[0].id) return conn.send({ type: 'refused', reason: "You're already the host of this room in another tab." })
          const mine = seats.findIndex((x, i) => i > 0 && x.id === id) // a seat this browser had before

          // same browser again (dropped out, or a second tab): give them their seat back
          if (mine > 0) {
            const old = seats[mine].peer
            if (old && old !== conn.peer) {
              const oldConn = conns.current.get(old)
              conns.current.delete(old) // forget it first so closing it doesn't count as leaving
              lastSeen.delete(old)
              oldConn?.close()
            }
            setSeats((s) => s.map((x, i) => (i === mine ? { ...x, peer: conn.peer, isBot: false } : x)))
            if (game) {
              setGame((g) =>
                g && {
                  ...g,
                  players: g.players.map((p, i) => (i === mine ? { ...p, isBot: false, name: seats[mine].name } : p)),
                  log: [`${seats[mine].name} is back and takes over from the bot.`, ...g.log].slice(0, 8),
                },
              )
            }
            return
          }

          if (game) return conn.send({ type: 'refused', reason: 'This game has already started. Only players from this game can rejoin, from the same browser they played on.' })
          if (seats.length >= MODES[mode].players.max) return conn.send({ type: 'refused', reason: 'The room is full.' })
          const guestName = String(msg.name ?? '').slice(0, 12) || 'Guest'
          setSeats((s) => (s.some((x) => x.peer === conn.peer) ? s : [...s, { name: guestName, isBot: false, peer: conn.peer, id }]))
        } else if (msg.type === 'action') {
          const seat = seats.findIndex((x) => x.peer === conn.peer)
          // only accept moves that this guest is allowed to make right now
          setGame((g) => (seat > 0 && allowed(g, msg.action, seat) ? gameReducer(g, msg.action) : g))
        }
      })

      conn.on('close', () => handleLeave(conn.peer))
    })

    return () => {
      clearInterval(beat)
      conns.current.forEach((c) => c.close())
      peer.destroy()
    }
  }, [code])

  // send every guest what they're allowed to see whenever anything changes
  useEffect(() => {
    seats.forEach((s, i) => {
      const conn = s.peer && conns.current.get(s.peer)
      if (!conn?.open) return
      if (game) conn.send({ type: 'state', state: viewFor(game, i), seat: i, code })
      else conn.send({ type: 'lobby', seats: seats.map(({ name, isBot }) => ({ name, isBot })), you: i, mode, settings, code })
    })
  }, [seats, game, mode, settings, code])

  function start() {
    setGame(gameReducer(null, { type: 'NEW', seats: seats.map(({ name, isBot }) => ({ name, isBot })), mode, settings }))
  }

  // the host's own moves, plus the bots' moves (the host's browser runs the bots)
  function hostDispatch(action) {
    setGame((g) => {
      if (!g) return g
      const actor = action.type === 'JUMP' ? action.player : g.current
      return actor === 0 || g.players[actor]?.isBot ? gameReducer(g, action) : g
    })
  }

  if (game) {
    return <Game game={game} dispatch={hostDispatch} onRestart={start} onQuit={onLeave} online={{ seat: 0, isHost: true, code }} />
  }

  return (
    <Lobby
      code={code}
      status={status}
      error={error}
      seats={seats}
      you={0}
      isHost
      connecting={connecting}
      failedJoins={failedJoins}
      mode={mode}
      settings={settings}
      setMode={(m) => !MODES[m].soon && seats.length <= MODES[m].players.max && setMode(m)}
      setSettings={setSettings}
      onAddBot={() => setSeats((s) => [...s, { name: randomBotName(s.map((x) => x.name)), isBot: true, peer: null }])}
      onRemove={(i) => {
        const seat = seats[i]
        if (seat.peer) {
          conns.current.get(seat.peer)?.send({ type: 'refused', reason: 'The host removed you from the room.' })
          setTimeout(() => conns.current.get(seat.peer)?.close(), 300)
        }
        setSeats((s) => s.filter((_, j) => j !== i))
      }}
      onStart={start}
      onLeave={onLeave}
    />
  )
}

// ---------------- Guest ----------------
function GuestRoom({ name, code, onLeave }) {
  const [attempt, setAttempt] = useState(0) // bump to try again
  const [status, setStatus] = useState('connecting') // connecting | lobby | game | closed | error
  const [phase, setPhase] = useState('server') // server -> host
  const [error, setError] = useState(null)
  const [lobby, setLobby] = useState(null)
  const [view, setView] = useState(null) // { state, seat }
  const wasPlaying = useRef(false) // lost the connection mid-game? then offer to rejoin
  const conn = useRef(null)
  const phaseRef = useRef('server')

  useEffect(() => {
    phaseRef.current = 'server'
    let leaving = false
    let lastHeard = Date.now()
    let joined = false
    setStatus('connecting')
    setPhase('server')
    setError(null)
    const peer = new Peer(PEER_OPTIONS)
    // don't wait forever: explain what went wrong
    const giveUp = setTimeout(() => {
      if (joined) return
      setError(
        phaseRef.current === 'server'
          ? "Couldn't reach the matchmaking server. Check your internet connection."
          : "Found the room, but couldn't connect to the host's browser. This can happen on strict networks, VPNs, or browsers with WebRTC blocked. Try again, or try the same browser as the host.",
      )
      setStatus('error')
    }, JOIN_TIMEOUT)
    // heartbeat: tell the host we're here, and notice if the host goes quiet
    const beat = setInterval(() => {
      if (conn.current?.open) conn.current.send({ type: 'ping' })
      if (conn.current?.open && Date.now() - lastHeard > TIMEOUT) {
        conn.current.close()
        setStatus((s) => (s === 'error' ? s : 'closed'))
      }
    }, PING_EVERY)
    peer.on('open', () => {
      setPhase('host')
      phaseRef.current = 'host'
      const c = peer.connect(PREFIX + code, CONNECT_OPTIONS)
      conn.current = c
      c.on('open', () => {
        lastHeard = Date.now()
        c.send({ type: 'hello', name, id: playerId() })
      })
      c.on('data', (msg) => {
        lastHeard = Date.now()
        if (!joined && (msg.type === 'lobby' || msg.type === 'state' || msg.type === 'refused')) {
          joined = true
          clearTimeout(giveUp)
        }
        if (msg.type === 'lobby') {
          setLobby(msg)
          setStatus('lobby')
        } else if (msg.type === 'state') {
          wasPlaying.current = true
          setView(msg)
          setStatus('game')
        } else if (msg.type === 'refused') {
          setError(msg.reason)
          setStatus('error')
        }
      })
      c.on('close', () => !leaving && setStatus((s) => (s === 'error' ? s : 'closed')))
    })
    peer.on('error', (e) => {
      setError(e.type === 'peer-unavailable' ? `No room with code ${code}. Check the code with your host.` : `Connection problem (${e.type}).`)
      setStatus('error')
    })
    return () => {
      leaving = true
      clearInterval(beat)
      clearTimeout(giveUp)
      peer.destroy()
    }
  }, [code, name, attempt])

  const send = (action) => conn.current?.open && conn.current.send({ type: 'action', action })

  if (status === 'game' && view) {
    return <Game game={view.state} dispatch={send} onRestart={null} onQuit={onLeave} online={{ seat: view.seat, isHost: false, code }} />
  }
  if (status === 'lobby' && lobby) {
    return <Lobby code={code} status="open" seats={lobby.seats} you={lobby.you} mode={lobby.mode} settings={lobby.settings} onLeave={onLeave} />
  }

  return (
    <div className="setup-page">
      <ColorBlobs />
      <Particles />
      <div className="setup">
        <h1 className="title compact">UNO <span className="title-tag">Online</span></h1>
        <div className="panel center-text-panel">
          {status === 'connecting' && (
            <>
              <div className="spinner" />
              <h2 className="plain">Joining room {code}…</h2>
              <ol className="join-steps">
                <li className={phase === 'server' ? 'now' : 'done'}>Contacting the matchmaking server</li>
                <li className={phase === 'host' ? 'now' : ''}>Connecting to the host's browser</li>
              </ol>
            </>
          )}
          {status === 'error' && (
            <>
              <h2 className="plain">Couldn't join</h2>
              <p className="warn">{error}</p>
              <button className="btn" onClick={() => setAttempt((a) => a + 1)}>Try again</button>
            </>
          )}
          {status === 'closed' && wasPlaying.current && (
            <>
              <h2 className="plain">You lost the connection</h2>
              <p className="muted">A bot is playing for you. Rejoin to take your seat back (works from this browser only).</p>
              <button className="btn" onClick={() => setAttempt((a) => a + 1)}>Rejoin game</button>
            </>
          )}
          {status === 'closed' && !wasPlaying.current && (
            <>
              <h2 className="plain">The host closed the room</h2>
              <p className="muted">The connection to the host was lost.</p>
            </>
          )}
          <button className="btn-ghost back" onClick={onLeave}>← Back</button>
        </div>
      </div>
    </div>
  )
}

// ---------------- Lobby (shared by host and guests) ----------------
function Lobby({ code, status, error, seats, you, isHost, connecting = 0, failedJoins = 0, mode, settings, setMode, setSettings, onAddBot, onRemove, onStart, onLeave }) {
  const [copied, setCopied] = useState(null)
  function copy(text, what) {
    navigator.clipboard?.writeText(text)
    setCopied(what)
    setTimeout(() => setCopied(null), 1500)
  }
  const maxPlayers = MODES[mode].players.max
  const empty = maxPlayers - seats.length

  // same two-column layout as the start screen: the game on the left, the room on the right
  return (
    <div className="setup-page fit">
      <ColorBlobs />
      <Particles />
      <div className="setup-grid">
        <header className="setup-head">
          <h1 className="title compact">UNO</h1>
          <p className="muted">Online room{isHost ? ': invite your friends with the code' : ''}</p>
        </header>

        <section className="panel game-panel">
          <h2>Game{!isHost && <span className="h2-note"> · chosen by the host</span>}</h2>
          <ModePicker mode={mode} setMode={setMode} settings={settings} setSettings={setSettings} readOnly={!isHost} playerCount={seats.length} />
        </section>

        <aside className="panel players-panel">
          <h2>Room code</h2>
          {status === 'connecting' && <p className="muted">Opening the room…</p>}
          {status === 'error' && <p className="warn">{error}</p>}
          {status === 'open' && (
            <>
              <div className="room-code">
                {code.split('').map((ch, i) => (
                  <span key={i} style={{ '--i': i }}>{ch}</span>
                ))}
              </div>
              <div className="copy-row">
                <button className="btn-ghost" onClick={() => copy(code, 'code')}>{copied === 'code' ? 'Copied!' : 'Copy code'}</button>
                <button className="btn-ghost" onClick={() => copy(inviteLink(code), 'link')}>{copied === 'link' ? 'Copied!' : 'Copy invite link'}</button>
              </div>
            </>
          )}

          <h2>Players ({seats.length}/{maxPlayers})</h2>
          <ul className="lobby-seats">
            {seats.map((s, i) => (
              <li key={`${i}-${s.name}`} style={{ '--i': i }}>
                <Avatar player={s} index={i} size={36} />
                <span className="lobby-name">{s.name}</span>
                {i === 0 && <span className="tag">HOST</span>}
                {i === you && <span className="tag you">YOU</span>}
                {s.isBot && <span className="tag">BOT</span>}
                {isHost && i > 0 && (
                  <button className="remove" onClick={() => onRemove(i)} title={s.isBot ? 'Remove bot' : 'Remove player'}>✕</button>
                )}
              </li>
            ))}
            {empty > 0 && (
              <li className="empty">
                <span className="waiting-dots"><span /><span /><span /></span>
                <span className="lobby-name muted">
                  Waiting… {empty} seat{empty === 1 ? '' : 's'} left
                </span>
                {isHost && <button className="btn-ghost small-btn" onClick={onAddBot}>+ Add bot</button>}
              </li>
            )}
          </ul>

          {connecting > 0 && <p className="join-note">Someone is connecting…</p>}
          {failedJoins > 0 && connecting === 0 && (
            <p className="join-note bad">
              {failedJoins === 1 ? 'A player' : `${failedJoins} players`} found the room but couldn't connect. Ask them to press Try again.
            </p>
          )}

          <div className="lobby-actions">
            {isHost ? (
              <button className="btn wide" disabled={seats.length < 2 || status !== 'open'} onClick={onStart}>
                {seats.length < 2 ? 'Waiting for players…' : `Start ${MODES[mode].name}`}
              </button>
            ) : (
              <p className="waiting-host">Waiting for {seats[0]?.name ?? 'the host'} to start…</p>
            )}
            <button className="btn-ghost back" onClick={onLeave}>Leave room</button>
          </div>
        </aside>
      </div>
    </div>
  )
}
