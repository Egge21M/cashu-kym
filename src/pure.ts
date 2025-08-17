import { AuditorSerive } from "./auditor";
import { NostrRecommendationsProvider } from "./nostr";
import { SearchResult } from "./result";
import type { Nip87Fetcher } from "./types";
import type { Logger } from "./logger";

type PureKYMConfig = {
  auditorBaseUrl: string;
  nip87Fetcher: Nip87Fetcher;
  logger?: Logger;
};

export class KYMHandler {
  private readonly auditorService: AuditorSerive;
  private readonly nip87Provider: NostrRecommendationsProvider;
  private readonly logger?: Logger;

  constructor(config: PureKYMConfig) {
    this.logger = config.logger;
    const child =
      typeof this.logger?.child === "function"
        ? this.logger.child({ module: "pure" })
        : this.logger;
    this.auditorService = new AuditorSerive(config.auditorBaseUrl, child);
    this.nip87Provider = new NostrRecommendationsProvider(
      config.nip87Fetcher,
      child,
    );
  }

  async discover(): Promise<SearchResult> {
    const log =
      typeof this.logger?.child === "function"
        ? this.logger.child({ module: "pure", op: "discover" })
        : this.logger;
    log?.info("Discover start");

    const nostrMap = await this.nip87Provider.discover().catch((e) => {
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
