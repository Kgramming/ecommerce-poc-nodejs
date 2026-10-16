// Knowledge Bytes API — serves the repo's knowledge-bytes/*.md as JSON.
//
// GET /api/knowledge-bytes      -> {"bytes": [{"id": "...", "title": "..."}], "total": 8}
// GET /api/knowledge-bytes/{id} -> {"id": "...", "title": "...", "markdown": "..."} | 404
import { Router } from "express";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, normalize, basename } from "node:path";
import { ApiError } from "../errors.js";

const BYTE_RE = /^\d{2}_.*\.md$/;
const SLUG_RE = /^[A-Za-z0-9_]+$/;
const TITLE_RE = /^#\s+\d+\s+[—–-]\s+(.+)$/m;

async function resolveDir() {
  if (process.env.KNOWLEDGE_BYTES_DIR) return process.env.KNOWLEDGE_BYTES_DIR;
  const cwd = process.cwd();
  for (const cand of [join(cwd, "knowledge-bytes"), join(cwd, "..", "knowledge-bytes"), join(cwd, "..", "..", "knowledge-bytes")]) {
    try {
      const st = await stat(normalize(cand));
      if (st.isDirectory()) return normalize(cand);
    } catch { /* not here */ }
  }
  return null;
}

async function parse(path) {
  const text = await readFile(path, "utf8");
  const m = TITLE_RE.exec(text);
  const title = m ? m[1].trim() : basename(path, ".md");
  return { title, text };
}

export const knowledgeRouter = Router();

knowledgeRouter.get("/", async (_req, res, next) => {
  try {
    const dir = await resolveDir();
    const items = [];
    if (dir) {
      const files = (await readdir(dir)).filter((f) => BYTE_RE.test(f)).sort();
      for (const fn of files) {
        const slug = basename(fn, ".md");
        const { title } = await parse(join(dir, fn));
        items.push({ id: slug, title });
      }
    }
    res.json({ bytes: items, total: items.length });
  } catch (e) { next(e); }
});

knowledgeRouter.get("/:slug", async (req, res, next) => {
  try {
    const { slug } = req.params;
    if (!SLUG_RE.test(slug) || !BYTE_RE.test(slug + ".md")) throw new ApiError(404, "knowledge byte not found");
    const dir = await resolveDir();
    const path = dir ? join(dir, slug + ".md") : null;
    if (!path) throw new ApiError(404, "knowledge byte not found");
    try {
      await stat(path);
    } catch {
      throw new ApiError(404, "knowledge byte not found");
    }
    const { title, text } = await parse(path);
    res.json({ id: slug, title, markdown: text });
  } catch (e) { next(e); }
});
