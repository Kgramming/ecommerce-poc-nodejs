// Seed the whole data stack (idempotent: clears and reloads everything).
// Order: schema -> users -> products (MongoDB) -> orders -> ES reindex
//        -> rename fixture (Wireless Mouse -> Wireless Mouse Pro, MongoDB only).
// The seed resets ALL THREE stores: PG TRUNCATE, MongoDB clear,
// ES index DELETE + recreate. Otherwise stale ES docs with colliding
// order_ids break the acceptance harness deterministically.
//
// Run from the repo root:  npm run seed --prefix backend
import { readFile } from "node:fs/promises";
import { MongoClient, ObjectId } from "mongodb";
import pg from "pg";
import { config } from "./config.js";
import { es } from "./db.js";

const { Pool } = pg;
const SEED = new URL("../../seed/", import.meta.url);
const utcNow = () => new Date().toISOString().replace(/\.\d+Z$/, "Z");

async function main() {
  const pool = new Pool(config.pg);
  const mongo = new MongoClient(config.mongoUri);
  await mongo.connect();

  console.log("1/6  PostgreSQL schema ...");
  await pool.query(await readFile(new URL("schema.sql", SEED), "utf8"));
  console.log("     clearing any previous seed data ...");
  await pool.query("TRUNCATE TABLE order_items, orders, users RESTART IDENTITY CASCADE;");

  console.log("2/6  users ...");
  await pool.query(await readFile(new URL("users.sql", SEED), "utf8"));

  console.log("3/6  products -> MongoDB ...");
  const products = JSON.parse(await readFile(new URL("products.json", SEED), "utf8"))
    .map((p) => ({ ...p, _id: new ObjectId(p._id) }));
  const col = mongo.db(config.mongoDb).collection("products");
  await col.deleteMany({});
  await col.insertMany(products);
  console.log(`     inserted ${products.length} products`);

  console.log("4/6  orders -> PostgreSQL ...");
  await pool.query(await readFile(new URL("orders.sql", SEED), "utf8"));

  console.log("5/6  Elasticsearch reindex ...");
  const n = await reindexEs(pool);
  console.log(`     indexed ${n} orders`);

  console.log("6/6  rename fixture: 'Wireless Mouse' -> 'Wireless Mouse Pro' ...");
  const res = await col.updateOne(
    { sku: "WM-001" },
    { $set: { title: "Wireless Mouse Pro", price: 4999, updated_at: utcNow() } }
  );
  console.log(`     matched ${res.matchedCount} product (historical orders keep the old snapshot)`);

  await mongo.close();
  await pool.end();
  console.log("seed complete.");
}

async function reindexEs(pool) {
  const { rows } = await pool.query(`
    SELECT o.id, o.user_id, o.order_date, o.status, o.total_amount,
           o.updated_at, u.name, u.email,
           i.product_id, i.title, i.quantity, i.unit_price
    FROM orders o
    JOIN users u ON u.id = o.user_id
    LEFT JOIN order_items i ON i.order_id = o.id
    ORDER BY o.id, i.id
  `);
  const docs = [];
  let cur = null;
  for (const r of rows) {
    if (!cur || cur.order_id !== r.id) {
      cur = {
        order_id: r.id,
        order_date: r.order_date.toISOString(),
        status: r.status,
        total_amount: Number(r.total_amount),
        updated_at: r.updated_at.toISOString(),
        customer: { id: r.user_id, name: r.name, email: r.email },
        items: [],
      };
      docs.push(cur);
    }
    if (r.product_id !== null) {
      cur.items.push({
        product_id: r.product_id,
        title: r.title,
        quantity: r.quantity,
        unit_price: Number(r.unit_price),
      });
    }
  }

  // Pristine index: delete first so no stale docs survive.
  try { await es.deleteIndex(config.esIndex); } catch { /* 404 = didn't exist, fine */ }
  // PUT the whole file: ES expects {"mappings": {...}} at the top level
  await es.createIndex(config.esIndex, await readFile(new URL("../es-mapping.json", import.meta.url), "utf8"));

  if (docs.length === 0) return 0;
  const nd = docs
    .map((d) => JSON.stringify({ index: { _index: config.esIndex, _id: String(d.order_id) } }) + "\n" + JSON.stringify(d))
    .join("\n") + "\n";
  await es.bulk(nd);
  return docs.length;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
