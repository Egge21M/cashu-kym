import { AuditorSerive } from "./auditor";
import type { NostrRecommendationsProvider } from "./nostr";
import { SearchResult } from "./result";

type PureKYMConfig = {
  auditorBaseUrl: string;
  nip87Provider: NostrRecommendationsProvider;
};

export class KYMHandler {
  private readonly auditorService: AuditorSerive;
  private readonly nip87Provider: NostrRecommendationsProvider;

  constructor(config: PureKYMConfig) {
    this.auditorService = new AuditorSerive(config.auditorBaseUrl);
    this.nip87Provider = config.nip87Provider;
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
