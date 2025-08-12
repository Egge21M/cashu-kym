import { SimplePool, type NostrEvent } from "nostr-tools";
import { AuditorSerive } from "./auditor";
import { NostrRecommendationsProvider } from "./nostr";
import { SearchResult } from "./result";

type KYMConfig = {
  auditorBaseUrl: string;
  relays: string[];
  timeout: number;
};

async function fetchNip87Events(
  relays: string[],
  timeout?: number,
): Promise<NostrEvent[]> {
  const pool = new SimplePool();
  const events: NostrEvent[] = [];

  return new Promise<NostrEvent[]>((resolve) => {
    let resolved = false;

    const subscription = pool.subscribeEose(
      relays,
      { kinds: [38000] },
      {
        onevent: (event) => {
          events.push(event);
        },
        maxWait: timeout,
        onclose: () => {
          if (!resolved) {
            resolved = true;
            resolve(events);
          }
        },
      },
    );

    if (timeout) {
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          subscription.close();
          resolve(events);
        }
      }, timeout + 500);
    }
  });
}

export class KYMHandler {
  private readonly auditorService: AuditorSerive;
  private readonly nostrProvider: NostrRecommendationsProvider;

  constructor(config: KYMConfig) {
    this.auditorService = new AuditorSerive(config.auditorBaseUrl);
    this.nostrProvider = new NostrRecommendationsProvider(() =>
      fetchNip87Events(config.relays, config.timeout),
    );
  }

  async discover(): Promise<SearchResult> {
    const nostrData = this.nostrProvider.discover();
    const auditorData = this.auditorService.getAllMints();
    const bucket = await Promise.allSettled([nostrData, auditorData]);
    if (bucket[0].status === "rejected") {
      throw new Error("Could not get nostr recommendations");
    }
    const mergedData: any[] = [];

    bucket[0].value.forEach((data, url) => {
      if (bucket[1].status === "fulfilled") {
        const auditor = bucket[1].value.get(url) || {};
        mergedData.push({ ...data, url, auditorData: auditor });
      } else {
        mergedData.push({ ...data, url, auditorData: {} });
      }
    });
    return new SearchResult(mergedData);
  }
}
