import { AuditorSerive } from "./auditor";
import { NostrRecommendationsProvider } from "./nostr";
import { SearchResult } from "./result";
import type { Nip87Fetcher } from "./types";

type PureKYMConfig = {
  auditorBaseUrl: string;
  nip87Fetcher: Nip87Fetcher;
};

export class KYMHandler {
  private readonly auditorService: AuditorSerive;
  private readonly nip87Provider: NostrRecommendationsProvider;

  constructor(config: PureKYMConfig) {
    this.auditorService = new AuditorSerive(config.auditorBaseUrl);
    this.nip87Provider = new NostrRecommendationsProvider(config.nip87Fetcher);
  }

  async discover(): Promise<SearchResult> {
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
    return new SearchResult(mergedData);
  }
}
