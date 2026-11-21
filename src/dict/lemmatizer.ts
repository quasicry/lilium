// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry
/**
 * lilium 辭典 — English lemmatizer.
 *
 * Rebuilt on spaCy's three-tier lemmatizer design (explosion/spaCy
 * spacy/pipeline/lemmatizer.py + lookups, MIT):
 *   1. lookup table first  — spaCy lemma_exc (POS-priority merged) + lemma_lookup,
 *      pruned to only the forms the rule engine cannot derive
 *      (data/lemma-lookup-en.ts, 3,700+ entries: irregular verbs, clitics,
 *      foreign plurals, vowel changes);
 *   2. morphological suffix rules — the v1.6 rule engine, with the doubling
 *      heuristic retained (lemma_rules analog);
 *   3. rule ordering — spaCy applies exception tables before rules; our lookup
 *      table IS the exception table, so checked first for the same effect.
 *
 * bugs fixed by adopting spaCy data: `sending → sell` (now send),
 * phantom `raning`, case-typo `alumnI`, missing suppletive forms (went/ran/…),
 * foreign plurals (alumni/meninges/criteria/phenomena…).
 *
 * Candidates are verified against dictionary headwords by the caller.
 */
// 懶載入
import { loadSpacyLemmaLookupEn } from './data/lemma-lookup-en.lazy';

const IRREGULAR: Record<string, string[]> = loadSpacyLemmaLookupEn();

function restoreDoubleConsonant(w: string): string {
  // e.g. "stopped" → "stop", "running" → "run"
  const n = w.length;
  if (n > 3) {
    const a = w[n - 1], b = w[n - 2];
    if (a === b && !'aeiouwxy'.includes(a)) return w.slice(0, -1);
  }
  return w;
}

/**
 * Generate lemma candidates for an English word (most likely first).
 * Order follows spaCy: lookup (exception) candidates outrank rule output.
 * Caller should verify each against the dictionary.
 */
export function lemmatize(word: string): string[] {
  const w = word.toLowerCase().trim();
  if (w.length < 3) return [];
  const out: string[] = [];
  const push = (s: string) => {
    if (s && s !== word && s.length >= 2 && !out.includes(s)) out.push(s);
  };

  // 1) spaCy lookup table (exceptions & suppletive forms) — outranks rules.
  //    Values are priority-ordered candidate lists (verb>noun>adj>adv); push all.
  const irs = IRREGULAR[w];
  if (irs) for (const s of irs) push(s);

  // 2) morphological suffix rules (spaCy lemma_rules analog)
  // plural / 3rd person singular
  if (w.endsWith('ies') && w.length > 4) push(w.slice(0, -3) + 'y');
  if (w.endsWith('ves') && w.length > 4) { push(w.slice(0, -3) + 'f'); push(w.slice(0, -3) + 'fe'); }
  if (w.endsWith('es')) {
    push(w.slice(0, -2));
    if (w.endsWith('ses') || w.endsWith('xes') || w.endsWith('zes') || w.endsWith('ches') || w.endsWith('shes')) push(w.slice(0, -2));
  }
  if (w.endsWith('s') && !w.endsWith('ss') && !w.endsWith('us') && !w.endsWith('is')) push(w.slice(0, -1));

  // past tense / past participle
  if (w.endsWith('ied') && w.length > 4) push(w.slice(0, -3) + 'y');
  if (w.endsWith('ed')) {
    push(w.slice(0, -2));
    push(restoreDoubleConsonant(w.slice(0, -2)));
    push(w.slice(0, -1)); // e.g. "loved" → "love" handled by -d
  }

  // gerund / present participle
  if (w.endsWith('ing') && w.length > 5) {
    push(w.slice(0, -3));
    push(restoreDoubleConsonant(w.slice(0, -3)));
    push(w.slice(0, -3) + 'e'); // "making" → "make"
  }

  // adverbs
  if (w.endsWith('ily') && w.length > 4) push(w.slice(0, -3) + 'y');
  if (w.endsWith('ly')) push(w.slice(0, -2));

  // comparatives / superlatives
  if (w.endsWith('ier') && w.length > 4) push(w.slice(0, -3) + 'y');
  if (w.endsWith('iest') && w.length > 5) push(w.slice(0, -4) + 'y');
  if (w.endsWith('er')) { push(w.slice(0, -2)); push(restoreDoubleConsonant(w.slice(0, -2))); }
  if (w.endsWith('est')) { push(w.slice(0, -3)); push(restoreDoubleConsonant(w.slice(0, -3))); }

  return out;
}
