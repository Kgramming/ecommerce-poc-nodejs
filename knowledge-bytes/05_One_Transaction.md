# 05 — One Transaction for Order Plus Items

Source files in this byte: `backend/src/repos/orders.js`

---

### Byte 5: One transaction for order plus items

**Builds on:** 3, 4

**In plain terms:** A *transaction* is a group of writes that succeed or fail together. `createOrderTx` inserts the order row and all its item rows inside one transaction. It checks out a dedicated client from the pool and runs `BEGIN`. If any insert fails, it runs `ROLLBACK`. There is never an order without items, and never items without an order.

**The code:**
```js
// repos/orders.js — all-or-nothing write
const client = await pgPool.connect();
try {
  await client.query("BEGIN");
  const { rows } = await client.query(
    "INSERT INTO orders (user_id, order_date, status, total_amount) VALUES ($1, now(), 'PENDING', $2) RETURNING id",
    [userId, total]
  );
  const orderId = rows[0].id;
  // ... insert each item with orderId ...
  await client.query("COMMIT");
  return orderId;
} catch (e) {
  await client.query("ROLLBACK");
  throw e;
} finally {
  client.release();
}
```

**What's happening:** The code takes one client from the pool so all statements share one connection. It begins a transaction, inserts the order, reads back the new id, inserts each snapshot item, then commits. Any error triggers a rollback and the client goes back to the pool in the `finally` block.

**Why it matters:** Money data must never be half-written. Without the transaction, a crash could leave an order with no items and a wrong total. The transaction makes the write atomic.

---
