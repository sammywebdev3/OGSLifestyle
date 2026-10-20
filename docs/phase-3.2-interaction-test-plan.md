# Phase 3.2: multiplayer interaction (chat, bubbles, emotes): test plan

Signed-in players in **Kuto Street** can chat, see speech bubbles above each other, and send emotes (👋 wave,
🤝 greet, 😂 laugh, ❤️ heart) to players nearby.

**Status:** not yet tested with two real accounts. It counts as working only once section 3 passes on the Vercel
Preview.

## 1. How it works, and why no migration is needed

| Piece | Details |
|---|---|
| Transport | Chat and emotes are Realtime **broadcast** events (`chat`, `emote`) on the sender's **own** private topic `mp:<room>:<player id>`, the same topic as movement. |
| Who can send | The existing Phase 3.1 policy lets only the owner of `<player id>` broadcast on that topic. It checks the topic, not the event name, so a chat line is bound to its sender like movement. `npm run test:db` (section 20 onwards) proves the policy has no event-name gap: own topic allowed; other players' topics, the room topic, players without a character and anon all refused. |
| Names | Always from the database profile (`get_player_profiles`), never from the message. |
| Storage | **Nothing is stored.** Chat history is in memory only: the last 50 lines in this browser tab, gone on reload. |
| Limits | Messages are 1–200 characters. They are cleaned of control, invisible and bidi characters, and stacked accent marks are capped. |
| Sending rate | Chat: 5 messages in a burst, then 1 every 2 s. Emotes: 3, then 1 every 1.5 s. |
| Receiving rate | Enforced per sender (8 chat / 5 emotes in a burst), so a modified client cannot flood other screens. |
| Rendering | Chat panel lines are React text. Bubbles are Phaser text. HTML in a message is shown literally, never run. |
| Emotes and proximity | Emotes are shown only to players within 8 tiles. The emote bar ("Near <name>", keys 1–4) appears within 1.75 tiles. Positions are cosmetic and authorize nothing. |
| Guests | Guests cannot chat or emote. The panel says so. |
| Untouched | Cash, inventory, character creation and sign-in are unchanged, and checked by `safety.test.ts` and `test:db`. |

**No Supabase migration, policy change or dashboard setting is needed.**

## 2. Before you test

- Use the **Vercel Preview** of this branch, with the commit shown in the report. It uses the live Supabase project,
  which already has the Phase 3.1 migration. Nothing new needs to be applied.
- You need two accounts with characters (A and B) in two separate browser sessions (two devices, or a normal and an
  incognito window).

## 3. Two-account test

| # | Step | Expected |
|---|---|---|
| 1 | A and B open **/play**. | Both HUDs show **Online · 1 nearby**. |
| 2 | A taps **💬**, types `Báwo ni?` and presses **Enter**. | A sees "You: Báwo ni?" and a bubble above A's character. B sees **A's character name** with the text in the panel, and a bubble above A. |
| 3 | B sends with the **Send** button. | Same, the other way round. |
| 4 | With B's panel closed, A sends 2 messages. | B's 💬 shows a red **2**. Opening the panel clears it. |
| 5 | A types `wasd` and `e` and holds **W** in the chat box. | The letters go into the box. A's character does **not** move, and no door dialog opens. After **Escape** (or tapping the game), the keys move A again. |
| 6 | A sends `<b>bold</b> <img src=x onerror=alert(1)>`. | Shown literally as text in the panel and the bubble. No bold, no image, no pop-up. |
| 7 | A pastes 250 characters. | The counter goes red. Send is disabled, or shows "Messages must be 1 to 200 characters". |
| 8 | A sends 7 messages as fast as possible. | The first 5 go through, then "Slow down a little…". After a few seconds A can send again. |
| 9 | A sends a long message. | The bubble wraps onto a few lines, ends with "…" if too long, and stays on screen near the edges. It disappears after 4–9 s. |
| 10 | Walk A right next to B. | A sees **"Near <B's name>"** with 👋 🤝 😂 ❤️. Moving away hides it. |
| 11 | A taps 👋, or presses **1**. | 👋 appears above A on both screens for about 2.5 s. |
| 12 | Move B more than about 8 tiles away, then A emotes. | B does not see A's emote. |
| 13 | While A has a bubble showing, close A's tab. | On B's screen, A's character **and bubble** disappear together. |
| 14 | Reload A and chat again. | Chat works again. A's own earlier history is gone (it is per tab). B still has their history. |
| 15 | A in airplane mode for 20 s, then reconnect. | While offline, sending shows "Not connected right now…". After reconnecting, chat works. |
| 16 | A third session plays as a **guest**. | The chat box is disabled ("Sign in with a character to chat…"), and the guest sees no chat. |
| 17 | Afterwards, check A and B. | Cash (**₦50,000**) and inventory are unchanged. Chat and emotes save nothing. |

## 4. What was verified, and how

| Claim | How | Real Supabase Realtime? |
|---|---|---|
| Chat and emotes on your own topic only; others, the room topic, no-character users and anon refused | `npm run test:db`, sections 20–23 (stand-in `realtime.messages`) | **No.** It is the same policy that was verified live for movement in Phase 3.1. |
| Two clients chatting and emoting; impersonation, floods, unknown emotes, offline sending, reconnects | `npm test` (`client.test.ts`, in-memory Realtime stand-in) | **No** |
| Cleaning, length, rate limits, history bounds, bubble wrap and expiry, proximity | `npm test` (`chat.test.ts`, `bubbles.test.ts`) | n/a |
| No HTML injection; chat code never touches tables, cash, inventory, sign-in | `npm test` (`safety.test.ts`, mutation-checked) | n/a |
| Bubbles, emotes, emote bar, typing not moving the player, bubble removed on leave | Browser check on a local production build with injected events | **No** (no network) |
| Two real accounts chatting on the Preview | Section 3 | **Not yet** |
