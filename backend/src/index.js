import express from "express";
import cors from "cors";
import { config } from "./config.js";
import { mongoClient, pgPool } from "./db.js";
import { ensureIndex } from "./services/sync.js";
import { startPollWorker } from "./services/pollWorker.js";
import { productsRouter } from "./routes/products.js";
import { ordersRouter } from "./routes/orders.js";
import { searchRouter } from "./routes/search.js";
import { knowledgeRouter } from "./routes/knowledge.js";
import { errorHandler } from "./errors.js";

const app = express();
app.use(cors({ origin: config.corsOrigins, credentials: true }));
app.use(express.json());

app.get("/health", (_req, res) => res.json({ status: "ok" }));
app.use("/api/products", productsRouter);
app.use("/api/orders", ordersRouter);
app.use("/api/search", searchRouter);
app.use("/api/knowledge-bytes", knowledgeRouter);
app.use(errorHandler);

async function main() {
  await mongoClient.connect();
  await pgPool.query("SELECT 1"); // fail fast if Postgres is down
  await ensureIndex(); // never fails boot if ES is napping
  startPollWorker();
  app.listen(config.port, "0.0.0.0", () => {
    console.log(`Y3L Supply API (node) listening on :${config.port}`);
  });
}

main().catch((e) => {
  console.error("startup failed:", e);
  process.exit(1);
});
