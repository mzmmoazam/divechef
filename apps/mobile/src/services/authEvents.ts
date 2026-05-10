type Listener = () => void;
const listeners: Set<Listener> = new Set();

export function onAuthRevoked(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function emitAuthRevoked(): void {
  listeners.forEach((fn) => fn());
}
