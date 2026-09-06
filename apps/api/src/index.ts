import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "./config/env.js";
import { connectToMongo } from "./db/mongo.js";
import { createApp } from "./app.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, "../../../.env") });

async function main(): Promise<void> {
  const env = loadEnv();
  await connectToMongo(env.MONGODB_URI);
  const app = createApp(env);

  app.listen(env.PORT, () => {
    console.log(`API listening on port ${env.PORT}`);
  });
}

main().catch((err) => {
  console.error("Failed to start API:", err);
  process.exit(1);
});
