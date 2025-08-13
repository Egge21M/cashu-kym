import type { AuditorEntry } from "./auditor";
import type { AggregatedMintRecommendation } from "./nostr";
import { fuzzySearch } from "./search";

type DiscoveredMint = AggregatedMintRecommendation & {
  url: string;
  auditorData: AuditorEntry;
};

export class SearchResult {
  private readonly _results: DiscoveredMint[];
  private readonly _resultMap: Map<string, DiscoveredMint>;

  constructor(results: DiscoveredMint[]) {
    this._results = results;
    const map = new Map<string, DiscoveredMint>();
    results.forEach((r) => map.set(r.url, r));
    this._resultMap = map;
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
