# cashu-kym

TypeScript library to discover and score Cashu mints by:

- Reading Nostr recommendations (kind 38000 events tagged with `k=38172` and `u=<mint-url>`)
- Aggregating community scores per mint URL
- Optionally enriching results with metadata from an external auditor API

Works in browsers; Node usage is possible with small polyfills.

## Installation

```bash
npm install cashu-kym
# or
pnpm add cashu-kym
# or
yarn add cashu-kym
```

## Quick start

```ts
import { KYMHandler } from "cashu-kym";

const handler = new KYMHandler({
  auditorBaseUrl: "https://api.audit.8333.space",
  relays: ["wss://relay.damus.io"],
  timeout: 3000, // time window to collect recommendations
});

const result = await handler.discover();
console.log(result.sortByScore());
```

Example result item shape:

```ts
{
  url: "https://mint.example/",
  score: 4.25, // average over all recommendations
  recommendations: [
    { score: 5, comment: "fast and reliable" },
    { score: 3, comment: "ok" }
  ],
  auditorData: {
    url: "https://mint.example/",
    name: "Example Mint",
    updated_at: new Date("2025-01-01T00:00:00Z"),
    state: "ok",
    errors: 0,
    mints: 123,
    melts: 45
  }
}
```

## API

### Classes

- `KYMHandler`
  - `constructor(config: { auditorBaseUrl: string; relays: string[]; timeout: number; })`
  - `discover(): Promise<SearchResult>`

- `SearchResult`
  - `results: DiscoveredMint[]` — raw merged results
  - `sortByScore(): DiscoveredMint[]` — highest score first
  - `sortByName(): DiscoveredMint[]` — alphabetical by auditor name
  - `search(query: string): DiscoveredMint[]` — fuzzy search by URL

### Types (shape)

```ts
// Nostr recommendation
export type MintRecommendation = {
  score: number; // 0..5
  comment: string;
};

// Aggregated Nostr data per mint URL
export type AggregatedMintRecommendation = {
  score: number; // average of all recommendations
  recommendations: MintRecommendation[];
};

// Auditor API metadata
export type AuditorEntry = {
  url: string;
  name: string;
  updated_at: Date;
  state: string;
  errors: number;
  mints: number;
  melts: number;
};

// Final merged shape returned by discoverMints
export type DiscoveredMint = AggregatedMintRecommendation & {
  url: string;
  auditorData: AuditorEntry;
};
```

## Dependency injection (pure build)

If you want to provide your own Nostr or networking implementations (e.g., in non-browser environments), use the "pure" entry that accepts injected dependencies.

```ts
import { KYMHandler } from "cashu-kym/pure";

// Provide an object with a discover() method that returns
// Promise<Map<string, { score: number; recommendations: { score: number; comment: string }[] }>>
const nip87Provider = {
  async discover() {
    // Implement: fetch and aggregate recommendations from your relays
    return new Map();
  },
};

const handler = new KYMHandler({
  auditorBaseUrl: "https://api.audit.8333.space",
  nip87Provider,
});

const result = await handler.discover();
```

Notes:

- The default `cashu-kym` entry includes a Nostr implementation using `nostr-tools` and `fetch`.
- The `cashu-kym/pure` entry does not include Nostr plumbing; you inject a compatible provider.

## Environment

- Browser: works out of the box.
- Node (>= 18 recommended):
  - Ensure `fetch` is available (Node 18+ includes it; otherwise use `undici`).
  - Provide a WebSocket implementation for `nostr-tools` if you use the default entry.

## Build from source

- Dev: `npm run dev`
- Build (library bundle): `npm run build`
  - Produces bundles in `dist/` for `main/` and `pure/` (ESM and CJS), plus rolled type declarations per entry.

## Notes

- Recommendations are expected in the content format: `[<score>/5] optional comment`, e.g. `[4/5] good uptime`.
- Only `http`/`https` mint URLs are accepted; others are ignored.
- Auditor data is fetched from `https://api.audit.8333.space`.
