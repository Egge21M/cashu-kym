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
    const nostrData = this.nip87Provider.discover();
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
