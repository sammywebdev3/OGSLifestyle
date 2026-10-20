/**
 * MultiplayerClient wired to an in-memory stand-in for Supabase Realtime.
 *
 * FakeHub applies the same rules as the database policies in
 * supabase/migrations/20261019000000_phase3_1_multiplayer.sql: players may track
 * presence on mp:<room>, read any multiplayer topic, and broadcast ONLY on
 * mp:<room>:<their own player id>. It is not the real Realtime server; the real
 * thing must still be tested with two browsers (docs/phase-3.1-multiplayer-test-plan.md).
 */
import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { MultiplayerClient, type MultiplayerStatus } from './client.ts';
import type { RosterEvent } from './roster.ts';

const ROOM = 'kuto-street';
const A = '0f0e0d0c-0b0a-4000-8000-00000000000a';
const B = '0f0e0d0c-0b0a-4000-8000-00000000000b';
const AVATAR = { body: 'femme', skin: 'deep', headwear: 'gele', outfit: 'adire' };
const BOUNDS = { width: 20, height: 18 };
const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms));

type Handler = (msg: { payload: unknown }) => void;

class FakeChannel {
  readonly topic: string;
  readonly private: boolean;
  readonly key: string | undefined;
  joined = false;
  broadcastHandlers = new Map<string, Handler[]>();
  presenceHandlers: (() => void)[] = [];
  private readonly hub: FakeHub;
  private readonly owner: string | null;

  constructor(hub: FakeHub, owner: string | null, topic: string, opts: { config?: { private?: boolean; presence?: { key?: string } } }) {
    this.hub = hub; this.owner = owner; this.topic = topic;
    this.private = opts.config?.private === true;
    this.key = opts.config?.presence?.key;
  }

  on(type: string, filter: { event: string }, cb: Handler | (() => void)) {
    if (type === 'broadcast') this.broadcastHandlers.set(filter.event, [...(this.broadcastHandlers.get(filter.event) ?? []), cb as Handler]);
    if (type === 'presence' && filter.event === 'sync') this.presenceHandlers.push(cb as () => void);
    return this;
  }

  subscribe(cb?: (status: string, err?: Error) => void) {
    queueMicrotask(() => {
      if (!this.private || !this.hub.canRead(this.owner, this.topic)) { cb?.('CHANNEL_ERROR', new Error('Unauthorized: You do not have permissions to read from this Channel topic')); return; }
      this.joined = true;
      this.hub.join(this);
      cb?.('SUBSCRIBED');
    });
    return this;
  }

  async track(meta: object) {
    if (!this.hub.canTrack(this.owner, this.topic) || !this.key) return 'error';
    this.hub.track(this.topic, this.key, meta);
    return 'ok';
  }

  presenceState() { return this.hub.presenceState(this.topic); }

  async send(msg: { type: string; event: string; payload: unknown }) {
    if (!this.joined || !this.hub.canBroadcast(this.owner, this.topic)) return 'error';
    this.hub.broadcast(this, msg.event, msg.payload);
    return 'ok';
  }

  leave() {
    this.joined = false;
    this.hub.leave(this);
  }
}

class FakeHub {
  channels = new Set<FakeChannel>();
  presence = new Map<string, Map<string, object[]>>();
  players = new Map<string, { player_id: string; character_name: string; avatar: object }>();
  rpcCalls = 0;

  canRead(owner: string | null, topic: string) { return owner !== null && /^mp:[a-z0-9-]{1,40}(:[0-9a-f-]{36})?$/.test(topic); }
  canTrack(owner: string | null, topic: string) { return owner !== null && /^mp:[a-z0-9-]{1,40}$/.test(topic); }
  canBroadcast(owner: string | null, topic: string) { return owner !== null && topic.split(':')[2] === owner && topic.split(':').length === 3; }

  join(ch: FakeChannel) { this.channels.add(ch); }
  leave(ch: FakeChannel) {
    this.channels.delete(ch);
    const p = this.presence.get(ch.topic);
    if (ch.key && p?.delete(ch.key)) this.syncPresence(ch.topic);
  }
  track(topic: string, key: string, meta: object) {
    const p = this.presence.get(topic) ?? new Map<string, object[]>();
    this.presence.set(topic, p);
    p.set(key, [...(p.get(key) ?? []), meta]);
    this.syncPresence(topic);
  }
  presenceState(topic: string) { return Object.fromEntries(this.presence.get(topic) ?? []); }
  syncPresence(topic: string) { for (const ch of this.channels) if (ch.topic === topic) ch.presenceHandlers.forEach((h) => h()); }
  broadcast(from: FakeChannel | null, event: string, payload: unknown, topic = from?.topic) {
    for (const ch of this.channels) if (ch !== from && ch.topic === topic) (ch.broadcastHandlers.get(event) ?? []).forEach((h) => h({ payload }));
  }
  /** A modified client sending raw payloads as `owner`: the same server rule still applies. */
  rawSend(owner: string, topic: string, event: string, payload: unknown): 'ok' | 'error' {
    if (!this.canBroadcast(owner, topic)) return 'error';
    this.broadcast(null, event, payload, topic);
    return 'ok';
  }
  db(owner: string | null) {
    return {
      realtime: { setAuth: async () => undefined },
      channel: (topic: string, opts: object) => new FakeChannel(this, owner, topic, opts),
      removeChannel: async (ch: FakeChannel) => { ch.leave(); return 'ok'; },
      rpc: async (_fn: string, args: { p_player_ids: string[] }) => {
        this.rpcCalls++;
        if (!owner) return { data: null, error: { message: 'denied' } };
        return { data: args.p_player_ids.map((id) => this.players.get(id)).filter(Boolean), error: null };
      },
    };
  }
}

interface Probe {
  client: MultiplayerClient; events: RosterEvent[]; statuses: MultiplayerStatus[]; visible: number; closedChannels: number;
  chats: { playerId: string; name: string; text: string }[]; emotes: { playerId: string; emote: string }[];
}

function connect(hub: FakeHub, playerId: string | null, asPlayer = playerId ?? A): Probe {
  const probe = { events: [] as RosterEvent[], statuses: [] as MultiplayerStatus[], visible: 0, closedChannels: 0, chats: [], emotes: [] } as unknown as Probe;
  const db = hub.db(playerId);
  const remove = db.removeChannel;
  db.removeChannel = async (ch: FakeChannel) => { probe.closedChannels++; return remove(ch); };
  probe.client = new MultiplayerClient(db as any, asPlayer, ROOM, BOUNDS, {
    onStatus: (s) => probe.statuses.push(s),
    onEvents: (events, visible) => { probe.events.push(...events); probe.visible = visible; },
    onChat: ({ playerId, name, text }) => probe.chats.push({ playerId, name, text }),
    onEmote: ({ playerId, emote }) => probe.emotes.push({ playerId, emote }),
  });
  return probe;
}

const clients: Probe[] = [];
afterEach(() => { while (clients.length) clients.pop()?.client.stop(); });

function setup() {
  const hub = new FakeHub();
  hub.players.set(A, { player_id: A, character_name: 'Adé Bello', avatar: AVATAR });
  hub.players.set(B, { player_id: B, character_name: 'Bayo Ade', avatar: AVATAR });
  return hub;
}

async function startBoth(hub: FakeHub) {
  const a = connect(hub, A); const b = connect(hub, B);
  clients.push(a, b);
  await a.client.start(); await b.client.start();
  await tick();
  return { a, b };
}

test('two players in the same room see each other, with names from the database', async () => {
  const hub = setup();
  const { a, b } = await startBoth(hub);
  assert.equal(a.statuses.at(-1), 'online');
  assert.equal(b.statuses.at(-1), 'online');

  a.client.sendLocal({ x: 4.5, y: 6.4, facing: 'right', moving: false });
  b.client.sendLocal({ x: 8, y: 9, facing: 'left', moving: false });
  await tick();

  const joinOfB = a.events.find((e) => e.type === 'join');
  assert.ok(joinOfB && joinOfB.type === 'join');
  assert.equal(joinOfB.player.id, B);
  assert.equal(joinOfB.player.name, 'Bayo Ade');
  assert.deepEqual([joinOfB.player.x, joinOfB.player.y, joinOfB.player.facing], [8, 9, 'left']);
  assert.equal(a.visible, 1);
  assert.ok(b.events.some((e) => e.type === 'join' && e.player.id === A && e.player.name === 'Adé Bello'));
});

test('movement is relayed as move events, at a limited rate', async () => {
  const hub = setup();
  const { a, b } = await startBoth(hub);
  a.client.sendLocal({ x: 4.5, y: 6.4, facing: 'right', moving: false });
  await tick();
  b.events.length = 0;
  for (let i = 0; i < 30; i++) a.client.sendLocal({ x: 4.5 + i * 0.05, y: 6.4, facing: 'right', moving: true }); // one burst of "frames"
  await tick(150);
  a.client.sendLocal({ x: 6.2, y: 6.4, facing: 'right', moving: false });
  await tick();
  const moves = b.events.filter((e) => e.type === 'move');
  assert.ok(moves.length >= 1 && moves.length <= 3, `${moves.length} moves for 31 local frames`);
  const last = moves.at(-1);
  assert.ok(last && last.type === 'move' && last.id === A && last.x === 6.2 && last.moving === false);
});

test('a player leaving is removed once; rejoining shows them again without a duplicate', async () => {
  const hub = setup();
  const { a, b } = await startBoth(hub);
  b.client.sendLocal({ x: 8, y: 9, facing: 'left', moving: false });
  await tick();
  b.client.stop();
  await tick();
  assert.deepEqual(a.events.filter((e) => e.type === 'leave'), [{ type: 'leave', id: B }]);
  assert.equal(a.visible, 0);

  const b2 = connect(hub, B); clients.push(b2);
  await b2.client.start(); await tick();
  b2.client.sendLocal({ x: 3, y: 3, facing: 'right', moving: false });
  await tick();
  const joins = a.events.filter((e) => e.type === 'join');
  assert.equal(joins.length, 2, 'joined, left, joined again');
  assert.equal(a.visible, 1, 'one sprite, not two');
});

test('the same account in two tabs is one remote player', async () => {
  const hub = setup();
  const { a } = await startBoth(hub);
  const bTab2 = connect(hub, B); clients.push(bTab2);
  await bTab2.client.start(); await tick();
  bTab2.client.sendLocal({ x: 5, y: 5, facing: 'right', moving: false });
  await tick();
  assert.equal(a.events.filter((e) => e.type === 'join').length, 1);
  assert.equal(a.visible, 1);
});

test('impersonation: a client cannot move or create another player by claiming their id', async () => {
  const hub = setup();
  const { a, b } = await startBoth(hub);
  b.client.sendLocal({ x: 8, y: 9, facing: 'left', moving: false });
  await tick();
  a.events.length = 0;

  // Mallory is signed in as player A, but runs a client that claims to be B.
  const mallory = connect(hub, A, B); clients.push(mallory);
  await mallory.client.start(); await tick();
  mallory.client.sendLocal({ x: 1, y: 1, facing: 'right', moving: true });
  await tick(150);
  assert.equal(a.events.filter((e) => e.type === 'move' && e.x === 1).length, 0, 'B was not moved by Mallory');
  assert.equal(a.events.filter((e) => e.type === 'join').length, 0, 'no extra sprite');
});

test('without permission (anon / no character) the client reports "unavailable" and never throws', async () => {
  const hub = setup();
  const anon = connect(hub, null); clients.push(anon);
  await anon.client.start(); await tick();
  assert.equal(anon.statuses.at(-1), 'unavailable');
  assert.equal(anon.statuses.filter((st) => st === 'unavailable').length, 1, 'reported once');
  assert.equal(anon.closedChannels, 2, 'both channels closed, so realtime-js stops retrying the join');
  anon.client.sendLocal({ x: 1, y: 1, facing: 'right', moving: true }); // no-op, no throw
});

test('stop() hides everyone, leaves presence and closes every channel', async () => {
  const hub = setup();
  const { a, b } = await startBoth(hub);
  b.client.sendLocal({ x: 8, y: 9, facing: 'left', moving: false });
  await tick();
  a.client.stop();
  await tick();
  assert.ok(a.events.some((e) => e.type === 'leave' && e.id === B));
  assert.equal([...hub.channels].filter((c) => c.topic.includes(A) || (c.key === A)).length, 0, 'A has no open channels');
  assert.equal(Object.keys(hub.presenceState('mp:kuto-street')).includes(A), false, 'A left presence');
});

// ------------------------------------------------------------------ Phase 3.2: chat and emotes

const SESSION = 'tabRAWRAWRAWRAW1';
const topicOf = (id: string) => `mp:${ROOM}:${id}`;

/** Both players connected and visible to each other. */
async function chatting(hub: FakeHub) {
  const { a, b } = await startBoth(hub);
  a.client.sendLocal({ x: 4.5, y: 6.4, facing: 'right', moving: false });
  b.client.sendLocal({ x: 5.5, y: 6.4, facing: 'left', moving: false });
  await tick();
  return { a, b };
}

test('two players chat: text arrives with the sender\'s name from the database', async () => {
  const hub = setup();
  const { a, b } = await chatting(hub);
  const sent = a.client.sendChat('  Báwo ni?  ');
  assert.deepEqual(sent.ok && sent.text, 'Báwo ni?');
  await tick();
  assert.deepEqual(b.chats, [{ playerId: A, name: 'Adé Bello', text: 'Báwo ni?' }]);
  assert.deepEqual(a.chats, [], 'no echo of our own broadcast (the UI adds our own line locally)');
});

test('chat text is cleaned and kept literal: HTML stays text, bidi tricks are removed', async () => {
  const hub = setup();
  const { a, b } = await chatting(hub);
  a.client.sendChat('<b>hi</b>' + String.fromCodePoint(0x202e) + '!');
  await tick();
  assert.equal(b.chats[0]?.text, '<b>hi</b>!');
});

test('a sender cannot choose the displayed name: extra payload fields are ignored', async () => {
  const hub = setup();
  const { b } = await chatting(hub);
  assert.equal(hub.rawSend(A, topicOf(A), 'chat', { v: 1, s: SESSION, n: 1, t: 'hello', name: 'Bayo Ade', playerId: B }), 'ok');
  await tick();
  assert.deepEqual(b.chats, [{ playerId: A, name: 'Adé Bello', text: 'hello' }]);
});

test('impersonation: chatting or emoting as another player is refused by the topic rule', async () => {
  const hub = setup();
  const { a } = await chatting(hub);
  assert.equal(hub.rawSend(A, topicOf(B), 'chat', { v: 1, s: SESSION, n: 1, t: 'I am Bayo' }), 'error');
  assert.equal(hub.rawSend(A, topicOf(B), 'emote', { v: 1, s: SESSION, n: 1, e: 'heart' }), 'error');
  assert.equal(hub.rawSend(A, `mp:${ROOM}`, 'chat', { v: 1, s: SESSION, n: 1, t: 'to the room topic' }), 'error');
  const mallory = connect(hub, A, B); clients.push(mallory); // signed in as A, client claims B
  await mallory.client.start(); await tick();
  mallory.client.sendChat('fake Bayo');
  await tick();
  assert.equal(a.chats.length, 0, 'nothing appeared as if from B');
});

test('sending is limited: invalid text, offline, and more than 5 messages in a burst', async () => {
  const hub = setup();
  const lone = connect(hub, A); clients.push(lone);
  assert.deepEqual(lone.client.sendChat('hi'), { ok: false, reason: 'offline' }, 'before connecting');
  await lone.client.start(); await tick();
  assert.deepEqual(lone.client.sendChat('   '), { ok: false, reason: 'invalid' });
  assert.deepEqual(lone.client.sendChat('x'.repeat(201)), { ok: false, reason: 'invalid' });
  const results = Array.from({ length: 7 }, (_, i) => lone.client.sendChat(`m${i}`).ok);
  assert.deepEqual(results, [true, true, true, true, true, false, false]);
  assert.deepEqual(lone.client.sendEmote('dance'), { ok: false, reason: 'invalid' });
});

test('receiving is limited too: a modified client flooding chat shows at most 8 messages', async () => {
  const hub = setup();
  const { b } = await chatting(hub);
  for (let n = 1; n <= 30; n++) hub.rawSend(A, topicOf(A), 'chat', { v: 1, s: SESSION, n, t: `spam ${n}` });
  await tick();
  assert.equal(b.chats.length, 8);
});

test('chat and emotes from a player who is not (yet) drawn are ignored', async () => {
  const hub = setup();
  const { a, b } = await startBoth(hub); // nobody has sent a position yet: nobody is drawn
  a.client.sendChat('too early');
  a.client.sendEmote('wave');
  await tick();
  assert.equal(b.chats.length + b.emotes.length, 0);
});

test('emotes: valid ones arrive; unknown emotes and malformed payloads are dropped', async () => {
  const hub = setup();
  const { a, b } = await chatting(hub);
  assert.equal(a.client.sendEmote('wave').ok, true);
  hub.rawSend(A, topicOf(A), 'emote', { v: 1, s: SESSION, n: 50, e: 'nuke' });
  hub.rawSend(A, topicOf(A), 'emote', { v: 1, s: SESSION, n: 51, e: '__proto__' });
  hub.rawSend(A, topicOf(A), 'chat', '<script>');
  await tick();
  assert.deepEqual(b.emotes, [{ playerId: A, emote: 'wave' }]);
  assert.equal(b.chats.length, 0);
});

test('reconnect: after leaving and rejoining, chat works again without duplicates', async () => {
  const hub = setup();
  const { a, b } = await chatting(hub);
  a.client.sendChat('before');
  await tick();
  a.client.stop();
  await tick();
  const a2 = connect(hub, A); clients.push(a2);
  await a2.client.start(); await tick();
  a2.client.sendLocal({ x: 4, y: 6, facing: 'right', moving: false });
  await tick();
  a2.client.sendChat('after');
  await tick();
  assert.deepEqual(b.chats.map((c) => c.text), ['before', 'after']);
});

test('chat and emotes never touch the database except the profile lookup', async () => {
  const hub = setup();
  const { a } = await chatting(hub);
  const callsBefore = hub.rpcCalls;
  for (let i = 0; i < 3; i++) a.client.sendChat(`hi ${i}`);
  a.client.sendEmote('heart');
  await tick();
  assert.equal(hub.rpcCalls, callsBefore, 'no RPC calls for chat or emotes');
});
