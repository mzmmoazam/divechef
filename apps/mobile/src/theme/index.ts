import { tokens, type Tokens } from './tokens';

export { tokens };
export type { Tokens };

/**
 * v1: dark-only. Returns tokens directly. The hook exists so future
 * light-mode work has a single seam to extend without changing every
 * consumer.
 */
export function useTheme(): Tokens {
  return tokens;
}
