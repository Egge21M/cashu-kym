import { AuditorSerive, type AuditorEntry } from "./auditor";
import {
  discoverMintsOnNostr,
  type AggregatedMintRecommendation,
} from "./nostr";

const auditor = new AuditorSerive("https://api.audit.8333.space");

type DiscoveredMint = AggregatedMintRecommendation & {
  url: string;
  auditorData: AuditorEntry;
};

export async function discoverMints(
  relays: string[],
  timeout: number,
): Promise<DiscoveredMint[]> {
  const nostrData = await discoverMintsOnNostr(relays, timeout);
  const auditorData = await auditor.getAllMints();
  const mergedData: any[] = [];

  nostrData.forEach((data, url) => {
    const auditor = auditorData.get(url) || {};
    mergedData.push({ ...data, url, auditorData: auditor });
  });
  return mergedData;
}
