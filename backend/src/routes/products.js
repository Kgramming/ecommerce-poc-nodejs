// Product catalog routes — MongoDB ONLY.
import { Router } from "express";
import { productRepo } from "../repos/products.js";
import { ApiError } from "../errors.js";

export const productsRouter = Router();

productsRouter.get("/", async (req, res, next) => {
  try {
    const items = await productRepo.list({
      category: req.query.category || null,
      q: req.query.q || null,
      includeInactive: req.query.include_inactive === "true" || req.query.include_inactive === "1",
    });
    res.json({ products: items, total: items.length });
  } catch (e) { next(e); }
});

productsRouter.get("/:pid", async (req, res, next) => {
  try {
    const p = await productRepo.get(req.params.pid);
    if (!p) throw new ApiError(404, "product not found");
    res.json(p);
  } catch (e) { next(e); }
});

productsRouter.post("/", async (req, res, next) => {
  try {
    const b = req.body || {};
    if (!b.sku || !b.title || !b.category) throw new ApiError(400, "sku, title and category are required");
    if (b.price == null || b.price <= 0) throw new ApiError(400, "price must be > 0");
    const p = await productRepo.create(b);
    res.status(201).json(p);
  } catch (e) { next(e); }
});

productsRouter.put("/:pid", async (req, res, next) => {
  try {
    const b = req.body || {};
    const keys = ["sku", "title", "description", "price", "category", "tags", "attributes", "variants", "active"];
    if (!keys.some((k) => b[k] !== undefined)) throw new ApiError(400, "empty update");
    if (b.price !== undefined && b.price <= 0) throw new ApiError(400, "price must be > 0");
    const p = await productRepo.update(req.params.pid, b);
    if (!p) throw new ApiError(404, "product not found");
    res.json(p);
  } catch (e) { next(e); }
});
