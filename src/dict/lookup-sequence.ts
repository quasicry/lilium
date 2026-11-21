// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry
/**
 * lilium 辭典 — lookup sequence guard (Mynary pattern).
 * Prevents stale async results from overwriting fresh ones when the user
 * queries faster than responses arrive.
 */

export class LookupSequence {
  private current = 0;

  /** Begin a new lookup; returns a token to compare against when done. */
  begin(): number {
    return ++this.current;
  }

  /** True if this token is still the latest lookup. */
  isCurrent(token: number): boolean {
    return token === this.current;
  }

  /** Invalidate all in-flight lookups. */
  invalidate(): void {
    this.current++;
  }
}
