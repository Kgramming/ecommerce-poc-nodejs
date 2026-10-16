// Admin search route — Elasticsearch ONLY.
import { Router } from "express";
import { es } from "../db.js";
import { config } from "../config.js";
import { buildSearchBody } from "../services/sync.js";

export const searchRouter = Router();

searchRouter.post("/orders", async (req, res, next) => {
  try {
    const b = req.body || {};
    const page = b.page >= 1 ? b.page : 1;
    const pageSize = Math.min(Math.max(b.page_size || 20, 1), 1000);
    const body = buildSearchBody(b);
    const raw = await es.search(config.esIndex, JSON.stringify(body), (page - 1) * pageSize, pageSize);
    const resp = JSON.parse(raw);

    const total = resp.hits?.total?.value ?? 0;
    const orders = (resp.hits?.hits || []).map((h) => {
      const s = h._source;
      return {
        order_id: s.order_id ?? 0,
        order_date: s.order_date ?? "",
        status: s.status ?? "",
        total_amount: s.total_amount ?? 0,
        customer: {
          id: s.customer?.id ?? 0,
          name: s.customer?.name ?? "",
          email: s.customer?.email ?? "",
        },
        items: (s.items || []).map((it) => ({
          product_id: it.product_id ?? "",
          title: it.title ?? "",
          quantity: it.quantity ?? 0,
          unit_price: it.unit_price ?? 0,
        })),
      };
    });

    const countByStatus = {};
    for (const bk of resp.aggregations?.by_status?.buckets || []) {
      countByStatus[bk.key] = bk.doc_count ?? 0;
    }
    const totalRevenue = resp.aggregations?.revenue?.value ?? 0;

    res.json({ total, orders, kpis: { total_revenue: totalRevenue, count_by_status: countByStatus } });
  } catch (e) { next(e); }
});
