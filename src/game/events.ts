import type { UiToWorldEvents, WorldToUiEvents } from '@/types/game';

type Handler<T> = (payload: T) => void;
type Args<T> = [T] extends [void] ? [] : [T];

/** Minimal typed event emitter (no Phaser dependency, safe to import anywhere). */
export class EventBus<E extends object> {
  private handlers = new Map<keyof E, Set<Handler<never>>>();

  on<K extends keyof E>(event: K, fn: Handler<E[K]>): () => void {
    let set = this.handlers.get(event);
    if (!set) this.handlers.set(event, (set = new Set()));
    set.add(fn as Handler<never>);
    return () => set.delete(fn as Handler<never>);
  }

  emit<K extends keyof E>(event: K, ...args: Args<E[K]>): void {
    this.handlers.get(event)?.forEach((fn) => (fn as Handler<E[K] | undefined>)(args[0]));
  }

  clear(): void {
    this.handlers.clear();
  }
}

/** Two one-way channels between the Phaser world and the React UI. */
export interface GameBus {
  world: EventBus<WorldToUiEvents>;
  ui: EventBus<UiToWorldEvents>;
}

export function createGameBus(): GameBus {
  return { world: new EventBus<WorldToUiEvents>(), ui: new EventBus<UiToWorldEvents>() };
}
