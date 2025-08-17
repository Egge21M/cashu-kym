import type { Logger } from "./logger";

type RetryConfig = {
  retries: number;
  backoffBaseMs: number;
  backoffCapMs: number;
};

export type RequestHandlerOptions = {
  maxConcurrency?: number;
  maxConcurrencyPerOrigin?: number;
  defaultTimeoutMs?: number;
  retry?: Partial<RetryConfig>;
  logger?: Logger;
};

export type FetchOptions = {
  timeoutMs?: number;
  retries?: number;
  idempotent?: boolean;
  dedupeKey?: string | null;
};

class Semaphore {
  private available: number;
  private readonly waiters: Array<() => void> = [];

  constructor(initialPermits: number) {
    this.available = Math.max(0, Math.floor(initialPermits));
  }

  async acquire(): Promise<() => void> {
    if (this.available > 0) {
      this.available -= 1;
      return () => this.release();
    }
    return new Promise<() => void>((resolve) => {
      this.waiters.push(() => resolve(() => this.release()));
    });
  }

  private release(): void {
    const next = this.waiters.shift();
    if (next) {
      next();
      return;
    }
    this.available += 1;
  }
}

function resolveUrl(input: RequestInfo | URL, base?: string): URL {
  if (input instanceof URL) return input;
  if (typeof input === "string") {
    try {
      return base ? new URL(input, base) : new URL(input);
    } catch {
      if (
        typeof window !== "undefined" &&
        typeof window.location !== "undefined"
      ) {
        return new URL(input, window.location.href);
      }
      throw new Error(`Invalid URL: ${input}`);
    }
  }
  // Request object
  const url = (input as Request).url;
  return resolveUrl(url, base);
}

function parseRetryAfter(retryAfter: string | null): number | null {
  if (!retryAfter) return null;
  const asInt = parseInt(retryAfter, 10);
  if (!Number.isNaN(asInt)) return Math.max(0, asInt * 1000);
  const when = Date.parse(retryAfter);
  if (!Number.isNaN(when)) {
    const ms = when - Date.now();
    return ms > 0 ? ms : 0;
  }
  return null;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const id = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);

    const onAbort = () => {
      cleanup();
      reject(signal?.reason ?? new DOMException("Aborted", "AbortError"));
    };

    const cleanup = () => {
      clearTimeout(id);
      if (signal) signal.removeEventListener("abort", onAbort);
    };

    if (signal) signal.addEventListener("abort", onAbort);
  });
}

function createTimeoutSignal(
  timeoutMs: number | undefined,
): AbortController | null {
  if (!timeoutMs || timeoutMs <= 0) return null;
  const controller = new AbortController();
  const id = setTimeout(
    () => controller.abort(new DOMException("Timeout", "TimeoutError")),
    timeoutMs,
  );
  controller.signal.addEventListener("abort", () => clearTimeout(id), {
    once: true,
  });
  return controller;
}

function combineSignals(
  signals: Array<AbortSignal | undefined>,
): AbortSignal | undefined {
  const valid = signals.filter((s): s is AbortSignal => !!s);
  if (valid.length === 0) return undefined;
  // Prefer AbortSignal.any when available
  const anyFn: ((signals: AbortSignal[]) => AbortSignal) | undefined = (
    AbortSignal as unknown as { any?: typeof AbortSignal.any }
  ).any;
  if (typeof anyFn === "function") {
    return anyFn(valid);
  }
  const controller = new AbortController();
  const abort = (evt: Event) => controller.abort((evt as any).target?.reason);
  for (const s of valid) {
    if (s.aborted) {
      controller.abort(s.reason);
      break;
    }
    s.addEventListener("abort", abort, { once: true });
  }
  return controller.signal;
}

export class RequestHandler {
  private readonly globalLimiter: Semaphore;
  private readonly perOriginLimiters: Map<string, Semaphore> = new Map();
  private readonly maxPerOrigin: number;
  private readonly defaultTimeoutMs: number;
  private readonly retry: RetryConfig;
  private readonly logger?: Logger;
  private readonly inflightJson: Map<string, Promise<unknown>> = new Map();

  constructor(options: RequestHandlerOptions = {}) {
    const maxConcurrency = Math.max(
      1,
      Math.floor(options.maxConcurrency ?? 32),
    );
    this.globalLimiter = new Semaphore(maxConcurrency);
    this.maxPerOrigin = Math.max(
      1,
      Math.floor(options.maxConcurrencyPerOrigin ?? 8),
    );
    this.defaultTimeoutMs = Math.max(
      0,
      Math.floor(options.defaultTimeoutMs ?? 15_000),
    );
    const defaults: RetryConfig = {
      retries: 2,
      backoffBaseMs: 250,
      backoffCapMs: 5_000,
    };
    this.retry = { ...defaults, ...(options.retry ?? {}) } as RetryConfig;
    this.logger = options.logger;
  }

  async fetchResponse(
    input: RequestInfo | URL,
    init?: RequestInit,
    options: FetchOptions = {},
  ): Promise<Response> {
    const url = resolveUrl(input);
    const method = (init?.method ?? "GET").toUpperCase();
    const origin = url.origin;

    const scheduledAt = Date.now();
    this.logger?.debug("Request scheduled", {
      url: url.toString(),
      method,
      origin,
      dedupeKey: options.dedupeKey ?? null,
    });

    const globalAcquireStart = Date.now();
    const releaseGlobal = await this.globalLimiter.acquire();
    const acquiredGlobalAt = Date.now();
    const waitGlobalMs = acquiredGlobalAt - globalAcquireStart;

    const perOriginLimiter = this.getPerOriginLimiter(origin);
    const originAcquireStart = Date.now();
    const releaseOrigin = await perOriginLimiter.acquire();
    const acquiredOriginAt = Date.now();
    const waitOriginMs = acquiredOriginAt - originAcquireStart;

    const startedAt = acquiredOriginAt;
    const queuedWaitMs = startedAt - scheduledAt;

    this.logger?.debug("Request started", {
      url: url.toString(),
      method,
      origin,
      waitGlobalMs,
      waitOriginMs,
      queuedWaitMs,
    });

    let response: Response | undefined;
    try {
      response = await this.executeWithRetry(input, init, options);
      return response;
    } finally {
      const finishedAt = Date.now();
      const totalMs = finishedAt - scheduledAt;
      const executionMs = finishedAt - startedAt;
      this.logger?.debug("Request finished", {
        url: url.toString(),
        method,
        origin,
        status: response?.status ?? undefined,
        ok: response?.ok ?? false,
        executionMs,
        totalMs,
        queuedWaitMs,
      });
      releaseOrigin();
      releaseGlobal();
    }
  }

  async fetchJson<T>(
    input: RequestInfo | URL,
    init?: RequestInit,
    options: FetchOptions = {},
  ): Promise<T> {
    const url = resolveUrl(input);
    const key =
      options.dedupeKey === undefined
        ? this.defaultDedupeKey(url, init)
        : options.dedupeKey;
    if (key) {
      const existing = this.inflightJson.get(key);
      if (existing) return existing as Promise<T>;
    }

    const run = async () => {
      const resp = await this.fetchResponse(input, init, options);
      const contentType = resp.headers.get("content-type") || "";
      const isJson = contentType.includes("application/json");
      if (!resp.ok) {
        const bodyText = isJson
          ? JSON.stringify(await resp.json().catch(() => ({})))
          : await resp.text().catch(() => "");
        this.logger?.warn("HTTP error", {
          status: resp.status,
          url: resp.url,
          body: bodyText.slice(0, 512),
        });
        throw new Error(`HTTP ${resp.status} for ${resp.url}`);
      }
      return (isJson ? await resp.json() : await resp.text()) as unknown as T;
    };

    if (!key) return run();
    const promise = run();
    this.inflightJson.set(key, promise);
    try {
      const value = await promise;
      return value as T;
    } finally {
      this.inflightJson.delete(key);
    }
  }

  private getPerOriginLimiter(origin: string): Semaphore {
    let limiter = this.perOriginLimiters.get(origin);
    if (!limiter) {
      limiter = new Semaphore(this.maxPerOrigin);
      this.perOriginLimiters.set(origin, limiter);
    }
    return limiter;
  }

  private async executeWithRetry(
    input: RequestInfo | URL,
    init: RequestInit = {},
    options: FetchOptions,
  ): Promise<Response> {
    const method = (init.method ?? "GET").toUpperCase();
    const idempotent = options.idempotent ?? [
      "GET",
      "HEAD",
      "OPTIONS",
      "PUT",
      "DELETE",
    ]; // PUT/DELETE are typically idempotent
    const isIdempotent = Array.isArray(idempotent)
      ? idempotent.includes(method)
      : Boolean(idempotent);
    const maxAttempts = 1 + Math.max(0, options.retries ?? this.retry.retries);

    const timeoutController = createTimeoutSignal(
      options.timeoutMs ?? this.defaultTimeoutMs,
    );
    const signal = combineSignals([
      (init.signal ?? undefined) as AbortSignal | undefined,
      timeoutController?.signal,
    ]);
    const baseInit: RequestInit = { ...init, signal };

    let attempt = 0;
    let lastError: unknown;
    while (attempt < maxAttempts) {
      const startedAt = Date.now();
      try {
        const response = await fetch(input as RequestInfo, baseInit);
        if (response.ok) return response;

        const status = response.status;
        // Retry on 429/408 and 5xx for idempotent requests
        const shouldRetry =
          isIdempotent &&
          (status === 429 || status === 408 || (status >= 500 && status < 600));
        if (!shouldRetry || attempt === maxAttempts - 1) return response; // let caller handle non-ok

        const retryAfterHeader = response.headers.get("retry-after");
        const retryAfterMs = parseRetryAfter(retryAfterHeader);
        const backoffMs = this.computeBackoffMs(attempt);
        const delayMs = retryAfterMs != null ? retryAfterMs : backoffMs;
        this.logger?.debug("Retrying HTTP response", {
          attempt,
          status,
          delayMs,
        });
        await sleep(delayMs, signal);
      } catch (err) {
        lastError = err;
        const isAbort =
          (err as any)?.name === "AbortError" ||
          (err as any)?.name === "TimeoutError";
        if (isAbort) throw err;
        if (!isIdempotent || attempt === maxAttempts - 1) throw err;
        const delayMs = this.computeBackoffMs(attempt);
        this.logger?.debug("Retrying network error", {
          attempt,
          delayMs,
          error: String(err),
        });
        await sleep(delayMs, signal);
      } finally {
        attempt += 1;
        const elapsedMs = Date.now() - startedAt;
        this.logger?.debug("Request attempt finished", { attempt, elapsedMs });
      }
    }
    // Should not reach here; loop either returned or threw
    // Keep TypeScript happy
    throw lastError instanceof Error ? lastError : new Error("Request failed");
  }

  private computeBackoffMs(attempt: number): number {
    const base = Math.max(1, this.retry.backoffBaseMs);
    const cap = Math.max(base, this.retry.backoffCapMs);
    const exp = Math.min(cap, base * Math.pow(2, attempt));
    const jitter = exp * (0.5 + Math.random());
    return Math.min(cap, Math.floor(jitter));
  }

  private defaultDedupeKey(url: URL, init?: RequestInit): string | null {
    const method = (init?.method ?? "GET").toUpperCase();
    // Only dedupe idempotent safe requests by default
    if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS")
      return null;
    const headers = init?.headers ? JSON.stringify(init.headers) : "";
    const body = typeof init?.body === "string" ? init?.body : "";
    return `${method} ${url.toString()} ${headers} ${body}`;
  }
}
