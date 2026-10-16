// Elasticsearch synchronization — keeps the admin dashboard in line with Postgres.
// Mirrors the reference: dual-write (A) + polling worker (B).
import { readFile } from "node:fs/promises";
import { es } from "../db.js";
import { config } from "../config.js";
import { orderRepo } from "../repos/orders.js";

// Flatten a Postgres order (+ snapshots) into the ES `orders` document.
export function buildEsDoc(o) {
  return {
    order_id: o.id,
    order_date: o.order_date,
    status: o.status,
    total_amount: o.total_amount,
    updated_at: o.updated_at,
    customer: o.customer,
    items: o.items,
  };
}

export async function ensureIndex() {
  try {
    if (await es.indexExists(config.esIndex)) return;
    // PUT the whole file: ES expects {"mappings": {...}} at the top level
    const body = await readFile(new URL("../../es-mapping.json", import.meta.url), "utf8");
    await es.createIndex(config.esIndex, body);
    console.log(`created ES index ${config.esIndex}`);
  } catch (e) {
    // never fail boot because ES is napping
    console.warn("ES index ensure failed at startup:", e.message);
  }
}

export const indexOrder = (order) =>
  es.indexDoc(config.esIndex, String(order.id), JSON.stringify(buildEsDoc(order)), true);

export async function indexOrdersBulk(orders) {
  if (orders.length === 0) return;
  const nd = orders
    .map((o) => JSON.stringify({ index: { _index: config.esIndex, _id: String(o.id) } }) + "\n" + JSON.stringify(buildEsDoc(o)))
    .join("\n") + "\n";
  await es.bulk(nd);
}

export async function reindexAll() {
  const all = await orderRepo.listAllOrders();
  await indexOrdersBulk(all);
  return all.length;
}

// Build the exact search body the reference implementation sends.
export function buildSearchBody({ query, statuses, date_from, date_to, min_total, max_total }) {
  const must = [];
  if (query && query.trim()) {
    // customer.name is top-level, but items.title lives inside a NESTED
    // field: a plain multi_match on it silently matches nothing.
    must.push({
      bool: {
        should: [
          { multi_match: { query, fields: ["customer.name"], boost: 2.0 } },
          { nested: { path: "items", query: { multi_match: { query, fields: ["items.title"] } }, score_mode: "avg" } },
        ],
        minimum_should_match: 1,
      },
    });
  }
  const filter = [];
  if (statuses && statuses.length) filter.push({ terms: { status: statuses } });
  if (date_from || date_to) {
    const r = {};
    if (date_from) r.gte = date_from;
    if (date_to) r.lte = date_to;
    filter.push({ range: { order_date: r } });
  }
  if (min_total != null || max_total != null) {
    const r = {};
    if (min_total != null) r.gte = min_total;
    if (max_total != null) r.lte = max_total;
    filter.push({ range: { total_amount: r } });
  }
  if (must.length === 0) must.push({ match_all: {} });
  return {
    query: { bool: { must, filter } },
    aggs: {
      by_status: { terms: { field: "status" } },
      revenue: { sum: { field: "total_amount" } },
    },
    sort: [{ order_date: { order: "desc" } }],
  };
}
