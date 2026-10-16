// Shared clients: MongoDB, PostgreSQL pool, Elasticsearch base URL.
import { MongoClient, ObjectId } from "mongodb";
import pg from "pg";
import { config } from "./config.js";

const { Pool } = pg;

export const mongoClient = new MongoClient(config.mongoUri);
export const pgPool = new Pool(config.pg);
export { ObjectId };

// Minimal Elasticsearch HTTP client — same raw JSON the reference sends.
export const es = {
  async request(method, path, body, contentType) {
    const res = await fetch(config.esUrl + path, {
      method,
      headers: body ? { "Content-Type": contentType || "application/json" } : {},
      body: body || undefined,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`ES ${method} ${path} -> ${res.status}: ${text}`);
    return text;
  },
  async indexExists(index) {
    const res = await fetch(`${config.esUrl}/${index}`, { method: "HEAD" });
    return res.ok;
  },
  createIndex(index, mappingsJson) {
    return this.request("PUT", `/${index}`, mappingsJson);
  },
  deleteIndex(index) {
    return this.request("DELETE", `/${index}`);
  },
  // refresh=wait_for: searchable before the API returns
  indexDoc(index, id, docJson, refreshWaitFor) {
    return this.request("PUT", `/${index}/_doc/${id}${refreshWaitFor ? "?refresh=wait_for" : ""}`, docJson);
  },
  bulk(ndJson) {
    return this.request("POST", "/_bulk", ndJson, "application/x-ndjson");
  },
  search(index, bodyJson, from, size) {
    return this.request("POST", `/${index}/_search?from=${from}&size=${size}`, bodyJson);
  },
};
