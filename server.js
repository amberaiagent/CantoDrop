import "./src/load-env.js"; // must be first — populates process.env from .env
import express from "express";
import path from "path";
import { fileURLToPath } from "url";

import { DEPOSIT_WALLET, DEFAULTS, LIMITS } from "./src/config.js";
import { parseOrderInput, ValidationError } from "./src/validate.js";
import {
  createOrder,
  getOrderByReference,
  getAllOrders,
  updateOrder,
  ORDER_STATUSES,
  milestonePreview,
} from "./src/orders.js";
import { resolveToken } from "./src/token.js";

// Optional shared secret the bot sends to mutate orders. If unset (local dev),
// the update endpoint is open so you can demo status changes by hand.
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Platform defaults so the form/diagrams render without hardcoding.
app.get("/api/config", (_req, res) => {
  res.json({ depositWallet: DEPOSIT_WALLET, defaults: DEFAULTS, limits: LIMITS });
});

// Resolve a token's name/ticker from its CA — used by the form to preview the token.
app.get("/api/token/:mint", async (req, res) => {
  const meta = await resolveToken(req.params.mint.trim());
  res.json({ ok: true, found: !!(meta.ticker || meta.name), ...meta });
});

// Create an order → saved order + deposit instructions + canto preview.
app.post("/api/orders", async (req, res) => {
  let input;
  try {
    input = parseOrderInput(req.body);
  } catch (err) {
    if (err instanceof ValidationError) {
      return res.status(400).json({ ok: false, field: err.field, error: err.message });
    }
    throw err;
  }

  try {
    // Resolve name/ticker from the CA (cached; the form preview usually warmed it).
    const meta = await resolveToken(input.tokenMint);
    const order = await createOrder({ ...input, tokenName: meta.name, tokenTicker: meta.ticker });
    return res.status(201).json({
      ok: true,
      order: publicOrder(order),
      deposit: {
        wallet: order.deposit_wallet,
        memo: order.reference,
        amount: order.deposit_amount,
        tokenMint: order.token_mint,
      },
      preview: milestonePreview(order),
    });
  } catch (err) {
    console.error("createOrder failed:", err);
    return res.status(500).json({ ok: false, error: "Could not save the order. Try again." });
  }
});

// Public Live Pool — every order, newest first.
app.get("/api/orders", async (_req, res) => {
  try {
    const all = await getAllOrders();
    return res.json({ ok: true, orders: all.map(publicOrder) });
  } catch (err) {
    console.error("listOrders failed:", err);
    return res.status(500).json({ ok: false, error: "list_failed" });
  }
});

// Single order + canto schedule.
app.get("/api/orders/:reference", async (req, res) => {
  try {
    const order = await getOrderByReference(req.params.reference.trim());
    if (!order) return res.status(404).json({ ok: false, error: "not_found" });
    return res.json({ ok: true, order: publicOrder(order), preview: milestonePreview(order) });
  } catch (err) {
    console.error("getOrder failed:", err);
    return res.status(500).json({ ok: false, error: "lookup_failed" });
  }
});

// Update an order — the bot drives funded → active → completed and pushes
// current_market_cap / canto_round. Guarded by x-admin-token when ADMIN_TOKEN is set.
app.patch("/api/orders/:reference", async (req, res) => {
  if (ADMIN_TOKEN && req.get("x-admin-token") !== ADMIN_TOKEN) {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }
  const { status, currentMarketCap, cantoRound, fundedAmount, fundedTx } = req.body || {};
  if (status !== undefined && !ORDER_STATUSES.includes(status)) {
    return res.status(400).json({ ok: false, error: `status must be one of ${ORDER_STATUSES.join(", ")}` });
  }
  try {
    const order = await updateOrder(req.params.reference.trim(), {
      status, currentMarketCap, cantoRound, fundedAmount, fundedTx,
    });
    if (!order) return res.status(404).json({ ok: false, error: "not_found" });
    return res.json({ ok: true, order: publicOrder(order) });
  } catch (err) {
    return res.status(400).json({ ok: false, error: err.message });
  }
});

// /order/:reference and /token/:ca → token status page (fetches the API).
app.get(["/order/:reference", "/token/:reference"], (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "order.html"));
});

// /admin → manual control panel (move orders through statuses by hand).
app.get("/admin", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

// Admin login — validates the password for the panel. If ADMIN_TOKEN is unset
// (local dev), any attempt passes and the panel is open.
app.post("/api/admin/login", (req, res) => {
  const token = String(req.body?.token || "");
  if (!ADMIN_TOKEN || token === ADMIN_TOKEN) return res.json({ ok: true, open: !ADMIN_TOKEN });
  return res.status(401).json({ ok: false, error: "wrong_password" });
});

function publicOrder(o) {
  return {
    reference: o.reference,
    tokenMint: o.token_mint,
    tokenName: o.token_name ?? null,
    tokenTicker: o.token_ticker ?? null,
    depositAmount: o.deposit_amount,
    supplyPercent: o.supply_percent,
    targetMarketCap: o.target_market_cap,
    currentMarketCap: o.current_market_cap,
    cantoRound: o.canto_round,
    holderTopFrom: o.holder_top_from,
    holderTopTo: o.holder_top_to,
    capMultiplier: o.cap_multiplier,
    splitPercent: o.split_percent,
    depositWallet: o.deposit_wallet,
    status: o.status,
    fundedAmount: o.funded_amount,
    fundedTx: o.funded_tx,
    createdAt: o.created_at,
  };
}

app.listen(PORT, () => {
  console.log(`\n  canto is live  →  http://localhost:${PORT}\n`);
});
