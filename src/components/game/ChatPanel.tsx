'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { ChatEntry } from '@/features/multiplayer/chat';
import { CHAT_MAX_CHARS } from '@/features/multiplayer/chat';
import type { SendResult } from '@/features/multiplayer/client';
import type { MultiplayerState } from '@/features/multiplayer/useMultiplayer';

const NOTICES: Record<Exclude<SendResult, { ok: true }>['reason'], string> = {
  offline: 'Not connected right now. Your message was not sent.',
  'rate-limited': 'Slow down a little: wait a moment before sending again.',
  invalid: `Messages must be 1 to ${CHAT_MAX_CHARS} characters.`,
};

/**
 * Room chat. Every message is rendered as a React text node (escaped by React):
 * never as HTML. Names come from the database, never from the sender.
 */
export function ChatPanel({ entries, status, onSend, onTyping, onClose }: {
  entries: readonly ChatEntry[];
  status: MultiplayerState['status'];
  onSend: (text: string) => SendResult;
  onTyping: (typing: boolean) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const length = Array.from(draft).length;
  const canChat = status !== 'off' && status !== 'unavailable';

  // Keep the newest message in view.
  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight }); }, [entries]);
  // Leaving the panel must give the keys back to the game.
  useEffect(() => () => onTyping(false), [onTyping]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!draft.trim()) return;
    const result = onSend(draft);
    if (result.ok) { setDraft(''); setNotice(null); } else setNotice(NOTICES[result.reason]);
  };

  return (
    <section aria-label="Chat" className="pointer-events-auto absolute right-3 top-16 z-20 flex max-h-[min(24rem,60vh)] w-[min(22rem,calc(100%-1.5rem))] flex-col rounded-2xl bg-adire-900/90 text-cream shadow-card backdrop-blur">
      <header className="flex items-center justify-between border-b border-cream/10 px-3 py-2">
        <h2 className="font-display text-sm font-black">💬 Kuto Street chat</h2>
        <button type="button" onClick={onClose} className="rounded-full px-2 text-cream/70 hover:bg-adire-700 hover:text-cream" aria-label="Close chat">✕</button>
      </header>
      <ol ref={listRef} className="min-h-[4rem] flex-1 space-y-1 overflow-y-auto px-3 py-2 text-sm" aria-live="polite">
        {entries.length === 0 && <li className="text-cream/50">{canChat ? 'No messages yet. Say hello!' : 'Sign in with a character to chat with other players.'}</li>}
        {entries.map((m) => (
          <li key={m.id} className="break-words">
            <span className={`font-bold ${m.self ? 'text-palm-300' : 'text-ogun-400'}`}>{m.self ? 'You' : m.name}</span>
            <span className="text-cream/60">: </span>
            <span>{m.text}</span>
          </li>
        ))}
      </ol>
      <form onSubmit={submit} className="border-t border-cream/10 p-2">
        {notice && <p role="alert" className="mb-1 px-1 text-xs text-palm-300">{notice}</p>}
        <div className="flex gap-2">
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => { setDraft(e.target.value); setNotice(null); }}
            onFocus={() => onTyping(true)}
            onBlur={() => onTyping(false)}
            onKeyDown={(e) => { if (e.key === 'Escape') inputRef.current?.blur(); }}
            maxLength={CHAT_MAX_CHARS * 2}
            disabled={!canChat}
            placeholder={canChat ? 'Type a message…' : 'Chat unavailable'}
            aria-label="Chat message"
            autoComplete="off"
            enterKeyHint="send"
            className="min-w-0 flex-1 rounded-xl bg-cream px-3 py-2 text-base text-ink outline-none focus:ring-2 focus:ring-ogun-400 disabled:opacity-50"
          />
          <button type="submit" disabled={!canChat || length === 0 || length > CHAT_MAX_CHARS} className="rounded-xl bg-ogun-500 px-3 font-bold text-white disabled:opacity-40">Send</button>
        </div>
        <p className={`mt-1 px-1 text-right text-[10px] ${length > CHAT_MAX_CHARS ? 'text-laterite-300' : 'text-cream/40'}`}>{length}/{CHAT_MAX_CHARS}</p>
      </form>
    </section>
  );
}
