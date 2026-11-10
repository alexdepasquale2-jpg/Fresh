/** Small typed event bus. Handlers run synchronously in subscription order. */
export type Handler<T> = (payload: T) => void;

export interface Bus<E extends Record<string, unknown>> {
  on<K extends keyof E>(type: K, h: Handler<E[K]>): () => void;
  once<K extends keyof E>(type: K, h: Handler<E[K]>): () => void;
  emit<K extends keyof E>(type: K, payload: E[K]): void;
  clear(): void;
}

export const createBus = <E extends Record<string, unknown>>(): Bus<E> => {
  const map = new Map<keyof E, Set<Handler<never>>>();
  const on = <K extends keyof E>(type: K, h: Handler<E[K]>) => {
    let set = map.get(type);
    if (!set) map.set(type, (set = new Set()));
    set.add(h as Handler<never>);
    return () => void set.delete(h as Handler<never>);
  };
  return {
    on,
    once: (type, h) => {
      const off = on(type, (p) => {
        off();
        h(p);
      });
      return off;
    },
    emit: (type, payload) => {
      const set = map.get(type);
      if (!set) return;
      for (const h of [...set]) (h as Handler<typeof payload>)(payload);
    },
    clear: () => map.clear(),
  };
};
