import {
  Connection,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
  ComputeBudgetProgram,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  createTransferInstruction,
  createAssociatedTokenAccountIdempotentInstruction,
  getMint,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { CONFIG, DEPOSIT_WALLET } from "./config.js";

export const connection = new Connection(CONFIG.rpcUrl, "confirmed");

const MEMO_PROGRAMS = new Set([
  "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr",
  "Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo",
]);

export async function getDecimals(mint) {
  const info = await getMint(connection, new PublicKey(mint));
  return info.decimals;
}

// ── holder snapshot ──────────────────────────────────────────────────────
// Enumerate every holder of `mint`, summed per owner, sorted by balance desc.
// Uses Helius getTokenAccounts (paginated) when the RPC supports it; falls back
// to getProgramAccounts otherwise.
export async function getHolders(mint) {
  if (CONFIG.rpcUrl.includes("helius")) return getHoldersHelius(mint);
  return getHoldersRpc(mint);
}

async function getHoldersHelius(mint) {
  const byOwner = new Map();
  let page = 1;
  for (;;) {
    const res = await fetch(CONFIG.rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0", id: "holders", method: "getTokenAccounts",
        params: { mint, page, limit: 1000, options: { showZeroBalance: false } },
      }),
    });
    const json = await res.json();
    const accounts = json.result?.token_accounts || [];
    if (!accounts.length) break;
    for (const a of accounts) {
      if (!a.owner || !a.amount) continue;
      byOwner.set(a.owner, (byOwner.get(a.owner) || 0n) + BigInt(a.amount));
    }
    if (accounts.length < 1000) break;
    page++;
    if (page > 50) break; // safety: cap at 50k accounts
  }
  return sortHolders(byOwner);
}

async function getHoldersRpc(mint) {
  // Heavy call — many public RPCs disable it. Helius/dedicated recommended.
  const accs = await connection.getParsedProgramAccounts(TOKEN_PROGRAM_ID, {
    filters: [{ dataSize: 165 }, { memcmp: { offset: 0, bytes: mint } }],
  });
  const byOwner = new Map();
  for (const { account } of accs) {
    const info = account.data?.parsed?.info;
    if (!info) continue;
    const amt = BigInt(info.tokenAmount?.amount || "0");
    if (amt === 0n) continue;
    byOwner.set(info.owner, (byOwner.get(info.owner) || 0n) + amt);
  }
  return sortHolders(byOwner);
}

function sortHolders(byOwner) {
  return [...byOwner.entries()]
    .map(([owner, amount]) => ({ owner, amount }))
    .sort((a, b) => (a.amount < b.amount ? 1 : a.amount > b.amount ? -1 : 0));
}

// Apply the order's rules: drop the LP + excludes, keep ranks [from..to].
export function selectRecipients(holders, { from, to, excludes }) {
  const filtered = holders.filter((h) => !excludes.has(h.owner) && h.owner !== DEPOSIT_WALLET);
  return filtered.slice(Math.max(0, from - 1), to).map((h) => h.owner);
}

// ── incoming deposits ────────────────────────────────────────────────────
// Look at the deposit wallet's recent transactions and return incoming SPL
// transfers with their memo, mint and amount (base units).
export async function getIncomingDeposits(limit = 40) {
  const wallet = new PublicKey(DEPOSIT_WALLET);
  const sigs = await connection.getSignaturesForAddress(wallet, { limit });
  const out = [];
  for (const s of sigs) {
    if (s.err) continue;
    const tx = await connection.getParsedTransaction(s.signature, { maxSupportedTransactionVersion: 0 });
    if (!tx?.meta) continue;

    const memo = extractMemo(tx);
    // incoming token = positive balance delta on an account owned by us
    const pre = tx.meta.preTokenBalances || [];
    const post = tx.meta.postTokenBalances || [];
    for (const pb of post) {
      if (pb.owner !== DEPOSIT_WALLET) continue;
      const prev = pre.find((x) => x.accountIndex === pb.accountIndex);
      const delta = BigInt(pb.uiTokenAmount.amount) - BigInt(prev?.uiTokenAmount.amount || "0");
      if (delta > 0n) {
        out.push({
          signature: s.signature,
          mint: pb.mint,
          amountBase: delta,
          decimals: pb.uiTokenAmount.decimals,
          memo,
        });
      }
    }
  }
  return out;
}

function extractMemo(tx) {
  const all = [
    ...(tx.transaction.message.instructions || []),
    ...((tx.meta.innerInstructions || []).flatMap((i) => i.instructions) || []),
  ];
  for (const ix of all) {
    if (ix.program === "spl-memo" && typeof ix.parsed === "string") return ix.parsed.trim();
    if (ix.programId && MEMO_PROGRAMS.has(ix.programId.toString()) && ix.parsed) {
      return String(ix.parsed).trim();
    }
  }
  return null;
}

// ── send the drop ────────────────────────────────────────────────────────
// Split `totalBase` evenly across `recipients`, transferring from the deposit
// wallet's token account. Batches recipients per transaction. DRY_RUN logs only.
export async function sendDropEvenly(mint, recipients, totalBase) {
  if (!recipients.length || totalBase <= 0n) return { sent: 0, txs: [] };
  const each = totalBase / BigInt(recipients.length);
  if (each <= 0n) return { sent: 0, txs: [] };

  const mintPk = new PublicKey(mint);
  const fromAta = await getAssociatedTokenAddress(mintPk, CONFIG.keypair.publicKey);

  if (CONFIG.dryRun) {
    console.log(`   [DRY_RUN] would send ${each} base units to each of ${recipients.length} holders`);
    return { sent: recipients.length, txs: ["DRY_RUN"], each };
  }

  const BATCH = 7; // recipients per transaction (ATA create + transfer each)
  const txs = [];
  for (let i = 0; i < recipients.length; i += BATCH) {
    const slice = recipients.slice(i, i + BATCH);
    const tx = new Transaction().add(
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 20000 })
    );
    for (const owner of slice) {
      const ownerPk = new PublicKey(owner);
      const toAta = await getAssociatedTokenAddress(mintPk, ownerPk);
      tx.add(
        createAssociatedTokenAccountIdempotentInstruction(CONFIG.keypair.publicKey, toAta, ownerPk, mintPk),
        createTransferInstruction(fromAta, toAta, CONFIG.keypair.publicKey, each)
      );
    }
    const sig = await sendAndConfirmTransaction(connection, tx, [CONFIG.keypair], {
      commitment: "confirmed",
    });
    txs.push(sig);
    console.log(`   sent batch ${i / BATCH + 1} (${slice.length} holders) → ${sig}`);
  }
  return { sent: recipients.length, txs, each };
}
