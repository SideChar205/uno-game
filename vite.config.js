import os from 'node:os'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const PORT = 5175 // 5173 = portfolio, 5174 = hr-system, 5175 = this game

// Find this computer's address on the local network (Wi-Fi or Ethernet), e.g. 192.168.1.20.
// Virtual adapters (VirtualBox, VMware, WSL, Hyper-V, Docker, VPNs) are skipped.
function lanAddress() {
  const skip = /virtual|vmware|vbox|wsl|hyper-v|vethernet|docker|loopback|tailscale|zerotier|vpn|tap|tun/i
  const candidates = []
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family !== 'IPv4' || a.internal || a.address.startsWith('169.254.')) continue
      // home/office networks first: 192.168.x.x, then 10.x.x.x, then 172.16-31.x.x
      const rank = a.address.startsWith('192.168.') ? 0 : a.address.startsWith('10.') ? 1 : /^172\.(1[6-9]|2\d|3[01])\./.test(a.address) ? 2 : 3
      candidates.push({ address: a.address, rank: rank + (skip.test(name) ? 10 : 0) })
    }
  }
  candidates.sort((x, y) => x.rank - y.rank)
  return candidates[0]?.address ?? 'localhost'
}

const LAN_URL = `http://${lanAddress()}:${PORT}`

export default defineConfig({
  plugins: [react()],
  server: {
    port: PORT,
    strictPort: true, // never move to another port: invite links always say 5175
    host: true, // listen on the network too, so friends on the same Wi-Fi can open the game
    open: LAN_URL, // open the browser at your network address instead of localhost
  },
  preview: { port: PORT, host: true },
  // the app uses this to build invite links that work for friends, even if you opened localhost
  define: { __LAN_URL__: JSON.stringify(LAN_URL) },
})
