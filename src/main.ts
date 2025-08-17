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

    const nostrMap = await this.nostrProvider.discover().catch((e) => {
      const message = e instanceof Error ? e.message : String(e);
      throw new Error(`Could not get nostr recommendations: ${message}`);
    });
    const urls = Array.from(nostrMap.keys());
    log?.info("Nostr recommendations fetched", { urls: urls.length });

    const auditorEntries = await this.auditorService.getAllMints({
      urls,
      includeSwapStats: true,
      swapOptions: { limit: 1000 },
    });

    const mergedData: any[] = [];
    nostrMap.forEach((data, url) => {
      const auditor = auditorEntries.get(url) || {};
      mergedData.push({ ...data, url, auditorData: auditor });
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
