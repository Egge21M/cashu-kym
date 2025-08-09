import { validateAndNormalizeUrl } from "./utils";

const test = {
  id: 1,
  url: "https://8333.space:3338",
  info: '{"name": "Cashu test mint", "pubkey": "03e3d23e1b66eadaf15ce0d640a908e8ba1984baed34ab98c547aab4cf4249440d", "version": "Nutshell/0.17.0", "description": "This mint is for testing and development purposes only. Do not use this mint as a default mint in your application! Please use it with caution and only with very small amounts. Your Cashu client could have bugs. Accidents and bugs can lead to loss of funds for which we are not responsible for.", "description_long": null, "contact": [], "motd": "This mint has rotated keysets. If you experience errors, it\'s probably because the wallet you\'re using doesn\'t properly support keyset rotations.", "icon_url": "https://raw.githubusercontent.com/cashubtc/cashu.me/refs/heads/main/public/icons/icon-256x256.png", "time": 1754738733, "nuts": {"4": {"methods": [{"method": "bolt11", "unit": "sat", "min_amount": 0, "max_amount": 100000, "description": true}], "disabled": false}, "5": {"methods": [{"method": "bolt11", "unit": "sat", "min_amount": 0, "max_amount": 50000}], "disabled": false}, "7": {"supported": true}, "8": {"supported": true}, "9": {"supported": true}, "10": {"supported": true}, "11": {"supported": true}, "12": {"supported": true}, "14": {"supported": true}, "20": {"supported": true}, "17": {"supported": [{"method": "bolt11", "unit": "sat", "commands": ["bolt11_melt_quote", "proof_state"]}]}, "19": {"cached_endpoints": [{"method": "POST", "path": "/v1/mint/bolt11"}, {"method": "POST", "path": "/v1/melt/bolt11"}, {"method": "POST", "path": "/v1/swap"}], "ttl": 604800}}}',
  name: "Cashu test mint",
  balance: 334,
  sum_donations: 4013,
  updated_at: "2025-08-09T11:25:42",
  next_update: "2025-04-28T19:27:57.728835",
  state: "OK",
  n_errors: 149,
  n_mints: 1309,
  n_melts: 1282,
};

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

type AuditorEntry = {
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
