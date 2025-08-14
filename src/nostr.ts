import { validateAndNormalizeUrl } from "./utils";
import type { Nip87Fetcher, NostrEvent } from "./types";
import type { Logger } from "./logger";

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
  private readonly logger?: Logger;

  constructor(fetcher: Nip87Fetcher, logger?: Logger) {
    this.nip87Fetcher = fetcher;
    this.logger = logger;
  }

  async discover(): Promise<Map<string, AggregatedMintRecommendation>> {
    const log =
      typeof this.logger?.child === "function"
        ? this.logger.child({ module: "nostr", op: "discover" })
        : this.logger;
    try {
      log?.debug("Fetching NIP-87 events");
      const events = await this.nip87Fetcher();
      log?.debug("Fetched events", { count: events.length });
      const recommendations = new Map<string, MintRecommendation[]>();
      events.forEach((e) => {
        if (!isCashuRecommendationEvent(e)) return;
        const normalizedUrl = validateAndNormalizeUrl(
          extractMintUrlFromEvent(e),
        );
        if (!normalizedUrl) return;
        const recommendation = parseRecommendation(e.content);
        if (!recommendation) return;
        const existing = recommendations.get(normalizedUrl);
        if (existing) existing.push(recommendation);
        else recommendations.set(normalizedUrl, [recommendation]);
      });
      log?.debug("Aggregated recommendations", {
        mints: recommendations.size,
      });
      return aggregateMintRecommendations(recommendations);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log?.error("Nostr discovery failed", { error: message });
      throw new Error(`Nostr discovery failed: ${message}`);
    }
  }
}
