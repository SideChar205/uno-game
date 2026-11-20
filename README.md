# UNO (practice)

A UNO card game built with React 19 and Vite. Play against bots, or pass one device between 2-4 people:
on each turn the table switches to that player's view, with their name shown as it changes.

## Run it

```bash
npm install
npm run dev
```

It opens in your browser at your network address (e.g. http://192.168.1.20:5175), so friends on the same Wi-Fi can use the same link.

## Play online

Click **Play online** on the start screen.

1. One person clicks **Create room** and shares the 5-letter code (or the invite link).
2. Friends click **Play online**, type the code and **Join**. Empty seats can be filled with bots.
3. The host picks the mode and starts. The host's browser runs the game, so the host's tab must stay open.
   If a friend leaves, a bot takes over their seat.

Connections are peer-to-peer (PeerJS), using the free public PeerJS server to find each other. Your friends
also need to be able to open the game page:

- **Same Wi-Fi:** just run `npm run dev`. It opens the game at your network address (e.g. http://192.168.1.20:5175)
  instead of localhost, and invite links always use that address. Friends on the same Wi-Fi can open it directly.
  The first time, Windows may ask to allow Node.js through the firewall: allow it on **Private networks**.
- **Over the internet:** put the built app online (`npm run build`, then upload the `dist` folder to a free host
  like Netlify, Vercel or GitHub Pages) and share that link.

**If a friend is stuck on "Joining…"** (they now get a message after 15 seconds): their browser found the room but
couldn't connect directly to yours. Common causes are VPNs, strict work/school networks, or a browser with WebRTC
turned off (some privacy settings and extensions do this). Try again, try the same browser as the host, or add
your own TURN relay server: `VITE_TURN_URL=turn:your.server:3478 VITE_TURN_USER=... VITE_TURN_PASS=... npm run dev`.

To use your own PeerJS server instead of the public one, start the app with
`VITE_PEER_HOST=your.server VITE_PEER_PORT=443 npm run dev`.

## Game modes

| Mode | Players | What's different |
|---|---|---|
| **Classic** | 2-10 | The original 108-card game. Optional house rules: **Stacking**, **Seven-O** (7 swaps hands, 0 passes all hands), **Draw until you can play**, **Jump-in** |
| **No Mercy** | 2-6 | 168 cards: +6, +10, colored +4, Wild Reverse +4, Skip Everyone, Discard All, Color Roulette. Stacking, 7-0 and draw-until-playable always on. Settings: **card limit** (15 / 25 / 35 / no limit), **starting hand** (7 / 10 / 15), **Jump-in**. |
| **Flip** | 2-10 | 112 double-sided cards. Light side: Draw One, Wild Draw Two. A **Flip** card turns everything to the Dark side: Draw Five, Skip Everyone, Wild Draw Color. You can see the other side of everyone else's cards |
| **Attack** | 2-10 | No drawing: hit the launcher, which fires 0-6 random cards. Hit 2, Discard All, Trade Hands, Wild Hit-Fire, Wild All Hit |
| **Flex** | 2-6 | Some cards have a flex color. While your power is charged you can play them as that color, and flexed actions hit everyone. Drawing recharges your power. *Our own take on UNO Flex: the official card list may differ* |

### Deathmatch phase (every mode)

When every card is in someone's hand and there is nothing left to draw, the game enters **Deathmatch** for the rest of the game:

- Nobody draws any more. No playable card? You pass. If nobody can play for a full round, lowest points wins.
- Deathmatch lasts **50 turns** (shown under the turn indicator). When they run out, lowest points wins.
- Draw penalties (+2, +4, stacks, Roulette...) can't give cards, so the victim takes **penalty points** instead and is skipped.
- When someone empties their hand they win. Leftover cards are scored: **number = face value, wild = 10,
  draw card = its draw value (+2 = 2 ... +10 = 10), other actions = 5**, plus penalty points.
  The winner's score is everyone else's points added up, and the others are ranked by their points.

Classic rules: match the top card by color or by number/symbol, or play a Wild. Wild Draw Four only when you have no card
of the current color. Press **UNO!** when you have 2 cards and are about to play one. The UNO! button is always on screen,
so it never reminds you. Forget, and a **Catch!** button pops up on your name plate for everyone else for 5 seconds:
the first to hit it makes you draw 2 (Attack: 2 launcher hits). You can still save yourself by pressing UNO! before
anyone catches you. Bots forget about 1 time in 5, and they try to catch you too.
Simplifications: the first card flipped is always a number card, and there is no score keeping across rounds.

## Where things are

```
portfolio.json    how this project appears on the portfolio site
src/
  game/
    deck.js       card values (what each card does), colors, shuffle
    modes.js      every mode: its deck and which rules it turns on
    rules.js      ALL game rules: one reducer (PLAY, DRAW, PASS, CALL_UNO, ROULETTE, JUMP)
    bot.js        how computer players choose a move
    botNames.js   random names for bots
  components/
    Setup.jsx     choose the mode, house rules and players
    Game.jsx      the table: opponents, piles, your hand
    Card.jsx      one card (uses an image from src/assets/cards/ if there is one)
    Seat.jsx      one opponent
    Overlays.jsx  color picker, choice dialog (swap target, flex), winner screen
    ModePicker.jsx  mode tabs + the detail card with sample cards and rules
  online/
    net.js        room codes, which moves a player may send, what each player may see
    Online.jsx    online menu, lobby, host room and guest room
  assets/cards/   optional card images, see the README inside
  App.jsx         switches between Setup and Game
```

The rules know nothing about React, and the components know nothing about the rules beyond `canPlay`.

## How online rooms connect

Rooms run through a free public **message relay** (MQTT over secure WebSockets: HiveMQ and EMQX).
That is ordinary secure web traffic, like loading a page, so it works in every browser (Chrome, Edge, Safari, Firefox)
and on every network (Wi-Fi, mobile data, school or office networks). No account or setup needed.

- The room code never leaves your device: the relay only sees a hash of it.
- Every message is encrypted with a key made from the room code, so other relay users can't read your game.
- The host listens on both relays; a guest uses whichever answers first.
- To use your own relay instead, set `VITE_RELAY_URLS` (comma-separated `wss://` MQTT addresses) in Vercel or `.env.local`.

If a friend sees "Couldn't reach the online service", their internet connection (or a filter on it) is blocking the relays.
