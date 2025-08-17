import { ConsoleLogger, KYMHandler } from "./main";

const handler = new KYMHandler({
  auditorBaseUrl: "https://api.audit.8333.space",
  relays: ["wss://relay.damus.io"],
  timeout: 3000,
  logger: new ConsoleLogger({ logLevel: "debug" }),
});

const result = await handler.discover();
console.log(result);
