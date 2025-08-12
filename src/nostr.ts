import { validateAndNormalizeUrl } from "./utils";
import type { Nip87Fetcher, NostrEvent } from "./types";

export type MintRecommendation = {
  score: number;
  comment: string;
};

export type AggregatedMintRecommendation = {
  score: number;
  recommendations: MintRecommendation[];
};

function aggregateMintRecommendations(
  data: Map<string, MintRecommendation[]>,
): Map<string, AggregatedMintRecommendation> {
  const aggregatedMap = new Map<string, AggregatedMintRecommendation>();
  data.forEach((recommendations, url) => {
    if (!recommendations.length) return;
    const sumScore = recommendations.reduce((sum, r) => sum + r.score, 0);
    const avg = Number((sumScore / recommendations.length).toFixed(2));
    aggregatedMap.set(url, {
      score: avg,
      recommendations: recommendations.slice(),
    });
  });
  return aggregatedMap;
}

function parseRecommendation(raw: string): MintRecommendation | null {
  const match = raw.match(/^\s*\[(\d+)\/(\d+)\]\s*(.*)$/);
  if (!match) return null;
  const score = parseInt(match[1], 10);
  const outOf = parseInt(match[2], 10);
  const comment = match[3] ?? "";
  if (!Number.isFinite(score) || score < 0 || score > 5) return null;
  if (outOf !== 5) return null;
  return { score, comment };
}

function isCashuRecommendationEvent(e: NostrEvent): boolean {
  const kindTag = e.tags.find((t) => t[0] === "k");
  return Boolean(kindTag && kindTag[1] === "38172");
}

function extractMintUrlFromEvent(e: NostrEvent): string | null {
  const urlTag = e.tags.find((t) => t[0] === "u");
  return urlTag ? urlTag[1] : null;
}

export class NostrRecommendationsProvider {
  private readonly nip87Fetcher: Nip87Fetcher;

  constructor(fetcher: Nip87Fetcher) {
    this.nip87Fetcher = fetcher;
  }

  async discover(): Promise<Map<string, AggregatedMintRecommendation>> {
    const events = await this.nip87Fetcher();
    events.forEach((e) => {
      if (!isCashuRecommendationEvent(e)) return;
      const normalizedUrl = validateAndNormalizeUrl(extractMintUrlFromEvent(e));
      if (!normalizedUrl) return;
      const recommendation = parseRecommendation(e.content);
      if (!recommendation) return;
      const existing = recommendations.get(normalizedUrl);
      if (existing) existing.push(recommendation);
      else recommendations.set(normalizedUrl, [recommendation]);
    });
    const recommendations = new Map<string, MintRecommendation[]>();
    return aggregateMintRecommendations(recommendations);
  }
}
