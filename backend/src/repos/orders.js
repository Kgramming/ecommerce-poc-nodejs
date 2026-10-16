// PostgreSQL order repository. Orders are the source of truth:
// every write goes through a real DB transaction. Reads here hit Postgres ONLY.
import { pgPool } from "../db.js";

const ORDER_SELECT = `
  SELECT o.id, o.user_id, o.order_date, o.status, o.total_amount,
         o.updated_at, u.name, u.email,
         i.product_id, i.title, i.quantity, i.unit_price
  FROM orders o
  JOIN users u ON u.id = o.user_id
  LEFT JOIN order_items i ON i.order_id = o.id
`;

const iso = (v) => (v instanceof Date ? v.toISOString() : String(v ?? ""));

// Groups the flat join rows into orders, mirroring the reference _group().
function group(rows) {
  const acc = new Map();
  for (const r of rows) {
    if (!acc.has(r.id)) {
      acc.set(r.id, {
        id: r.id,
        user_id: r.user_id,
        customer: { id: r.user_id, name: r.name, email: r.email },
        order_date: iso(r.order_date),
        status: r.status,
        total_amount: Number(r.total_amount),
        updated_at: iso(r.updated_at),
        items: [],
      });
    }
    if (r.product_id !== null) {
      acc.get(r.id).items.push({
        product_id: r.product_id,
        title: r.title,
        quantity: r.quantity,
        unit_price: Number(r.unit_price),
      });
    }
  }
  return [...acc.values()];
}

export const orderRepo = {
  async getUser(userId) {
    const { rows } = await pgPool.query("SELECT id, name, email FROM users WHERE id = $1", [userId]);
    return rows[0] || null;
  },

  // Insert one order + N items atomically. All-or-nothing. Returns the order id.
  async createOrderTx(userId, snapshots, total) {
    const client = await pgPool.connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query(
        "INSERT INTO orders (user_id, order_date, status, total_amount) VALUES ($1, now(), 'PENDING', $2) RETURNING id",
        [userId, total]
      );
      const orderId = rows[0].id;
      for (const s of snapshots) {
        await client.query(
          "INSERT INTO order_items (order_id, product_id, title, quantity, unit_price) VALUES ($1, $2, $3, $4, $5)",
          [orderId, s.product_id, s.title, s.quantity, s.unit_price]
        );
      }
      await client.query("COMMIT");
      return orderId;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  },

  async getOrder(orderId) {
    const { rows } = await pgPool.query(ORDER_SELECT + " WHERE o.id = $1 ORDER BY i.id", [orderId]);
    const grouped = group(rows);
    return grouped[0] || null;
  },

  async updateStatus(orderId, status) {
    const { rowCount } = await pgPool.query("UPDATE orders SET status = $1, updated_at = now() WHERE id = $2", [status, orderId]);
    if (rowCount === 0) return null;
    return this.getOrder(orderId);
  },

  async listOrdersSince(since) {
    const { rows } = await pgPool.query("SELECT id FROM orders WHERE updated_at > $1 ORDER BY updated_at", [since]);
    return rows.map((r) => r.id);
  },

  async listAllOrders() {
    const { rows } = await pgPool.query(ORDER_SELECT + " ORDER BY o.id, i.id");
    return group(rows);
  },
};
