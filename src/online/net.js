// Helpers for online rooms (peer-to-peer with PeerJS)
import { otherSide } from '../game/deck.js'

// Every room is a PeerJS id: PREFIX + code. The prefix keeps our ids apart from other apps on the public server.
export const PREFIX = 'unopractice-room-'

// Which PeerJS server to use. By default the free public one (0.peerjs.com).
// To use your own, start the app with e.g. VITE_PEER_HOST=localhost VITE_PEER_PORT=9000 VITE_PEER_SECURE=false
// How browsers find a route to each other (WebRTC):
//  - STUN servers tell each browser its public address
//  - TURN servers relay the data when a direct connection is blocked (strict routers, some browsers/VPNs)
// Add your own TURN server with VITE_TURN_URL, VITE_TURN_USER and VITE_TURN_PASS if connections keep failing.
const ICE_SERVERS = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] },
  { urls: 'stun:stun.cloudflare.com:3478' },
  { urls: ['turn:eu-0.turn.peerjs.com:3478', 'turn:us-0.turn.peerjs.com:3478'], username: 'peerjs', credential: 'peerjsp' },
  ...(import.meta.env.VITE_TURN_URL
    ? [{ urls: import.meta.env.VITE_TURN_URL, username: import.meta.env.VITE_TURN_USER, credential: import.meta.env.VITE_TURN_PASS }]
    : []),
]

export const PEER_OPTIONS = {
  config: { iceServers: ICE_SERVERS },
  ...(import.meta.env.VITE_PEER_HOST && {
    host: import.meta.env.VITE_PEER_HOST,
    port: Number(import.meta.env.VITE_PEER_PORT ?? 443),
    path: import.meta.env.VITE_PEER_PATH ?? '/',
    secure: import.meta.env.VITE_PEER_SECURE !== 'false',
  }),
}

// JSON is understood the same way by every browser
export const CONNECT_OPTIONS = { reliable: true, serialization: 'json' }

export const JOIN_TIMEOUT = 15000 // ms before we tell the guest something is wrong

// 5-character codes without look-alike letters (no 0/O, 1/I/L)
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export const makeCode = () => Array.from({ length: 5 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('')
export const cleanCode = (text) => text.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5)


// Is `seat` allowed to send this action right now? (the host checks every action from a guest)
export function allowed(game, action, seat) {
  if (!game || game.winner !== null) return false
  switch (action.type) {
    case 'PLAY':
    case 'DRAW':
    case 'PASS':
    case 'CALL_UNO':
    case 'ROULETTE':
      return game.current === seat
    case 'JUMP':
      return action.player === seat
    default:
      return false // NEW, QUIT... only the host can do those
  }
}

// What one player is allowed to see: their own hand, and only the backs of everyone else's
// (in Flip, the backs ARE the other side, so those stay visible). The draw pile is hidden too.
export function viewFor(s, seat) {
  const other = otherSide(s.side)
  const hideCard = (card, i) =>
    card.faces
      ? { id: `x${i}`, faces: { [s.side]: { color: 'hidden', value: '?' }, [other]: card.faces[other] } }
      : { id: `x${i}`, color: 'hidden', value: '?' }
  const top = s.drawPile[s.drawPile.length - 1]
  return {
    ...s,
    // other hands are hidden (and so are their card points: only penalty points are public)
    players: s.players.map((p, i) => (i === seat ? p : { ...p, hand: p.hand.map(hideCard) })),
    drawPile: s.drawPile.map((c, i) => (i === s.drawPile.length - 1 && top.faces ? hideCard(c, 'top') : { id: `d${i}` })),
  }
}
