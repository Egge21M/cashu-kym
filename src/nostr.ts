import { SimplePool } from "nostr-tools/pool";
import type { Event } from "nostr-tools";
import { validateAndNormalizeUrl } from "./utils";

const pool = new SimplePool();

type MintRecommendation = {
  score: number;
  comment: string;
};

type AggregatedMintRecommendation = {
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

function isCashuRecommendationEvent(e: Event): boolean {
  const kindTag = e.tags.find((t) => t[0] === "k");
  return Boolean(kindTag && kindTag[1] === "38172");
}

function extractMintUrlFromEvent(e: Event): string | null {
  const urlTag = e.tags.find((t) => t[0] === "u");
  return urlTag ? urlTag[1] : null;
}

export function discoverMintsOnNostr(
  relays: string[],
  timeoutMs: number = 3000,
): Promise<Map<string, AggregatedMintRecommendation>> {
  return new Promise((resolve) => {
    const recommendations = new Map<string, MintRecommendation[]>();
    let resolved = false;
    const resolveOnce = () => {
      if (resolved) return;
      resolved = true;
      resolve(aggregateMintRecommendations(recommendations));
    };

    const timerId = setTimeout(resolveOnce, Math.max(0, timeoutMs));

    pool.subscribe(
      relays,
      { kinds: [38000] },
      {
        onevent: (e) => {
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
        },
        onclose: () => {
          clearTimeout(timerId);
          resolveOnce();
        },
      },
    );
  });
}
