/* ============================================================
   FPC LAB · src/core/store.ts
   Port tối thiểu từ v14 `02-store.js` — Store với pub/sub.
   Giữ API gốc: snapshot() / patch() / select().
   ============================================================ */

export interface StoreState {
  events: unknown[];
  files: Record<string, unknown[]>;
  projects: unknown[];
  users: unknown[];
  conversations: unknown[];
  messagesByConv: Record<string, unknown[]>;
  activeConvId: string;
  convTab: 'all' | 'unread' | 'group';
  convSearch: string;
  weekOffset: number;
  searchFilter: string;
}

type Selector<T> = (state: StoreState) => T;

interface Subscriber<T> {
  sel: Selector<T>;
  cb: (v: T) => void;
  last: { value: T };
}

let state: StoreState = {
  events: [],
  files: {},
  projects: [],
  users: [],
  conversations: [],
  messagesByConv: {},
  activeConvId: 'general',
  convTab: 'all',
  convSearch: '',
  weekOffset: 0,
  searchFilter: '',
};

const subs = new Set<Subscriber<unknown>>();

export const Store = {
  snapshot(): StoreState {
    return state;
  },

  patch(p: Partial<StoreState>): void {
    const next: StoreState = { ...state, ...p };
    const changed = (Object.keys(p) as (keyof StoreState)[]).filter(
      (k) => next[k] !== state[k],
    );
    state = next;
    if (!changed.length) return;

    for (const sub of subs) {
      const now = sub.sel(state);
      if (now !== sub.last.value) {
        sub.last.value = now;
        sub.cb(now);
      }
    }
  },

  select<T>(sel: Selector<T>, cb: (v: T) => void): () => void {
    const entry: Subscriber<unknown> = {
      sel: sel as Selector<unknown>,
      cb: cb as (v: unknown) => void,
      last: { value: sel(state) as unknown },
    };
    subs.add(entry);
    return () => subs.delete(entry);
  },
};

// LEGACY BRIDGE — v14 code gọi window.Store
declare global {
  interface Window {
    Store?: typeof Store;
  }
}
window.Store = Store;
