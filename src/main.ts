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

  return new Promise<NostrEvent[]>((resolve, reject) => {
    let done = false;
    try {
      pool.subscribeEose(
        relays,
        { kinds: [38000] },
        {
          onevent: (event) => {
            events.push(event);
          },
          maxWait: timeout,
          onclose: () => {
            if (!done) {
              done = true;
              resolve(events);
            }
          },
        },
      );
    } catch (error) {
      if (!done) {
        done = true;
        const message = error instanceof Error ? error.message : String(error);
        reject(
          new Error(
            `Failed to subscribe to relays ${JSON.stringify(
              relays,
            )}: ${message}`,
          ),
        );
      }
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
    const nostrData = this.nostrProvider.discover().catch((e) => {
      const message = e instanceof Error ? e.message : String(e);
      throw new Error(`Could not get nostr recommendations: ${message}`);
    });
    const auditorData = this.auditorService.getAllMints();
    const bucket = await Promise.allSettled([nostrData, auditorData]);
    if (bucket[0].status === "rejected") {
      const reason = bucket[0].reason;
      const message = reason instanceof Error ? reason.message : String(reason);
      throw new Error(`Could not get nostr recommendations: ${message}`);
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
