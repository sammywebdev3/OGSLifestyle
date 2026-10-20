/**
 * Static safety checks over the source tree (no browser needed):
 *  - user text can never be injected as HTML;
 *  - multiplayer/chat code cannot reach cash, inventory, character creation or auth.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('../../', import.meta.url));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return sourceFiles(p);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.ts$/.test(name) ? [p] : [];
  });
}

const read = (p: string) => readFileSync(p, 'utf8');
const rel = (p: string) => relative(SRC, p);

test('no HTML injection anywhere: no dangerouslySetInnerHTML, innerHTML, outerHTML or insertAdjacentHTML', () => {
  const offenders = sourceFiles(SRC).filter((p) => /dangerouslySetInnerHTML|\.innerHTML\s*=|\.outerHTML\s*=|insertAdjacentHTML|document\.write/.test(read(p)));
  assert.deepEqual(offenders.map(rel), []);
});

const MULTIPLAYER = [
  ...sourceFiles(join(SRC, 'features/multiplayer')),
  join(SRC, 'components/game/ChatPanel.tsx'),
  join(SRC, 'components/game/EmoteBar.tsx'),
];

test('chat and multiplayer code only calls the profile lookup, never tables or other functions', () => {
  for (const p of MULTIPLAYER) {
    const src = read(p);
    assert.equal(/\.from\(\s*['"`]/.test(src), false, `${rel(p)} reads or writes a table`); // Supabase .from('table'), not Array.from(x)
    const rpcs = [...src.matchAll(/\.rpc\(\s*'([^']+)'/g)].map((m) => m[1]);
    for (const name of rpcs) assert.equal(name, 'get_player_profiles', `${rel(p)} calls rpc ${name}`);
  }
});

test('chat and multiplayer code does not touch cash, inventory, character creation or sign-in', () => {
  const forbidden = /create_character|postCharacter|fetchMyPlayer|features\/player\/api|features\/auth|signIn|signUp|signOut|lib\/supabase\/admin|\.cash\b|inventory/i;
  const secrets = /SUPABASE_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY|sb_secret_/;
  const isComment = (line: string) => /^(\*|\/\/|\/\*)/.test(line.trim());
  for (const p of MULTIPLAYER) {
    const hit = read(p).split('\n').find((line) => !isComment(line) && (forbidden.test(line) || secrets.test(line)));
    assert.equal(hit, undefined, `${rel(p)}: ${hit}`);
  }
});
