import { AuditorSerive } from "./auditor";
import { discoverMintsOnNostr } from "./nostr";

const auditor = new AuditorSerive("https://api.audit.8333.space");

export async function discoverMints(relays: string[], timeout: number) {
  const nostrData = await discoverMintsOnNostr(relays, timeout);
  const auditorData = await auditor.getAllMints();
  const mergedData: any[] = [];

  nostrData.forEach((data, url) => {
    const auditor = auditorData.get(url) || {};
    mergedData.push({ ...data, url, auditorData: auditor });
  });
}
