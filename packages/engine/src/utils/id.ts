/**
 * id.ts — Lightweight ID generation.
 *
 * Used for narrative entry IDs and score event IDs.  We avoid the `crypto`
 * module API surface at this level to keep the engine environment-agnostic;
 * a simple collision-resistant string is sufficient for MVP.
 *
 * In a Node 20+ / browser environment, crypto.randomUUID() could be used
 * instead — swap out generateId() if you need RFC 4122 compliance.
 */

let counter = 0;

/**
 * Generates a short, unique, monotonically increasing string ID.
 * Not cryptographically random — only used as internal object identifiers
 * within a single session (narrative entries, score events).
 */
export function generateId(): string {
  const timestamp = Date.now().toString(36);
  const sequence = (++counter).toString(36).padStart(4, "0");
  return `${timestamp}-${sequence}`;
}

/** Resets the counter — useful in tests to get predictable IDs. */
export function resetIdCounter(): void {
  counter = 0;
}
