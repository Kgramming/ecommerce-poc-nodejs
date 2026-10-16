// Order routes — Postgres is the source of truth.
import { Router } from "express";
import { orderRepo } from "../repos/orders.js";
import { placeOrder } from "../services/orders.js";
import { indexOrder } from "../services/sync.js";
import { ApiError } from "../errors.js";

const VALID_STATUSES = ["PENDING", "PROCESSING", "SHIPPED"];

export const ordersRouter = Router();

ordersRouter.post("/", async (req, res, next) => {
  try {
    const b = req.body || {};
    const o = await placeOrder(b.user_id, b.items);
    res.status(201).json(o);
  } catch (e) { next(e); }
});

ordersRouter.get("/:oid", async (req, res, next) => {
  try {
    const o = await orderRepo.getOrder(parseInt(req.params.oid, 10));
    if (!o) throw new ApiError(404, "order not found");
    res.json(o);
  } catch (e) { next(e); }
});

ordersRouter.patch("/:oid/status", async (req, res, next) => {
  try {
    const status = (req.body || {}).status;
    if (!VALID_STATUSES.includes(status)) {
      throw new ApiError(422, `status must be one of [${[...VALID_STATUSES].sort().join(", ")}]`);
    }
    const o = await orderRepo.updateStatus(parseInt(req.params.oid, 10), status);
    if (!o) throw new ApiError(404, "order not found");
    // Keep the dashboard accurate: refresh the ES doc. If ES is down the
    // write path still succeeded — the polling worker recovers it.
    try { await indexOrder(o); }
    catch (e) { console.warn(`ES status-sync failed for order ${o.id}:`, e.message); }
    res.json(o);
  } catch (e) { next(e); }
});
