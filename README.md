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
import { discoverMints } from "cashu-kym";

const relays = ["wss://relay.damus.io"]; // any set of Nostr relays
const timeoutMs = 3000; // time window to collect recommendations

const mints = await discoverMints(relays, timeoutMs);
console.log(mints);
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

### Functions

- `discoverMints(relays: string[], timeoutMs?: number): Promise<DiscoveredMint[]>`
  - Queries the provided Nostr relays for recommendation events within `timeoutMs` (default: 3000 ms), aggregates scores per mint URL, and joins with auditor metadata.

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

## Environment

- Browser: works out of the box.
- Node (>= 18 recommended):
  - Ensure `fetch` is available (Node 18+ includes it; otherwise use `undici`).
  - Provide a WebSocket implementation for `nostr-tools`:

## Build from source

- Dev: `npm run dev`
- Build (library bundle): `npm run build`
  - Produces bundles in `dist/` (ESM and UMD), plus type declarations.

## Notes

- Recommendations are expected in the content format: `[<score>/5] optional comment`, e.g. `[4/5] good uptime`.
- Only `http`/`https` mint URLs are accepted; others are ignored.
- Auditor data is fetched from `https://api.audit.8333.space`.
