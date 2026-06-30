import { CONFIG } from "./config.js";

// Talk to the trench site. The bot reads orders here and writes their status
// back. Everything goes through the same public API the Live Pool uses, so
// every state change is visible to anyone watching the site.

export async function getOrders() {
  const res = await fetch(`${CONFIG.apiBase}/api/orders`);
  if (!res.ok) throw new Error(`getOrders ${res.status}`);
  const json = await res.json();
  return json.orders || [];
}

export async function getOrder(reference) {
  const res = await fetch(`${CONFIG.apiBase}/api/orders/${encodeURIComponent(reference)}`);
  if (!res.ok) return null;
  return (await res.json()).order;
}

export async function patchOrder(reference, fields) {
  const headers = { "Content-Type": "application/json" };
  if (CONFIG.adminToken) headers["x-admin-token"] = CONFIG.adminToken;
  const res = await fetch(`${CONFIG.apiBase}/api/orders/${encodeURIComponent(reference)}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(fields),
  });
  if (!res.ok) throw new Error(`patchOrder ${reference} ${res.status}: ${await res.text()}`);
  return (await res.json()).order;
}
