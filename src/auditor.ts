import { validateAndNormalizeUrl } from "./utils";
import type { Logger } from "./logger";
import { RequestHandler } from "./request";

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
  id?: number;
  url: string;
  name: string;
  updated_at: Date;
  state: string;
  errors: number;
  mints: number;
  melts: number;
  averageSwapTimeMs?: number;
  swapCount?: number;
};

function parseAuditorResponseEntry(
  entry: AuditorResponseEntry,
): AuditorEntry | null {
  const parsedUrl = validateAndNormalizeUrl(entry.url);
  if (!parsedUrl) {
    return null;
  }
  return {
    id: entry.id,
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
  private readonly requester: RequestHandler;

  constructor(baseUrl: string, logger?: Logger, requester?: RequestHandler) {
    this.baseUrl = baseUrl;
    this.logger = logger;
    this.requester = requester ?? new RequestHandler({ logger });
  }

  async getAllMints(
    options: {
      urls?: string[];
      includeSwapStats?: boolean;
      swapOptions?: { received?: boolean; limit?: number; skip?: number };
    } = {},
  ): Promise<Map<string, AuditorEntry>> {
    const log =
      typeof this.logger?.child === "function"
        ? this.logger.child({ module: "auditor", op: "getAllMints" })
        : this.logger;
    const url = `${this.baseUrl}/mints?limit=1000&skip=0`;
    log?.debug("Fetching auditor data", { url });
    const data = await this.requester.fetchJson<AuditorResponseEntry[]>(
      url,
      undefined,
      {
        idempotent: true,
        dedupeKey: url,
      },
    );
    const allMap = new Map<string, AuditorEntry>();
    for (const d of data) {
      const parsed = parseAuditorResponseEntry(d);
      if (!parsed) {
        log?.warn("Skipping invalid auditor entry", { url: d.url });
        continue;
      }
      allMap.set(parsed.url, parsed);
    }

    let resultMap: Map<string, AuditorEntry> = allMap;
    const filterUrls =
      Array.isArray(options.urls) && options.urls.length > 0
        ? new Set(options.urls)
        : null;
    if (filterUrls) {
      resultMap = new Map<string, AuditorEntry>();
      for (const urlStr of filterUrls) {
        const entry = allMap.get(urlStr);
        if (entry) resultMap.set(urlStr, entry);
      }
    }

    if (options.includeSwapStats && resultMap.size > 0) {
      const settled = await Promise.allSettled(
        Array.from(resultMap.values()).map(async (entry) => {
          if (typeof entry.id !== "number") return;
          const stats = await this.getMintSwapStats(
            entry.id,
            options.swapOptions,
          );
          entry.averageSwapTimeMs = stats.averageTimeMs;
          entry.swapCount = stats.count;
        }),
      );
      const failed = settled.filter((r) => r.status === "rejected").length;
      if (failed > 0) {
        log?.warn("Failed to fetch some swap stats", {
          failed,
          total: resultMap.size,
        });
      }
    }

    log?.info("Auditor data parsed", { count: resultMap.size });
    return resultMap;
  }

  async getMintSwapStats(
    mintId: number,
    options: { received?: boolean; limit?: number; skip?: number } = {},
  ): Promise<{ averageTimeMs: number; count: number }> {
    const log =
      typeof this.logger?.child === "function"
        ? this.logger.child({ module: "auditor", op: "getMintSwapStats" })
        : this.logger;

    const limit = Math.max(
      1,
      Math.min(1000, Math.floor(options.limit ?? 1000)),
    );
    const skip = Math.max(0, Math.floor(options.skip ?? 0));
    const params = new URLSearchParams();
    params.set("limit", String(limit));
    params.set("skip", String(skip));
    if (typeof options.received === "boolean") {
      params.set("received", String(options.received));
    }
    const url = `${this.baseUrl}/swaps/mint/${mintId}?${params.toString()}`;
    log?.debug("Fetching mint swaps", {
      mintId,
      limit,
      skip,
      received: options.received ?? null,
    });

    type SwapEventRead = {
      id: number;
      from_id: number;
      to_id: number;
      from_url: string;
      to_url: string;
      amount: number;
      fee: number;
      created_at: string;
      time_taken: number;
      state: string;
      error?: string;
    };

    const swaps = await this.requester.fetchJson<SwapEventRead[]>(
      url,
      undefined,
      {
        idempotent: true,
        dedupeKey: url,
      },
    );

    const validTimes = swaps
      .map((s) => s.time_taken)
      .filter((t) => Number.isFinite(t) && t >= 0) as number[];
    const count = validTimes.length;
    const averageTimeMs = count
      ? Math.round(validTimes.reduce((sum, t) => sum + t, 0) / count)
      : 0;
    log?.info("Computed mint swap stats", { mintId, count, averageTimeMs });
    return { averageTimeMs, count };
  }

  async getMintByUrl(
    rawUrl: string,
  ): Promise<{ id: number; entry: AuditorEntry } | null> {
    const log =
      typeof this.logger?.child === "function"
        ? this.logger.child({ module: "auditor", op: "getMintByUrl" })
        : this.logger;
    const params = new URLSearchParams();
    params.set("url", rawUrl);
    const url = `${this.baseUrl}/mints/url?${params.toString()}`;
    log?.debug("Fetching auditor mint by URL", { url: rawUrl });

    // Use fetchResponse to handle 404 gracefully
    const resp = await this.requester.fetchResponse(url, undefined, {
      idempotent: true,
      dedupeKey: url,
    });
    if (resp.status === 404) {
      log?.debug("Mint not found by URL", { url: rawUrl });
      return null;
    }
    if (!resp.ok) {
      const bodyText = await resp.text().catch(() => "");
      throw new Error(
        `Failed to fetch mint by URL (${rawUrl}): HTTP ${resp.status} ${bodyText}`,
      );
    }
    type MintRead = {
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
    const json = (await resp.json()) as MintRead;
    const entry = parseAuditorResponseEntry(json);
    if (!entry) return null;
    log?.debug("Mint fetched by URL", { id: json.id, url: entry.url });
    return { id: json.id, entry };
  }
}
