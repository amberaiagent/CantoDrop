// ───────────────────────────────────────────────────────────────────────
// trench drop bot — main loop
//
// For every order on the public trench API it:
//   1. PENDING  → watches the pool wallet for the matching deposit (memo + mint)
//                 and marks it `funded`.
//   2. FUNDED/ACTIVE → reads the live market cap, and each time a round's cap
//                 threshold is reached it snapshots holders #from–#to (minus the
//                 LP + excludes), drops an even cut, and advances the round.
//   3. last round done → `completed`.
//
// Safe by default: DRY_RUN=true simulates everything and sends nothing.
// ───────────────────────────────────────────────────────────────────────
import { CONFIG, DEPOSIT_WALLET } from "./src/config.js";
import { getOrders, patchOrder } from "./src/api.js";
import { getMarketData } from "./src/market.js";
import { getDecimals, getHolders, selectRecipients, getIncomingDeposits, sendDropEvenly } from "./src/chain.js";
import { buildSchedule, toBaseUnits } from "./src/engine.js";

const ONCE = process.argv.includes("--once");

async function tick() {
  const orders = await getOrders();
  const deposits = await getIncomingDeposits().catch((e) => {
    console.warn("deposit scan failed:", e.message);
    return [];
  });

  for (const order of orders) {
    try {
      if (order.status === "pending") await handlePending(order, deposits);
      else if (order.status === "funded" || order.status === "active") await handleActive(order);
    } catch (e) {
      console.error(`order ${order.reference}:`, e.message);
    }
  }
}

// 1. match a deposit by memo + mint → funded
async function handlePending(order, deposits) {
  const match = deposits.find(
    (d) => d.memo === order.reference && d.mint?.toLowerCase() === order.tokenMint.toLowerCase()
  );
  if (!match) return;
  const ui = Number(match.amountBase) / 10 ** match.decimals;
  console.log(`✓ deposit for ${order.reference}: ${ui} (${match.signature})`);
  await patchOrder(order.reference, { status: "funded", fundedAmount: ui, fundedTx: match.signature });
}

// 2. fire the next round when its cap is reached
async function handleActive(order) {
  const market = await getMarketData(order.tokenMint);
  if (!market) return;

  // keep the public dashboard's live cap fresh
  if (Math.round(market.marketCap) !== Math.round(Number(order.currentMarketCap || 0))) {
    await patchOrder(order.reference, { currentMarketCap: Math.round(market.marketCap) });
  }

  const baseUi = Number(order.fundedAmount || order.depositAmount);
  const schedule = buildSchedule(order, baseUi);
  const fired = Number(order.cantoRound || 0);
  const next = schedule[fired];
  if (!next) return; // all rounds done already

  if (order.status !== "active") await patchOrder(order.reference, { status: "active" });
  if (market.marketCap < next.marketCap) return; // threshold not reached yet

  console.log(`▶ ${order.reference} round ${next.round} — cap $${Math.round(market.marketCap)} ≥ $${Math.round(next.marketCap)}`);

  // snapshot holders, exclude the LP pool + configured addresses
  const excludes = new Set(CONFIG.excludeAddresses);
  if (market.pairAddress) excludes.add(market.pairAddress);
  const holders = await getHolders(order.tokenMint);
  const recipients = selectRecipients(holders, {
    from: Number(order.holderTopFrom), to: Number(order.holderTopTo), excludes,
  });
  if (!recipients.length) { console.warn("   no eligible holders, skipping"); return; }

  const decimals = await getDecimals(order.tokenMint);
  const totalBase = toBaseUnits(next.dropUi, decimals);
  console.log(`   dropping ${next.dropUi} to ${recipients.length} holders (#${order.holderTopFrom}–#${order.holderTopTo}, LP excluded)`);

  await sendDropEvenly(order.tokenMint, recipients, totalBase);

  const done = next.round >= schedule.length;
  await patchOrder(order.reference, {
    cantoRound: next.round,
    currentMarketCap: Math.round(market.marketCap),
    status: done ? "completed" : "active",
  });
  console.log(`   round ${next.round} done${done ? " — order COMPLETED" : ""}`);
}

async function main() {
  console.log(`trench bot · wallet ${DEPOSIT_WALLET} · ${CONFIG.dryRun ? "DRY_RUN (no sends)" : "LIVE"} · API ${CONFIG.apiBase}`);
  do {
    try { await tick(); } catch (e) { console.error("tick failed:", e.message); }
    if (!ONCE) await new Promise((r) => setTimeout(r, CONFIG.pollInterval * 1000));
  } while (!ONCE);
}

main();
