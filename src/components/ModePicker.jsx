import { MODES } from '../game/modes.js'
import { DEATHMATCH_TURNS } from '../game/rules.js'
import Card from './Card.jsx'


// Mode tabs + a detail card for the chosen mode. readOnly: show the choice without letting you change it.
// playerCount: modes that can't seat this many players are greyed out (online rooms)
export default function ModePicker({ mode, setMode, settings, setSettings, readOnly, playerCount = 0 }) {
  return (
    <div className="mode-picker">
      <div className={`modes${readOnly ? ' read-only' : ''}`}>
        {Object.entries(MODES).map(([key, m], i) => (
          <button
            title={m.soon ? `${m.name} is coming soon` : playerCount > m.players.max ? `${m.name} is for up to ${m.players.max} players` : undefined}
            key={key}
            className={`mode-tile${mode === key ? ' active' : ''}${m.soon ? ' soon' : ''}`}
            style={{ '--i': i, '--a': m.accent[0], '--b': m.accent[1], '--c': m.accent[2], '--d': m.accent[3] }}
            onClick={() => !readOnly && !m.soon && setMode(key)}
            disabled={m.soon || (readOnly && mode !== key) || playerCount > m.players.max}
          >
            <span className="mode-stripes" />
            <strong>{m.name}</strong>
            <small>{m.soon ? 'Coming soon' : `${m.deckSize} cards`}</small>
          </button>
        ))}
      </div>

      {/* key={mode}: the card animates in again whenever you pick another mode */}
      <ModeDetails key={mode} mode={mode} settings={settings} setSettings={setSettings} readOnly={readOnly} />
    </div>
  )
}

function ModeDetails({ mode, settings, setSettings, readOnly }) {
  const m = MODES[mode]
  // in the preview, show the 7 and 0 badges when that mode (or a house rule) gives them powers
  const previewRules = m.rules(settings)
  return (
    <div className={`mode-details theme-${mode}`} style={{ '--a': m.accent[0], '--b': m.accent[1] }}>
      <div className="details-head">
        <h3>{m.name}</h3>
        <span className="pill">{m.deckSize} cards</span>
        <span className="pill">
          {m.players.min}–{m.players.max} players
        </span>
      </div>
      <p className="details-tagline">{m.tagline}</p>

      <div className="showcase">
        {m.showcase.map((c, i) => (
          <figure key={i} style={{ '--i': i }}>
            <div className="mini-card">
              <Card card={{ id: -1 - i, ...c }} side={c.side ?? 'light'} rules={previewRules} />
            </div>
            <figcaption>{captionOf(c)}</figcaption>
          </figure>
        ))}
      </div>

      {/* this mode's rules on the left, the Deathmatch box on the right; settings full width below */}
      <div className="details-row">
        <div className="details-rules">
          <ul className="details-points">
            {m.points.map((p) => <li key={p}>{p}</li>)}
          </ul>
          {m.note && <p className="muted small note">{m.note}</p>}
        </div>
        {/* a small button; the rules float above the page on hover / tap, so nothing moves */}
        <div className="dm-pop">
          <button type="button" className="dm-pop-btn" aria-describedby="dm-pop-card">
            ☠ Deathmatch rules <span className="info">i</span>
          </button>
          <div id="dm-pop-card" role="tooltip" className="dm-pop-card">
            <strong>☠ If the deck runs out</strong>
            <ul>
              <li>Nobody draws again. No playable card? You pass.</li>
              <li>Draw cards (+2, +4, stacks, Roulette…) give <b>penalty points</b> instead of cards, and the victim is skipped.</li>
              <li>It lasts <b>{DEATHMATCH_TURNS} turns</b>. Empty your hand first to win; when time runs out (or nobody can play), fewest points wins.</li>
              <li>Points: number = face value · wild = 10 · +N = N · other actions = 5 · plus penalty points.</li>
            </ul>
          </div>
        </div>
      </div>
      <div className="details-body">
        {m.settings?.length > 0 && (
          <div className="mode-settings">
            {m.settings.map((r) =>
              r.type === 'choice' ? (
                <div key={r.key} className={`choice-setting${readOnly ? ' read-only' : ''}`}>
                  <span>
                    <strong>{r.name}</strong>
                    <small>{r.text}</small>
                  </span>
                  <div className="seg small">
                    {r.options.map((o) => (
                      <button
                        key={o.value}
                        className={settings[r.key] === o.value ? 'active' : ''}
                        disabled={readOnly && settings[r.key] !== o.value}
                        onClick={() => !readOnly && setSettings({ ...settings, [r.key]: o.value })}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <label key={r.key} className={`toggle${settings[r.key] ? ' on' : ''}${readOnly ? ' read-only' : ''}`} title={r.text}>
                  <input
                    type="checkbox"
                    checked={!!settings[r.key]}
                    disabled={readOnly}
                    onChange={(e) => setSettings({ ...settings, [r.key]: e.target.checked })}
                  />
                  <span className="switch" />
                  <span>
                    <strong>{r.name}</strong>
                    <small>{r.text}</small>
                  </span>
                </label>
              ),
            )}
          </div>
        )}
      </div>
    </div>
  )
}

const NAMES = {
  skip: 'Skip', reverse: 'Reverse', draw1: 'Draw 1', draw2: 'Draw 2', draw4: 'Draw 4', draw5: 'Draw 5',
  skipall: 'Skip All', discardall: 'Discard All', flip: 'Flip', hit2: 'Hit 2', trade: 'Trade', wild: 'Wild',
  wild4: 'Wild +4', wilddraw2: 'Wild +2', wilddrawcolor: 'Draw Color', wildrev4: 'Reverse +4', wild6: 'Wild +6',
  wild10: 'Wild +10', roulette: 'Roulette', wildhitfire: 'Hit-Fire', wildallhit: 'All Hit', '7': '7 = Swap', '0': '0 = Pass',
}
const captionOf = (c) => (c.flex ? `Flex ${NAMES[c.value] ?? c.value}` : NAMES[c.value] ?? c.value)
