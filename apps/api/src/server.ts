import { createPrivyAuthenticator } from "./auth.js";
import { buildApp } from "./app.js";
import { loadApiConfig } from "./config.js";
import { connectDatabase } from "./db/client.js";
import { KeptPersistenceService } from "./persistence/index.js";

const config = loadApiConfig();
const database = connectDatabase(config.databaseUrl);
const app = buildApp({
  authenticate: createPrivyAuthenticator({
    appId: config.privyAppId,
    verificationKey: config.privyJwtVerificationKey,
  }),
  persistence: new KeptPersistenceService(database.db),
}, { enableLogging: true, webOrigin: config.webOrigin });

const close = async () => {
  await app.close();
  await database.close();
};

process.once("SIGINT", () => void close());
process.once("SIGTERM", () => void close());

try {
  await app.listen({ host: "0.0.0.0", port: config.port });
} catch (error) {
  app.log.error(error, "API startup failed");
  await close();
  process.exitCode = 1;
}
