// The round schedule — identical formula to the website's milestonePreview, so
// what holders see on the site is exactly what the bot executes.

export function buildSchedule(order, baseUi) {
  const target = Number(order.targetMarketCap);
  const rounds = Number(order.rounds || 5);
  const split = Number(order.splitPercent || 50) / 100;
  const basis = order.splitBasis || "remaining";
  const capMode = order.capMode || "multiply";
  const mult = Number(order.capMultiplier || 2);
  const step = Number(order.capStep || 0);

  const rows = [];
  let remaining = baseUi;
  for (let i = 0; i < rounds && remaining > 1e-9; i++) {
    const cap = capMode === "step" ? target + step * i : target * Math.pow(mult, i);
    let drop = basis === "total" ? baseUi * split : remaining * split;
    if (drop > remaining) drop = remaining;
    rows.push({ round: i + 1, marketCap: cap, dropUi: drop, remainingAfter: Math.max(remaining - drop, 0) });
    remaining -= drop;
  }
  return rows;
}

// UI token amount → base units (BigInt), for transfers.
export function toBaseUnits(uiAmount, decimals) {
  // avoid float drift: split integer/fraction parts
  const [whole, frac = ""] = String(uiAmount).split(".");
  const fracPadded = (frac + "0".repeat(decimals)).slice(0, decimals);
  return BigInt(whole || "0") * 10n ** BigInt(decimals) + BigInt(fracPadded || "0");
}
