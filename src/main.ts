import { SimplePool, type Event } from "nostr-tools";

const pool = new SimplePool();

type MintRecommendation = {
  score: number;
  comment: string;
};

type AggregatedMintRecommendation = {
  score: number;
  comments: string[];
};

function aggregateMintRecommendations(
  data: Map<string, MintRecommendation[]>,
): Map<string, AggregatedMintRecommendation> {
  const aggregatedMap = new Map<string, AggregatedMintRecommendation>();
  data.forEach((recommendations, url) => {
    let sumScore = 0;
    let count = 0;
    const comments: string[] = [];
    recommendations.forEach((r) => {
      sumScore += r.score;
      count++;
      const trimmedComment = r.comment.trim();
      if (trimmedComment) {
        comments.push(trimmedComment);
      }
      aggregatedMap.set(url, { score: sumScore / count, comments });
    });
  });
  return aggregatedMap;
}

function parseRecommendation(raw: string): MintRecommendation | null {
  const match = raw.match(/^\[(\d+)\/(\d+)\]\s*(.*)/);
  if (!match) {
    return null;
  }
  const score = parseInt(match[1], 10);
  const outOf = parseInt(match[2], 10);
  const comment = match[3];

  if (outOf !== 5) {
    return null;
  }
  return { score, comment };
}

function isCashuRecommendationEvent(e: Event) {
  const kindTag = e.tags.find((t) => t[0] === "k");
  if (!kindTag) {
    return false;
  }
  return kindTag[1] === "38172";
}

function extractMintUrlFromEvent(e: Event) {
  const urlTag = e.tags.find((t) => t[0] === "u");
  if (!urlTag) {
    return null;
  }
  return urlTag[1];
}

export async function discoverMints(relays: string[], timeout: number) {
  const start = performance.now();
  const recommendations = new Map<string, MintRecommendation[]>();

  pool.subscribeEose(
    relays,
    { kinds: [38000] },
    {
      onevent: (e) => {
        if (!isCashuRecommendationEvent(e)) {
          return;
        }
        const url = extractMintUrlFromEvent(e);
        if (!url) {
          return;
        }
        const recommendation = parseRecommendation(e.content);
        if (!recommendation) {
          return;
        }
        if (recommendations.has(url)) {
          recommendations.get(url)?.push(recommendation);
        } else {
          recommendations.set(url, [recommendation]);
        }
      },
      onclose: () => {
        console.log(aggregateMintRecommendations(recommendations));
      },
    },
  );
}

discoverMints(["wss://relay.damus.io"], 3000);
