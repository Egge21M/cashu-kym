import { validateAndNormalizeUrl } from "./utils";
import type { Logger } from "./logger";

type AuditorResponseEntry = {
  id: number;
  url: string;
  info: string;
  name: string;
  balance: number;
  sum_donations: number;
  updated_at: string;
  next_update: string;
  state: string;
  n_errors: number;
  n_mints: number;
  n_melts: number;
};

export type AuditorEntry = {
  url: string;
  name: string;
  updated_at: Date;
  state: string;
  errors: number;
  mints: number;
  melts: number;
};

function parseAuditorResponseEntry(
  entry: AuditorResponseEntry,
): AuditorEntry | null {
  const parsedUrl = validateAndNormalizeUrl(entry.url);
  if (!parsedUrl) {
    return null;
  }
  return {
    url: parsedUrl,
    name: entry.name,
    updated_at: new Date(entry.updated_at),
    state: entry.state,
    errors: entry.n_errors,
    mints: entry.n_mints,
    melts: entry.n_melts,
  };
}

export class AuditorSerive {
  private readonly baseUrl: string;
  private readonly logger?: Logger;

  constructor(baseUrl: string, logger?: Logger) {
    this.baseUrl = baseUrl;
    this.logger = logger;
  }

  async getAllMints(): Promise<Map<string, AuditorEntry>> {
    const log =
      typeof this.logger?.child === "function"
        ? this.logger.child({ module: "auditor", op: "getAllMints" })
        : this.logger;
    const url = `${this.baseUrl}/mints?limit=1000&skip=0`;
    log?.debug("Fetching auditor data", { url });
    const res = await fetch(url);
    const data = (await res.json()) as AuditorResponseEntry[];
    const auditorMap = new Map<string, AuditorEntry>();
    for (const d of data) {
      const parsed = parseAuditorResponseEntry(d);
      if (!parsed) {
        log?.warn("Skipping invalid auditor entry", { url: d.url });
        continue;
      }
      auditorMap.set(parsed.url, parsed);
    }
    log?.info("Auditor data parsed", { count: auditorMap.size });
    return auditorMap;
  }
}
