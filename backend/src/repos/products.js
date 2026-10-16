// MongoDB product-catalog repository. Products are read from MongoDB ONLY.
import { mongoClient, ObjectId } from "../db.js";
import { config } from "../config.js";

const utcNow = () => new Date().toISOString().replace(/\.\d+Z$/, "Z");

function toProduct(doc) {
  return {
    id: doc._id.toString(),
    sku: doc.sku ?? "",
    title: doc.title ?? "",
    description: doc.description ?? "",
    price: Number(doc.price ?? 0),
    category: doc.category ?? "",
    tags: doc.tags ?? [],
    attributes: doc.attributes ?? {},
    variants: doc.variants ?? [],
    active: doc.active ?? true,
    updated_at: doc.updated_at ?? "",
  };
}

const col = () => mongoClient.db(config.mongoDb).collection("products");

export const productRepo = {
  async list({ category, q, includeInactive }) {
    const filter = {};
    if (!includeInactive) filter.active = true;
    if (category) filter.category = { $regex: `^${category.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" };
    if (q) filter.$or = [{ title: { $regex: q, $options: "i" } }, { tags: { $regex: q, $options: "i" } }];
    const docs = await col().find(filter).sort({ title: 1 }).toArray();
    return docs.map(toProduct);
  },

  async get(pid) {
    if (!ObjectId.isValid(pid)) return null;
    const doc = await col().findOne({ _id: new ObjectId(pid) });
    return doc ? toProduct(doc) : null;
  },

  async getMany(pids) {
    const oids = pids.filter(ObjectId.isValid).map((p) => new ObjectId(p));
    if (oids.length === 0) return {};
    const docs = await col().find({ _id: { $in: oids } }).toArray();
    return Object.fromEntries(docs.map((d) => [d._id.toString(), toProduct(d)]));
  },

  async create(data) {
    const doc = {
      sku: data.sku,
      title: data.title,
      description: data.description ?? "",
      price: data.price,
      category: data.category,
      tags: data.tags ?? [],
      attributes: data.attributes ?? {},
      variants: data.variants ?? [],
      active: data.active ?? true,
      updated_at: utcNow(),
    };
    const res = await col().insertOne(doc);
    return toProduct({ ...doc, _id: res.insertedId });
  },

  async update(pid, patch) {
    if (!ObjectId.isValid(pid)) return null;
    const set = { updated_at: utcNow() };
    for (const k of ["sku", "title", "description", "price", "category", "tags", "attributes", "variants", "active"]) {
      if (patch[k] !== undefined) set[k] = patch[k];
    }
    const doc = await col().findOneAndUpdate({ _id: new ObjectId(pid) }, { $set: set }, { returnDocument: "after" });
    return doc ? toProduct(doc) : null;
  },
};
