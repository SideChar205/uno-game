// Online rooms through a public message relay (MQTT over secure WebSockets).
//
// Why: direct browser-to-browser connections (WebRTC) get blocked by firewalls, mobile networks
// and some browsers. A relay is plain secure web traffic (like loading a page), so it works everywhere.
//
// How:
//  - Every room has a "topic" on the relay, made from a hash of the room code (the code itself never leaves your device).
//  - Every message is encrypted (AES-GCM) with a key made from the room code, so other relay users can't read it.
//  - The host listens on every relay at once; a guest uses whichever relay answers first.
//
// RelayPeer copies the small part of the PeerJS API the game uses, so the room code didn't have to change:
//   host:  new RelayPeer(roomId) -> 'open', 'error', 'connection'(conn)
//   guest: new RelayPeer()       -> 'open', 'error'; then peer.connect(roomId, { metadata }) -> conn
//   conn:  .peer .metadata .open .send(obj) .close(), events 'open', 'data', 'close'

// Public relays that work without an account (checked: both reachable from a normal home network).
// Override with VITE_RELAY_URLS (comma-separated) to use your own.
const DEFAULT_RELAYS = ['wss://broker.hivemq.com:8884/mqtt', 'wss://broker.emqx.io:8084/mqtt']
export const RELAYS = import.meta.env.VITE_RELAY_URLS
  ? import.meta.env.VITE_RELAY_URLS.split(',').map((u) => u.trim()).filter(Boolean)
  : DEFAULT_RELAYS

const CONNECT_TIMEOUT = 10000 // ms to reach a relay
const ROOM_TIMEOUT = 9000 // ms for a guest to hear back from the host
const HELLO_EVERY = 1500 // a guest repeats its hello until the host answers
const TOPIC_ROOT = 'unopractice/v2'

const enc = new TextEncoder()
const dec = new TextDecoder()
const randomId = () => Array.from(crypto.getRandomValues(new Uint8Array(9)), (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 16)

// ---------------- the room's topic and secret key, both made from the code ----------------
const roomCache = new Map()
function roomCrypto(code) {
  if (!roomCache.has(code)) {
    roomCache.set(
      code,
      (async () => {
        const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(`uno-topic:${code}`)))
        const topic = `${TOPIC_ROOT}/${Array.from(hash.slice(0, 12), (b) => b.toString(16).padStart(2, '0')).join('')}`
        const raw = await crypto.subtle.digest('SHA-256', enc.encode(`uno-key:${code}`))
        const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt'])
        return { topic, key }
      })(),
    )
  }
  return roomCache.get(code)
}
async function seal(key, obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(obj))))
  const out = new Uint8Array(12 + data.length)
  out.set(iv)
  out.set(data, 12)
  return out
}
async function open(key, bytes) {
  try {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(0, 12) }, key, bytes.slice(12))
    return JSON.parse(dec.decode(plain))
  } catch {
    return null // not for us (wrong room) or damaged
  }
}

// ---------------- a tiny MQTT 3.1.1 client (just what we need: connect, subscribe, publish) ----------------
function lengthBytes(n) {
  const out = []
  do {
    let b = n % 128
    n = Math.floor(n / 128)
    if (n > 0) b |= 128
    out.push(b)
  } while (n > 0)
  return out
}
const str = (s) => {
  const b = enc.encode(s)
  return [b.length >> 8, b.length & 255, ...b]
}
const packet = (first, body) => new Uint8Array([first, ...lengthBytes(body.length), ...body])

class Mqtt {
  constructor(url) {
    this.url = url
    this.handlers = new Map() // topic -> fn(bytes)
    this.buffer = new Uint8Array(0)
    this.nextId = 1
    this.closed = false
    this.onclose = null
  }

  connect() {
    return new Promise((resolve, reject) => {
      let done = false
      const fail = (why) => {
        if (done) return
        done = true
        try { this.ws?.close() } catch { /* already closed */ }
        reject(new Error(why))
      }
      const timer = setTimeout(() => fail('timeout'), CONNECT_TIMEOUT)
      try {
        this.ws = new WebSocket(this.url, ['mqtt'])
      } catch (e) {
        clearTimeout(timer)
        return fail(e.message)
      }
      this.ws.binaryType = 'arraybuffer'
      this.ws.onopen = () => {
        const clientId = `uno${randomId()}`.slice(0, 23)
        // protocol "MQTT", level 4, clean session, keep alive 30 s
        this.ws.send(packet(0x10, [...str('MQTT'), 4, 0x02, 0, 30, ...str(clientId)]))
      }
      this.ws.onerror = () => fail('error')
      this.ws.onclose = () => {
        clearTimeout(timer)
        if (!done) return fail('closed')
        this.closed = true
        clearInterval(this.pinger)
        this.onclose?.()
      }
      this.ws.onmessage = (e) => {
        const chunk = new Uint8Array(e.data)
        const joined = new Uint8Array(this.buffer.length + chunk.length)
        joined.set(this.buffer)
        joined.set(chunk, this.buffer.length)
        this.buffer = joined
        this.readPackets((type, body) => {
          if (type === 2 && !done) {
            // CONNACK
            done = true
            clearTimeout(timer)
            if (body[1] !== 0) return reject(new Error(`refused ${body[1]}`))
            this.pinger = setInterval(() => this.ws.readyState === 1 && this.ws.send(new Uint8Array([0xc0, 0])), 20000)
            resolve(this)
          }
        })
      }
    })
  }

  // split the incoming bytes into MQTT packets (a WebSocket message can hold part of one, or several)
  readPackets(onControl) {
    for (;;) {
      const b = this.buffer
      if (b.length < 2) return
      let len = 0
      let mult = 1
      let i = 1
      for (;;) {
        if (i >= b.length) return
        len += (b[i] & 127) * mult
        mult *= 128
        if (!(b[i++] & 128)) break
      }
      if (b.length < i + len) return
      const first = b[0]
      const body = b.slice(i, i + len)
      this.buffer = b.slice(i + len)
      const type = first >> 4
      if (type === 3) {
        // PUBLISH
        const tlen = (body[0] << 8) | body[1]
        const topic = dec.decode(body.slice(2, 2 + tlen))
        const qos = (first >> 1) & 3
        const payload = body.slice(2 + tlen + (qos ? 2 : 0))
        this.handlers.get(topic)?.(payload)
      } else onControl(type, body)
    }
  }

  subscribe(topic, fn) {
    this.handlers.set(topic, fn)
    const id = this.nextId++ % 65535 || 1
    this.ws.send(packet(0x82, [id >> 8, id & 255, ...str(topic), 0]))
  }

  publish(topic, bytes) {
    if (this.ws.readyState !== 1) return
    const head = str(topic)
    const body = new Uint8Array(head.length + bytes.length)
    body.set(head)
    body.set(bytes, head.length)
    const len = lengthBytes(body.length)
    const out = new Uint8Array(1 + len.length + body.length)
    out[0] = 0x30
    out.set(len, 1)
    out.set(body, 1 + len.length)
    this.ws.send(out)
  }

  end() {
    this.closed = true
    clearInterval(this.pinger)
    try {
      if (this.ws.readyState === 1) this.ws.send(new Uint8Array([0xe0, 0])) // DISCONNECT
      this.ws.close()
    } catch { /* already closed */ }
  }
}

// ---------------- small event helper ----------------
class Emitter {
  constructor() {
    this.listeners = {}
  }
  on(type, fn) {
    ;(this.listeners[type] ??= []).push(fn)
    return this
  }
  emit(type, ...args) {
    for (const fn of this.listeners[type] ?? []) fn(...args)
  }
}

// one side of a room connection
class RelayConn extends Emitter {
  constructor({ peer, metadata, send, onClose }) {
    super()
    this.peer = peer // the other side's id
    this.metadata = metadata
    this.open = false
    this._send = send
    this._onClose = onClose
  }
  send(obj) {
    if (this.open) this._send({ k: 'd', b: obj })
  }
  close() {
    if (!this.open && this._closed) return
    this._closed = true
    const was = this.open
    this.open = false
    if (was) this._send({ k: 'x' })
    this._onClose?.()
    this.emit('close')
  }
  _remoteClosed() {
    if (this._closed) return
    this._closed = true
    this.open = false
    this._onClose?.()
    this.emit('close')
  }
}

const ROOM_PREFIX = /^.*-room-/ // ids look like "unopractice-room-ABCDE"

export class RelayPeer extends Emitter {
  constructor(roomId) {
    super()
    this.id = randomId()
    this.destroyed = false
    this.clients = []
    this.conns = new Map() // other side's id -> RelayConn
    if (typeof roomId === 'string') this._host(roomId.replace(ROOM_PREFIX, ''))
    else this._guest()
  }

  // ---- host: listen on every relay so guests can use whichever one works for them ----
  async _host(code) {
    const { topic, key } = await roomCrypto(code)
    const tries = RELAYS.map((url) => new Mqtt(url).connect().catch(() => null))
    let opened = false
    tries.forEach((p) =>
      p.then((client) => {
        if (!client) return
        if (this.destroyed) return client.end()
        this.clients.push(client)
        client.subscribe(`${topic}/h`, async (bytes) => {
          const msg = await open(key, bytes)
          if (msg && !this.destroyed) this._hostMessage(client, topic, key, msg)
        })
        if (!opened) {
          opened = true
          this.emit('open', code)
        }
      }),
    )
    const all = await Promise.all(tries)
    if (!all.some(Boolean) && !this.destroyed) this.emit('error', { type: 'network' })
  }

  _hostMessage(client, topic, key, msg) {
    const from = String(msg.f ?? '')
    if (!from) return
    const reply = (obj) => seal(key, { ...obj, f: this.id }).then((b) => client.publish(`${topic}/g/${from}`, b))
    const known = this.conns.get(from)
    if (msg.k === 'hi') {
      if (known) return reply({ k: 'ok' }) // the guest didn't hear our first answer
      const conn = new RelayConn({ peer: from, metadata: msg.m, send: reply, onClose: () => this.conns.delete(from) })
      this.conns.set(from, conn)
      this.emit('connection', conn)
      reply({ k: 'ok' })
      setTimeout(() => {
        if (conn._closed) return
        conn.open = true
        conn.emit('open')
      }, 0)
    } else if (known && msg.k === 'd') known.emit('data', msg.b)
    else if (known && msg.k === 'x') known._remoteClosed()
  }

  // ---- guest: use the first relay that answers ----
  async _guest() {
    const tries = RELAYS.map((url) => new Mqtt(url).connect().catch(() => null))
    const client = await Promise.any(tries.map((p) => p.then((c) => c ?? Promise.reject()))).catch(() => null)
    // close the relays we didn't pick
    tries.forEach((p) => p.then((c) => c && c !== client && c.end()))
    if (this.destroyed) return client?.end()
    if (!client) return this.emit('error', { type: 'network' })
    this.clients.push(client)
    client.onclose = () => this.conns.forEach((c) => c._remoteClosed())
    this.emit('open', this.id)
  }

  connect(roomId, { metadata } = {}) {
    const code = roomId.replace(ROOM_PREFIX, '')
    const client = this.clients[0]
    const conn = new RelayConn({ peer: roomId, metadata, send: () => {}, onClose: () => this.conns.delete(roomId) })
    this.conns.set(roomId, conn)
    ;(async () => {
      const { topic, key } = await roomCrypto(code)
      const send = (obj) => seal(key, { ...obj, f: this.id }).then((b) => client.publish(`${topic}/h`, b))
      conn._send = send
      let hostId = null
      client.subscribe(`${topic}/g/${this.id}`, async (bytes) => {
        const msg = await open(key, bytes)
        if (!msg || this.destroyed) return
        if (msg.k === 'ok' && !conn.open && !conn._closed) {
          hostId = msg.f
          clearInterval(hello)
          clearTimeout(noRoom)
          conn.open = true
          conn.emit('open')
        } else if (msg.f !== hostId) return
        else if (msg.k === 'd') conn.emit('data', msg.b)
        else if (msg.k === 'x') conn._remoteClosed()
      })
      const sayHi = () => send({ k: 'hi', m: metadata })
      sayHi()
      const hello = setInterval(sayHi, HELLO_EVERY)
      const noRoom = setTimeout(() => {
        clearInterval(hello)
        if (!conn.open && !this.destroyed) this.emit('error', { type: 'peer-unavailable' })
      }, ROOM_TIMEOUT)
      conn._stop = () => {
        clearInterval(hello)
        clearTimeout(noRoom)
      }
    })()
    return conn
  }

  destroy() {
    if (this.destroyed) return
    this.conns.forEach((c) => {
      c._stop?.()
      if (c.open) c.close()
    })
    this.destroyed = true
    // give the goodbye messages a moment to leave before closing the sockets
    setTimeout(() => this.clients.forEach((c) => c.end()), 150)
  }
}
