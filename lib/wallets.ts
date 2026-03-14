import { Wallet } from 'xrpl';
import fs from 'fs';
import path from 'path';

export interface WalletSet {
  issuer: Wallet;
  producer: Wallet;
  consumer: Wallet;
}

function readEnvLocal(): Record<string, string> {
  const envPath = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) return {};
  const content = fs.readFileSync(envPath, 'utf-8');
  const result: Record<string, string> = {};
  for (const line of content.split('\n')) {
    const eqIdx = line.indexOf('=');
    if (eqIdx === -1) continue;
    const key = line.slice(0, eqIdx).trim();
    const val = line.slice(eqIdx + 1).trim();
    if (key) result[key] = val;
  }
  return result;
}

export function getWalletsFromEnv(): WalletSet | null {
  // Read directly from .env.local on disk so we don't depend on process.env
  // (Next.js loads process.env at startup; runtime writes to .env.local won't update it)
  const env = readEnvLocal();
  const issuerSeed = env.ISSUER_SEED || process.env.ISSUER_SEED;
  const producerSeed = env.PRODUCER_SEED || process.env.PRODUCER_SEED;
  const consumerSeed = env.CONSUMER_SEED || process.env.CONSUMER_SEED;

  if (!issuerSeed || !producerSeed || !consumerSeed) return null;

  return {
    issuer: Wallet.fromSeed(issuerSeed),
    producer: Wallet.fromSeed(producerSeed),
    consumer: Wallet.fromSeed(consumerSeed),
  };
}

export function getMptId(): string {
  const env = readEnvLocal();
  return env.MPT_ID || process.env.MPT_ID || '';
}

export function getAmmAddress(): string {
  const env = readEnvLocal();
  return env.AMM_ADDRESS || process.env.AMM_ADDRESS || '';
}

// Kept for compatibility — no longer needed but harmless
export function setWallets(_wallets: WalletSet): void {}
export function setMptId(_id: string): void {}
export function setAmmAddress(_addr: string): void {}
