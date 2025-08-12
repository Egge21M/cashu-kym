export type NostrEvent = {
  created_at: number;
  content: string;
  sig: string;
  id: string;
  tags: string[][];
  pubkey: string;
  kind: number;
};

export type Nip87Fetcher = () => Promise<NostrEvent[]>;
