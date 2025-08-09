import { validateAndNormalizeUrl } from "./utils";

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

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  async getAllMints(): Promise<Map<string, AuditorEntry>> {
    const url = `${this.baseUrl}/mints?limit=1000&skip=0`;
    const res = await fetch(url);
    const data = (await res.json()) as AuditorResponseEntry[];
    const auditorMap = new Map<string, AuditorEntry>();
    for (const d of data) {
      const parsed = parseAuditorResponseEntry(d);
      if (!parsed) {
        continue;
      }
      auditorMap.set(parsed.url, parsed);
    }
    return auditorMap;
  }
}
