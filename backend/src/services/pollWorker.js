// Strategy B: periodically sync Postgres -> ES. Only runs when
// SYNC_STRATEGY=polling (default is dual_write, like the reference).
import { config } from "../config.js";
import { orderRepo } from "../repos/orders.js";
import { indexOrdersBulk, reindexAll } from "./sync.js";

export function startPollWorker() {
  if (config.syncStrategy !== "polling") return;
  console.log("polling sync worker started (every 15s)");

  let watermark = new Date(Date.now() - 60_000);
  // full reindex on worker start so nothing is ever missed
  reindexAll()
    .then((n) => console.log(`poll worker initial reindex: ${n} orders`))
    .catch((e) => console.warn("poll worker initial reindex failed:", e.message));

  setInterval(async () => {
    try {
      // overlap: idempotent, so nothing is missed
      const ids = await orderRepo.listOrdersSince(new Date(watermark.getTime() - 30_000).toISOString());
      if (ids.length > 0) {
        const fresh = [];
        for (const id of ids) {
          const o = await orderRepo.getOrder(id);
          if (o) fresh.push(o);
        }
        await indexOrdersBulk(fresh);
        console.log(`poll worker synced ${fresh.length} orders`);
      }
      watermark = new Date();
    } catch (e) {
      console.warn("poll worker iteration failed:", e.message);
    }
  }, 15_000).unref();
}
