// Order placement orchestration — the transactional write path.
// 1. Validate the user exists (Postgres).
// 2. Validate every line item against the LIVE MongoDB catalog (active products).
// 3. Snapshot title + unit price at order time.
// 4. Insert order + items inside ONE Postgres transaction (all-or-nothing).
// 5. Fire the ES sync trigger (dual-write now; the polling worker also picks it up).
import { orderRepo } from "../repos/orders.js";
import { productRepo } from "../repos/products.js";
import { indexOrder } from "./sync.js";
import { config } from "../config.js";
import { ApiError } from "../errors.js";

export async function placeOrder(userId, items) {
  const user = await orderRepo.getUser(userId);
  if (!user) throw new ApiError(400, `unknown user_id ${userId}`);
  if (!items || items.length === 0) throw new ApiError(400, "items must not be empty");
  for (const it of items) {
    if (!it.quantity || it.quantity <= 0) throw new ApiError(400, "quantity must be > 0");
  }

  const wanted = {};
  for (const it of items) wanted[it.product_id] = it.quantity;
  const found = await productRepo.getMany(Object.keys(wanted));

  const snapshots = [];
  for (const [pid, qty] of Object.entries(wanted)) {
    const p = found[pid];
    if (!p) throw new ApiError(400, `unknown product_id ${pid}`);
    if (!p.active) throw new ApiError(400, `product '${p.title}' is not active`);
    snapshots.push({ product_id: pid, title: p.title, quantity: qty, unit_price: p.price });
  }

  const total = Math.round(snapshots.reduce((s, x) => s + x.unit_price * x.quantity, 0) * 100) / 100;
  const orderId = await orderRepo.createOrderTx(userId, snapshots, total);
  const order = await orderRepo.getOrder(orderId);

  if (config.syncStrategy === "dual_write") {
    try {
      await indexOrder(order);
    } catch (e) {
      // Write path already committed: never fail the order because ES
      // is napping. Logged; polling worker or manual reindex recovers.
      console.error(`dual-write to ES failed for order ${orderId}:`, e.message);
    }
  }
  return order;
}
