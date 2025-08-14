import { SimplePool, type NostrEvent } from "nostr-tools";
import { AuditorSerive } from "./auditor";
import { NostrRecommendationsProvider } from "./nostr";
import { SearchResult } from "./result";
import type { Logger } from "./logger";

type KYMConfig = {
  auditorBaseUrl: string;
  relays: string[];
  timeout: number;
  logger?: Logger;
};

async function fetchNip87Events(
  relays: string[],
  timeout: number | undefined,
  logger: Logger | undefined,
): Promise<NostrEvent[]> {
  const log =
    typeof logger?.child === "function"
      ? logger.child({ module: "main", op: "fetchNip87Events" })
      : logger;
  const pool = new SimplePool();
  const events: NostrEvent[] = [];

  return new Promise<NostrEvent[]>((resolve, reject) => {
    let done = false;
    log?.info("Subscribing to NIP-87 relays", { relays, timeout });
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
              log?.info("Relay subscription closed", {
                relays,
                count: events.length,
              });
              resolve(events);
            }
          },
        },
      );
    } catch (error) {
      if (!done) {
        done = true;
        const message = error instanceof Error ? error.message : String(error);
        log?.error("Relay subscription failed", {
          relays,
          error: message,
        });
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
  private readonly logger?: Logger;

  constructor(config: KYMConfig) {
    this.logger = config.logger;
    const child =
      typeof this.logger?.child === "function"
        ? this.logger.child({ module: "main" })
        : this.logger;
    this.auditorService = new AuditorSerive(config.auditorBaseUrl, child);
    this.nostrProvider = new NostrRecommendationsProvider(
      () => fetchNip87Events(config.relays, config.timeout, child),
      child,
    );
  }

  async discover(): Promise<SearchResult> {
    const log =
      typeof this.logger?.child === "function"
        ? this.logger.child({ module: "main", op: "discover" })
        : this.logger;
    log?.info("Discover start");
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
    log?.info("Discover merged results", { count: mergedData.length });
    return new SearchResult(mergedData);
  }
}

export {
  type Logger,
  type LogLevel,
  ConsoleLogger,
  NullLogger,
} from "./logger";
