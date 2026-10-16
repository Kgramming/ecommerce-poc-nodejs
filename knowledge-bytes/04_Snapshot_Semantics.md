# 04 — Snapshots Freeze History

Source files in this byte: `backend/src/services/orders.js`

---

### Byte 4: Snapshots freeze history

**Builds on:** 2, 3

**In plain terms:** A *snapshot* is a copy of data taken at one moment. When a buyer places an order, the backend copies the product title and unit price into the order. Later changes to the catalog do not change old orders. The demo proves this: old orders still show "Wireless Mouse" at ₹4,199 after the catalog renames it to "Wireless Mouse Pro" at ₹4,999.

**The code:**
```js
// services/orders.js — the snapshot happens here
snapshots.push({ product_id: pid, title: p.title, quantity: qty, unit_price: p.price });
```

**What's happening:** `placeOrder` reads each product from the live MongoDB catalog. It copies `title` and `price` into a snapshot object. The snapshot — not a product reference — goes into `order_items`. The database stores what the buyer actually saw and paid.

**Why it matters:** Without snapshots, a price edit would rewrite history. Invoices would change after the sale. Audits would fail. Snapshots make every order an immutable record of its moment.

---
