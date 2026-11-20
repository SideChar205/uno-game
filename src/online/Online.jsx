// Online play: create a room (host) or join one with an invite code (guest).
// The host's browser runs the real game; guests send their moves and get back what they're allowed to see.
import { useEffect, useRef, useState } from 'react'
// rooms run through a public message relay (works in every browser and on every network), see relay.js
import { RelayPeer as Peer } from './relay.js'
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
// The invite link carries a long random secret, after '#' (browsers never send that part to any server).
// Only people with the link can walk straight in; typing the short room code only knocks, and the host decides.
const inviteLink = (secret) => `${shareOrigin}${window.location.pathname}#join=${secret}`
const makeSecret = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(16)) // 128 bits: impossible to guess
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
// read an invite from the address (#join=SECRET, or an old ?room=CODE link), then clear it from the address bar
function readInvite() {
  const secret = (window.location.hash.match(/join=([A-Za-z0-9_-]{16,64})/) ?? [])[1] ?? null
  const code = cleanCode(new URLSearchParams(window.location.search).get('room') ?? '')
  if (secret || code) window.history.replaceState(null, '', window.location.pathname)
  return { secret, code: code.length === 5 ? code : '' }
}

// your name is remembered in this browser, so invite links can join you straight away
const NAME_KEY = 'uno-player-name'
const savedName = () => {
  try {
    return localStorage.getItem(NAME_KEY) ?? ''
  } catch {
    return ''
  }
}
const saveName = (n) => {
  try {
    if (n.trim()) localStorage.setItem(NAME_KEY, n.trim().slice(0, 12))
  } catch { /* storage blocked: nothing to remember */ }
}
const cleanName = (n) => String(n ?? '').replace(/\s+/g, ' ').trim().slice(0, 12)

// ---------------- Menu: your name, then create or join ----------------
export default function Online({ onBack }) {
  const [invite] = useState(readInvite)
  const fromLink = invite.secret || invite.code
  const [name, setName] = useState(savedName)
  const [code, setCode] = useState(invite.code)
  // { role: 'host' } or { role: 'guest', code, secret }
  const [room, setRoom] = useState(null)
  // opening an invite link first asks for your name (your last one is filled in), then joins
  const [pendingInvite, setPendingInvite] = useState(() =>
    invite.secret ? { role: 'guest', code: '', secret: invite.secret } : invite.code ? { role: 'guest', code: invite.code } : null,
  )
  useEffect(() => saveName(name), [name])

  function leave() {
    setRoom(null)
    window.history.replaceState(null, '', window.location.pathname) // drop ?room= from the address
  }

  const player = name.trim() || 'Player'
  if (pendingInvite && !room) {
    const go = () => {
      if (!cleanName(name)) return
      setName(cleanName(name))
      setRoom(pendingInvite)
      setPendingInvite(null)
    }
    return (
      <div className="setup-page">
        <ColorBlobs />
        <Particles />
        <div className="setup online-menu">
          <h1 className="title compact">UNO <span className="title-tag">Online</span></h1>
          <div className="panel join-prompt">
            <p className="invite-hello">🎉 You're invited to a UNO room!</p>
            <h2>What's your name?</h2>
            <input
              className="text-input name-big"
              autoFocus
              maxLength={12}
              value={name}
              placeholder="e.g. Ana"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && go()}
            />
            <p className="muted small">This is how the other players will see you. You can change it later in the room.</p>
            <button className="btn wide" disabled={!cleanName(name)} onClick={go}>
              Join the room
            </button>
            <button className="btn-ghost back" onClick={() => { setPendingInvite(null); onBack() }}>← Not now</button>
          </div>
        </div>
      </div>
    )
  }
  if (room?.role === 'host') return <HostRoom name={player} onLeave={leave} onRename={setName} />
  if (room?.role === 'guest') return <GuestRoom name={player} code={room.code} secret={room.secret} onLeave={leave} onRename={setName} />

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
function HostRoom({ name, onLeave, onRename }) {
  const [code] = useState(makeCode)
  const [secret] = useState(makeSecret)
  const [knocks, setKnocks] = useState([]) // people who typed the room code and wait to be let in
  const admit = useRef(null) // let a knocking guest in (set inside the connection effect)
  const [status, setStatus] = useState('connecting') // connecting | open | error
  const [error, setError] = useState(null)
  // seat 0 is always the host. id = the player's browser id (see playerId), used to let them rejoin
  const [seats, setSeats] = useState(() => [{ name, isBot: false, peer: null, id: playerId(), ready: true }])
  // what just happened in the room ("Ana joined", "Ben is ready"...), shown to everyone
  const [notices, setNotices] = useState([])
  const notice = (text) => setNotices((n) => [{ id: `${Date.now()}-${Math.random()}`, text }, ...n].slice(0, 5))
  const [mode, setMode] = useState('classic')
  const [allSettings, setAllSettings] = useState(allDefaultSettings) // each mode keeps its own settings
  const settings = allSettings[mode] ?? {}
  const setSettings = (next) => setAllSettings((all) => ({ ...all, [mode]: next }))
  const [game, setGame] = useState(null)
  // people trying to join, by browser id (so pressing Try again is still the same person)
  const [connecting, setConnecting] = useState({}) // id -> name, connection not open yet
  const [failedJoins, setFailedJoins] = useState({}) // id -> { name, tries }, connection never opened
  const conns = useRef(new Map()) // peer id -> connection
  const live = useRef({}) // latest values, for the PeerJS event handlers
  live.current = { seats, game, mode }

  useEffect(() => {
    const peer = new Peer(PREFIX + code, { ...PEER_OPTIONS, secret })
    const approved = new Set() // ids the host has let in
    peer.on('open', () => setStatus('open'))
    peer.on('error', (e) => {
      setError(e.type === 'network' ? "Couldn't reach the online service. Check your internet connection, then leave and create the room again." : `Connection problem (${e.type}).`)
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
        notice(`${seats[idx].name} left the room`)
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
      const who = String(conn.metadata?.id ?? conn.peer).slice(0, 80)
      const whoName = String(conn.metadata?.name ?? '').slice(0, 12) || 'Someone'
      const without = (obj) => {
        const next = { ...obj }
        delete next[who]
        return next
      }
      setConnecting((c) => ({ ...c, [who]: whoName }))
      let opened = false
      const giveUp = setTimeout(() => {
        if (opened) return
        setConnecting(without)
        setFailedJoins((f) => ({ ...f, [who]: { name: whoName, tries: (f[who]?.tries ?? 0) + 1 } }))
        conn.close()
      }, JOIN_TIMEOUT)
      conn.on('open', () => {
        opened = true
        clearTimeout(giveUp)
        setConnecting(without)
        setFailedJoins(without)
        conns.current.set(conn.peer, conn)
        lastSeen.set(conn.peer, Date.now())
      })

      conn.on('data', (msg) => {
        lastSeen.set(conn.peer, Date.now())
        const { seats, game, mode } = live.current
        if (msg.type === 'hello') {
          const id = typeof msg.id === 'string' ? msg.id.slice(0, 80) : null
          // came with just the room code: the host has to let them in (unless they're already a player here)
          if (conn.via === 'code' && id && !approved.has(id) && !seats.some((x) => x.id === id)) {
            const who = cleanName(msg.name) || 'Someone'
            setKnocks((k) => (k.some((x) => x.peer === conn.peer) ? k : [...k, { peer: conn.peer, id, name: who }].slice(-4)))
            return conn.send({ type: 'pending', host: seats[0].name })
          }
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
          // two players with the same name get a number
          let guestName = cleanName(msg.name) || 'Guest'
          for (let k = 2; seats.some((x) => x.name === guestName); k++) guestName = `${cleanName(msg.name).slice(0, 9) || 'Guest'} ${k}`
          if (!seats.some((x) => x.peer === conn.peer)) notice(`${guestName} joined the room`)
          setSeats((s) => (s.some((x) => x.peer === conn.peer) ? s : [...s, { name: guestName, isBot: false, peer: conn.peer, id, ready: false }]))
        } else if (msg.type === 'ready' && !game) {
          const i = seats.findIndex((x) => x.peer === conn.peer)
          if (i <= 0 || seats[i].ready === !!msg.ready) return
          notice(msg.ready ? `${seats[i].name} is ready` : `${seats[i].name} isn't ready yet`)
          setSeats((s) => s.map((x, j) => (j === i ? { ...x, ready: !!msg.ready } : x)))
        } else if (msg.type === 'rename' && !game) {
          const i = seats.findIndex((x) => x.peer === conn.peer)
          const next = cleanName(msg.name)
          if (i <= 0 || !next || next === seats[i].name || seats.some((x) => x.name === next)) return
          notice(`${seats[i].name} is now ${next}`)
          setSeats((s) => s.map((x, j) => (j === i ? { ...x, name: next } : x)))
        } else if (msg.type === 'action') {
          const seat = seats.findIndex((x) => x.peer === conn.peer)
          // only accept moves that this guest is allowed to make right now
          setGame((g) => (seat > 0 && allowed(g, msg.action, seat) ? gameReducer(g, msg.action) : g))
        }
      })

      conn.on('close', () => {
        setKnocks((k) => k.filter((x) => x.peer !== conn.peer))
        handleLeave(conn.peer)
      })
      conn.helloAgain = (name, id) => conn.emit('data', { type: 'hello', name, id })
    })

    // the host answers a knock: let them in (replays their hello) or send them away
    admit.current = (knock, yes) => {
      setKnocks((k) => k.filter((x) => x.peer !== knock.peer))
      const conn = conns.current.get(knock.peer)
      if (!conn) return
      if (yes) {
        approved.add(knock.id)
        conn.helloAgain(knock.name, knock.id)
      } else {
        conn.send({ type: 'refused', reason: 'The host didn\'t let you in. Ask them for the invite link.' })
        setTimeout(() => conn.close(), 300)
      }
    }

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
      else conn.send({ type: 'lobby', seats: seats.map(({ name, isBot, ready }) => ({ name, isBot, ready: isBot || !!ready })), you: i, mode, settings, code, notices })
    })
  }, [seats, game, mode, settings, code, notices])

  // after a game: everyone back to the waiting room. Players who left during the game (now bots) lose their seat,
  // and everyone has to ready up again for the next game.
  function backToRoom() {
    setSeats((s) => s.filter((x, i) => i === 0 || x.peer || (x.isBot && !game?.players[i]?.name.endsWith('(bot)'))).map((x, i) => (i === 0 || x.isBot ? x : { ...x, ready: false })))
    setGame(null)
    notice('Back in the room. Ready up for the next game!')
  }

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
    return <Game game={game} dispatch={hostDispatch} onRestart={start} onQuit={onLeave} onBackToRoom={backToRoom} online={{ seat: 0, isHost: true, code }} />
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
      notices={notices}
      secret={secret}
      knocks={knocks}
      onAnswerKnock={(k, yes) => admit.current?.(k, yes)}
      onRename={(next) => {
        next = cleanName(next)
        if (!next || seats.some((x, j) => j > 0 && x.name === next)) return
        if (next !== seats[0].name) notice(`${seats[0].name} is now ${next}`)
        setSeats((s) => s.map((x, j) => (j === 0 ? { ...x, name: next } : x)))
        onRename(next)
      }}
      onAddBot={() => setSeats((s) => [...s, { name: randomBotName(s.map((x) => x.name)), isBot: true, peer: null, ready: true }])}
      onRemove={(i) => {
        const seat = seats[i]
        notice(seat.isBot ? `${seat.name} (bot) removed` : `The host removed ${seat.name}`)
        if (seat.peer) {
          conns.current.get(seat.peer)?.send({ type: 'refused', reason: 'The host removed you from the room.', kicked: true })
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
function GuestRoom({ name, code, secret, onLeave, onRename }) {
  const [shownCode, setShownCode] = useState(code) // with a link, the room's code arrives from the host (only shown, never reconnects)
  const [attempt, setAttempt] = useState(0) // bump to try again
  const [status, setStatus] = useState('connecting') // connecting | lobby | game | closed | error
  const [phase, setPhase] = useState('server') // server -> host
  const [error, setError] = useState(null)
  const [lobby, setLobby] = useState(null)
  const [view, setView] = useState(null) // { state, seat }
  const wasPlaying = useRef(false) // lost the connection mid-game? then offer to rejoin
  const conn = useRef(null)
  const phaseRef = useRef('server')
  const nameRef = useRef(name) // renaming in the lobby doesn't reconnect
  nameRef.current = name

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
          ? "Couldn't reach the online service. Check your internet connection, then try again."
          : "The host didn't answer. Make sure they still have the room open, then try again.",
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
      // metadata: who we are, so the host knows a retry is the same person
      const c = peer.connect(PREFIX + (code || 'LINK'), { ...CONNECT_OPTIONS, secret, metadata: { id: playerId(), name: nameRef.current } })
      conn.current = c
      c.on('open', () => {
        lastHeard = Date.now()
        c.send({ type: 'hello', name: nameRef.current, id: playerId() })
      })
      c.on('data', (msg) => {
        lastHeard = Date.now()
        if (msg.code) setShownCode(msg.code)
        if (msg.type === 'pending') {
          joined = true
          clearTimeout(giveUp)
          setStatus('pending')
          setLobby((l) => ({ ...(l ?? {}), host: msg.host }))
          return
        }
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
      setError(
        e.type === 'peer-unavailable'
          ? secret
            ? "This invite link doesn't lead to an open room. The host may have closed it: ask them for a new link."
            : `No room with code ${code}. Check the code with your host, and that their room is still open.`
          : e.type === 'network'
            ? "Couldn't reach the online service. Check your internet connection, then try again."
            : `Connection problem (${e.type}).`,
      )
      setStatus('error')
    })
    return () => {
      leaving = true
      clearInterval(beat)
      clearTimeout(giveUp)
      peer.destroy()
    }
  }, [code, attempt]) // eslint-disable-line react-hooks/exhaustive-deps

  const send = (action) => conn.current?.open && conn.current.send({ type: 'action', action })

  if (status === 'game' && view) {
    return <Game game={view.state} dispatch={send} onRestart={null} onQuit={onLeave} online={{ seat: view.seat, isHost: false, code: shownCode }} />
  }
  if (status === 'lobby' && lobby) {
    const message = (m) => conn.current?.open && conn.current.send(m)
    return (
      <Lobby
        code={shownCode}
        status="open"
        seats={lobby.seats}
        you={lobby.you}
        mode={lobby.mode}
        settings={lobby.settings}
        notices={lobby.notices ?? []}
        onReady={(ready) => message({ type: 'ready', ready })}
        onRename={(next) => {
          next = cleanName(next)
          if (!next) return
          message({ type: 'rename', name: next })
          onRename(next)
        }}
        onLeave={onLeave}
      />
    )
  }

  return (
    <div className="setup-page">
      <ColorBlobs />
      <Particles />
      <div className="setup">
        <h1 className="title compact">UNO <span className="title-tag">Online</span></h1>
        <div className="panel center-text-panel">
          {status === 'pending' && (
            <>
              <div className="spinner" />
              <h2 className="plain">Waiting for {lobby?.host ?? 'the host'} to let you in…</h2>
              <p className="muted">You joined with the room code, so the host has to say yes. With an invite link you get in straight away.</p>
            </>
          )}
          {status === 'connecting' && (
            <>
              <div className="spinner" />
              <h2 className="plain">{shownCode ? `Joining room ${shownCode}…` : 'Joining the room…'}</h2>
              <ol className="join-steps">
                <li className={phase === 'server' ? 'now' : 'done'}>Connecting to the online service</li>
                <li className={phase === 'host' ? 'now' : ''}>Finding the room</li>
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
function Lobby({ code, status, error, seats, you, isHost, connecting = {}, failedJoins = {}, mode, settings, setMode, setSettings, notices = [], secret, knocks = [], onAnswerKnock, onReady, onRename, onAddBot, onRemove, onStart, onLeave }) {
  const [copied, setCopied] = useState(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [confirmKick, setConfirmKick] = useState(null)
  const me = seats[you]
  const notReady = seats.filter((s) => !s.isBot && !s.ready)
  const finishRename = () => {
    if (draft.trim() && draft.trim() !== me?.name) onRename?.(draft)
    setEditing(false)
  }
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
                {isHost && secret ? (
                  <>
                    <button className="btn-ghost invite-main" onClick={() => copy(inviteLink(secret), 'link')}>
                      {copied === 'link' ? '✓ Link copied!' : '🔗 Copy invite link'}
                    </button>
                    <button className="btn-ghost" onClick={() => copy(code, 'code')}>{copied === 'code' ? 'Copied!' : 'Copy code'}</button>
                  </>
                ) : (
                  <button className="btn-ghost" onClick={() => copy(code, 'code')}>{copied === 'code' ? 'Copied!' : 'Copy code'}</button>
                )}
              </div>
              {isHost && (
                <p className="invite-note">
                  🔒 The <b>invite link</b> is private: friends with it join straight away. Anyone typing the <b>code</b> has to be let in by you.
                </p>
              )}
              {isHost &&
                knocks.map((k) => (
                  <div key={k.peer} className="knock">
                    <span><b>{k.name}</b> wants to join with the room code</span>
                    <div className="knock-btns">
                      <button className="btn small-btn" onClick={() => onAnswerKnock(k, true)}>Let in</button>
                      <button className="btn-ghost small-btn" onClick={() => onAnswerKnock(k, false)}>Deny</button>
                    </div>
                  </div>
                ))}
            </>
          )}

          <h2>Players ({seats.length}/{maxPlayers})</h2>
          <ul className="lobby-seats">
            {seats.map((s, i) => (
              <li key={`${i}-${s.name}`} style={{ '--i': i }}>
                <Avatar player={s} index={i} size={36} />
                {i === you && editing ? (
                  <input
                    className="text-input rename-input"
                    autoFocus
                    maxLength={12}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={finishRename}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') finishRename()
                      if (e.key === 'Escape') setEditing(false)
                    }}
                  />
                ) : (
                  <span className="lobby-name">
                    {s.name}
                    {i === you && onRename && (
                      <button className="rename-btn" title="Change your name" onClick={() => { setDraft(s.name); setEditing(true) }}>✎ Edit</button>
                    )}
                  </span>
                )}
                {i === 0 && <span className="tag">HOST</span>}
                {i === you && <span className="tag you">YOU</span>}
                {s.isBot && <span className="tag">BOT</span>}
                {!s.isBot && i > 0 && (
                  <span className={`ready-chip${s.ready ? ' on' : ''}`}>{s.ready ? '✓ Ready' : 'Not ready'}</span>
                )}
                {isHost && i > 0 &&
                  (confirmKick === i ? (
                    <button className="remove confirm" onClick={() => { onRemove(i); setConfirmKick(null) }} onBlur={() => setConfirmKick(null)} autoFocus>
                      Remove?
                    </button>
                  ) : (
                    <button className="remove" onClick={() => (s.isBot ? onRemove(i) : setConfirmKick(i))} title={s.isBot ? 'Remove bot' : 'Remove player from the room'}>
                      ✕
                    </button>
                  ))}
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

          {Object.entries(connecting).map(([id, who]) => (
            <p key={`c-${id}`} className="join-note">{who} is connecting…</p>
          ))}
          {Object.entries(failedJoins)
            .filter(([id]) => !connecting[id])
            .map(([id, f]) => (
              <p key={`f-${id}`} className="join-note bad">
                {f.name} found the room but couldn't connect{f.tries > 1 ? ` (${f.tries} tries)` : ''}. Ask them to press Try again.
              </p>
            ))}

          {notices.length > 0 && (
            <ul className="room-feed">
              {notices.slice(0, 3).map((n) => (
                <li key={n.id}>{n.text}</li>
              ))}
            </ul>
          )}

          <div className="lobby-actions">
            {isHost ? (
              <>
                <button className="btn wide" disabled={seats.length < 2 || status !== 'open' || notReady.length > 0} onClick={onStart}>
                  {seats.length < 2
                    ? 'Waiting for players…'
                    : notReady.length
                      ? `Waiting for ${notReady.length === 1 ? notReady[0].name : `${notReady.length} players`} to be ready`
                      : `Start ${MODES[mode].name}`}
                </button>
                {seats.length >= 2 && notReady.length > 0 && (
                  <button className="btn-ghost small-btn start-anyway" onClick={onStart}>Start anyway</button>
                )}
              </>
            ) : (
              <>
                <button className={`btn wide ready-btn${me?.ready ? ' is-ready' : ''}`} onClick={() => onReady?.(!me?.ready)}>
                  {me?.ready ? "✓ I'm ready (tap to undo)" : "I'm ready!"}
                </button>
                <p className="waiting-host">
                  {me?.ready ? `Waiting for ${seats[0]?.name ?? 'the host'} to start…` : 'Tap Ready so the host knows you are set.'}
                </p>
              </>
            )}
            <button className="btn-ghost back" onClick={onLeave}>Leave room</button>
          </div>
        </aside>
      </div>
    </div>
  )
}
