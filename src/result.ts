import type { AuditorEntry } from "./auditor";
import type { AggregatedMintRecommendation } from "./nostr";
import { fuzzySearch } from "./search";

type DiscoveredMint = AggregatedMintRecommendation & {
  url: string;
  auditorData: AuditorEntry;
  speedIndex?: number;
};

export class SearchResult {
  private readonly _results: DiscoveredMint[];
  private readonly _resultMap: Map<string, DiscoveredMint>;

  constructor(results: DiscoveredMint[]) {
    this._results = results;
    const map = new Map<string, DiscoveredMint>();
    results.forEach((r) => map.set(r.url, r));
    this._resultMap = map;

    // Compute speed index (0..100) using IQR-based robust scaling on averageSwapTimeMs
    const times = this._results
      .map(
        (r) => (r?.auditorData as any)?.averageSwapTimeMs as number | undefined,
      )
      .filter(
        (v): v is number =>
          typeof v === "number" && Number.isFinite(v) && v >= 0,
      )
      .sort((a, b) => a - b);

    if (times.length > 0) {
      const quantile = (arr: number[], p: number): number => {
        if (arr.length === 1) return arr[0];
        const pos = (arr.length - 1) * p;
        const lower = Math.floor(pos);
        const upper = Math.ceil(pos);
        if (lower === upper) return arr[lower];
        const weight = pos - lower;
        return arr[lower] * (1 - weight) + arr[upper] * weight;
      };

      const q1 = quantile(times, 0.25);
      const q3 = quantile(times, 0.75);
      const iqr = Math.max(0, q3 - q1);
      let robustMin = Math.max(0, q1 - 1.5 * iqr);
      let robustMax = q3 + 1.5 * iqr;

      if (!(robustMax > robustMin)) {
        // Fallback to min/max when IQR is ~0; if still equal, treat all as equal speed
        robustMin = times[0];
        robustMax = times[times.length - 1];
      }

      // Anchor 100 at an assumed ideal of 2.5s, but if we observe faster than that,
      // self-adjust to the fastest observed time to avoid >100 values.
      const fastestObserved = times[0];
      const assumedIdealMs = 3500;
      const idealMs = Math.min(assumedIdealMs, fastestObserved);

      this._results.forEach((r) => {
        const t = (r?.auditorData as any)?.averageSwapTimeMs as
          | number
          | undefined;
        if (typeof t !== "number" || !Number.isFinite(t) || t < 0) return;
        // Degenerate case: every value is the same
        if (robustMax === robustMin) {
          r.speedIndex = 100;
          return;
        }
        // If everything is already at or faster than ideal, everyone is 100
        if (robustMax <= idealMs) {
          r.speedIndex = 100;
          return;
        }
        if (t <= idealMs) {
          r.speedIndex = 100;
          return;
        }
        if (t >= robustMax) {
          r.speedIndex = 0;
          return;
        }
        // Linearly map from [idealMs..robustMax] to [100..0]
        const speed = (100 * (robustMax - t)) / (robustMax - idealMs);
        r.speedIndex = Math.round(Math.max(0, Math.min(100, speed)));
      });
    }
  }

  get results() {
    return this._results;
  }

  sortByScore() {
    return [...this._results].sort((a, b) => b.score - a.score);
  }

  sortByName() {
    return [...this._results].sort((a, b) => {
      const nameA = a.auditorData?.name?.toLowerCase() ?? "";
      const nameB = b.auditorData?.name?.toLowerCase() ?? "";
      if (nameA < nameB) return -1;
      if (nameA > nameB) return 1;
      return 0;
    });
  }

  search(query: string) {
    return fuzzySearch(
      query,
      this._results.map((r) => r.url),
    ).map((url) => this._resultMap.get(url)!);
  }
}
