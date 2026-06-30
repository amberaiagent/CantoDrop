import "dotenv/config";
import bs58 from "bs58";
import { Keypair } from "@solana/web3.js";

function req(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name} in bot/.env`);
  return v;
}

// Accept either a base58 secret key or a JSON array of bytes.
function loadKeypair(secret) {
  const s = secret.trim();
  try {
    if (s.startsWith("[")) return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(s)));
    return Keypair.fromSecretKey(bs58.decode(s));
  } catch (e) {
    throw new Error("DEPOSIT_WALLET_SECRET is not a valid base58 key or JSON byte array.");
  }
}

export const CONFIG = {
  rpcUrl: req("RPC_URL"),
  apiBase: (process.env.API_BASE || "http://localhost:3000").replace(/\/+$/, ""),
  adminToken: process.env.ADMIN_TOKEN || "",
  dryRun: String(process.env.DRY_RUN || "true").toLowerCase() !== "false",
  pollInterval: Math.max(10, Number(process.env.POLL_INTERVAL || 30)),
  excludeAddresses: new Set(
    (process.env.EXCLUDE_ADDRESSES || "").split(",").map((s) => s.trim()).filter(Boolean)
  ),
  keypair: loadKeypair(req("DEPOSIT_WALLET_SECRET")),
};

export const DEPOSIT_WALLET = CONFIG.keypair.publicKey.toBase58();
