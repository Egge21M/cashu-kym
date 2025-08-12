export type Accessor<T> = (item: T) => string;

export interface FuzzyOptions<T> {
  accessor?: Accessor<T>;
  limit?: number;
}

export interface FuzzyResult<T> {
  item: T;
  score: number; // higher = better
}

// ---- Impl ----
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Subsequence-based "good enough" fuzzy score.
 * Returns -Infinity if the query doesn't match the text in order.
 */
function fuzzyScore(query: string, text: string): number {
  query = normalize(query);
  text = normalize(text);

  let qi = 0,
    ti = 0,
    score = 0,
    lastMatch = -1,
    firstMatch = -1;

  while (qi < query.length && ti < text.length) {
    if (query[qi] === text[ti]) {
      if (firstMatch === -1) firstMatch = ti;
      score += 2; // base reward
      if (lastMatch + 1 === ti) score += 1; // contiguous bonus
      lastMatch = ti;
      qi++;
      ti++;
    } else {
      score -= 0.1; // mild gap penalty
      ti++;
    }
  }

  if (qi !== query.length) return -Infinity;

  // bias: earlier start and slightly shorter strings
  if (firstMatch >= 0) score += Math.max(0, 2 - firstMatch * 0.2);
  score -= (text.length - query.length) * 0.01;

  return score;
}

/**
 * Filter + sort by fuzzy score (best first). Non-matches removed.
 */
export function fuzzySearch<T>(
  query: string,
  items: readonly T[],
  options: FuzzyOptions<T> = {},
): T[] {
  const accessor: Accessor<T> = options.accessor ?? ((x) => String(x));
  const scored: FuzzyResult<T>[] = [];

  for (const item of items) {
    const s = fuzzyScore(query, accessor(item));
    if (s !== -Infinity) scored.push({ item, score: s });
  }

  scored.sort((a, b) => b.score - a.score);
  const out = scored.map((r) => r.item);
  return typeof options.limit === "number" ? out.slice(0, options.limit) : out;
}
