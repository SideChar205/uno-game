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
of the current color. Press **UNO!** when you have 2 cards and are about to play one, or draw 2.
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

## Friends can't connect ("Found the room, but couldn't connect")

The room code worked, but the two devices couldn't open a direct connection. This is normal on mobile data
and some Wi-Fi networks. The fix is a **TURN relay server**, which passes the game data between you when a direct
connection is blocked. The free one built into the game (PeerJS's) is often overloaded, so set up your own:

1. Make a free account at https://www.metered.ca/stun-turn (the free plan is plenty: a card game sends very little data).
2. In the dashboard, create a TURN app and copy its **credentials**: a list of `turn:`/`turns:` URLs, a username and a password.
3. In Vercel: **Project → Settings → Environment Variables**, add:
   - `VITE_TURN_URL` = all the URLs exactly as the dashboard shows them, separated by commas
   - `VITE_TURN_USER` = the username
   - `VITE_TURN_PASS` = the password
4. **Deployments → ⋯ → Redeploy** so the new settings are built in.

For local testing, put the same three lines in a `.env.local` file in this folder (it is ignored by git).
