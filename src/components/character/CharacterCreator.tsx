'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import type { AvatarSelection, BodyType, Headwear, OutfitColor, SkinTone } from '@/types/player';
import { BODY_TYPES, DEFAULT_AVATAR, HEADWEAR, OUTFIT_COLORS, SKIN_TONES, STARTING_CASH } from '@/config/game';
import { NAME_MAX, NAME_MIN, validateCharacterName } from '@/lib/validation/character';
import { usePlayer, type PlayerMode } from '@/features/player/PlayerProvider';
import { ApiError } from '@/features/player/api';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Notice } from '@/components/ui/Notice';
import { Spinner } from '@/components/ui/Spinner';
import { AvatarPreview } from './AvatarPreview';
import { OptionPicker } from './OptionPicker';

const entries = <K extends string, V>(o: Record<K, V>) => Object.entries(o) as [K, V][];

export function CharacterCreator({ requestedMode }: { requestedMode: PlayerMode | null }) {
  const router = useRouter();
  const { status, mode: currentMode, player, onlineAvailable, createCharacter } = usePlayer();
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState<AvatarSelection>(DEFAULT_AVATAR);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  // Signed in without a character → online. Otherwise guest, if asked for or if accounts aren't available.
  const signedInOnline = currentMode === 'online' && status === 'no-character';
  const mode: PlayerMode = signedInOnline ? 'online' : 'guest';
  const needsAccount = !signedInOnline && onlineAvailable && requestedMode !== 'guest';

  useEffect(() => {
    if (status === 'ready' && player) router.replace('/apartment');
    else if (status === 'signed-out' && needsAccount) router.replace('/register');
  }, [status, player, needsAccount, router]);

  if (status === 'loading' || (status === 'ready' && player) || (status === 'signed-out' && needsAccount)) return <Spinner label="Loading your profile…" />;

  const set = <K extends keyof AvatarSelection>(k: K) => (v: AvatarSelection[K]) => setAvatar((a) => ({ ...a, [k]: v }));
  const nameCheck = validateCharacterName(name);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!nameCheck.ok) return setErrors(nameCheck.errors);
    setBusy(true); setErrors([]);
    try {
      await createCharacter({ characterName: nameCheck.value, avatar }, mode);
      router.push('/apartment');
    } catch (err) {
      setErrors(err instanceof ApiError && err.details.length ? err.details : [err instanceof Error ? err.message : 'Could not create your character.']);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-5 md:grid-cols-[280px_1fr]">
      <Card className="flex flex-col items-center justify-center bg-gradient-to-b from-palm-300/60 to-cream">
        <AvatarPreview avatar={avatar} size={180} />
        <p className="mt-2 font-display text-xl font-black">{nameCheck.ok ? nameCheck.value : 'Your name'}</p>
        <p className="text-xs font-semibold text-ink/60">Starts in Kuto with ₦{STARTING_CASH.toLocaleString('en-NG')}</p>
      </Card>
      <Card className="space-y-5">
        <div>
          <h1 className="font-display text-2xl font-black">Create your character</h1>
          {mode === 'guest' && <div className="mt-3"><Notice tone="warn">Guest mode: this character is saved only in this browser, and its cash is a local preview — not a real game balance.</Notice></div>}
        </div>
        <label className="block text-sm font-bold">Character name
          <input value={name} onChange={(e) => { setName(e.target.value); setErrors([]); }} maxLength={NAME_MAX + 4} placeholder="e.g. Ayomide Bakare" className="mt-1 w-full rounded-xl border border-ink/15 bg-white px-3 py-2.5 text-base font-normal outline-none focus:border-ogun-500 focus:ring-2 focus:ring-ogun-500/30" aria-describedby="name-help" />
          <span id="name-help" className="mt-1 block text-xs font-normal text-ink/60">{NAME_MIN}–{NAME_MAX} letters. Spaces, apostrophes and hyphens are fine.</span>
        </label>
        <OptionPicker<BodyType> legend="Body" name="body" value={avatar.body} onChange={set('body')} options={entries(BODY_TYPES).map(([v, o]) => ({ value: v, label: o.label }))} />
        <OptionPicker<SkinTone> legend="Skin tone" name="skin" value={avatar.skin} onChange={set('skin')} options={entries(SKIN_TONES).map(([v, o]) => ({ value: v, label: o.label, swatch: o.hex }))} />
        <OptionPicker<Headwear> legend="Hair & headwear" name="headwear" value={avatar.headwear} onChange={set('headwear')} options={entries(HEADWEAR).map(([v, o]) => ({ value: v, label: o.label }))} />
        <OptionPicker<OutfitColor> legend="Outfit colour" name="outfit" value={avatar.outfit} onChange={set('outfit')} options={entries(OUTFIT_COLORS).map(([v, o]) => ({ value: v, label: o.label, swatch: o.hex }))} />
        {errors.length > 0 && <Notice tone="error"><ul className="list-inside list-disc">{errors.map((e) => <li key={e}>{e}</li>)}</ul></Notice>}
        <Button type="submit" disabled={busy} className="w-full">{busy ? 'Creating…' : 'Move into Kuto →'}</Button>
      </Card>
    </form>
  );
}
