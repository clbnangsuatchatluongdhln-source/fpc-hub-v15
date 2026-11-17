type EventMap = Record<string, unknown>;

const bus = new EventTarget();

export function emit<K extends keyof EventMap & string>(
  name: K,
  detail: EventMap[K],
): void {
  bus.dispatchEvent(new CustomEvent(name, { detail }));
}

export function on<K extends keyof EventMap & string>(
  name: K,
  handler: (detail: EventMap[K]) => void,
): () => void {
  const listener = (e: Event): void => {
    handler((e as CustomEvent<EventMap[K]>).detail);
  };
  bus.addEventListener(name, listener);
  return () => bus.removeEventListener(name, listener);
}
