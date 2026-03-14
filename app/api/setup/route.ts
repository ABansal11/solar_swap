import { NextResponse } from 'next/server';
import { Wallet } from 'xrpl';
import { getClient } from '@/lib/xrpl';
import { createMptIssuance, authorizeMpt, authorizeMptHolder, setTrustLine } from '@/lib/mpt';
import fs from 'fs';
import path from 'path';

const ENV_PATH = path.join(process.cwd(), '.env.local');

function writeEnvLocal(data: Record<string, string>) {
  const content = Object.entries(data).map(([k, v]) => `${k}=${v}`).join('\n') + '\n';
  fs.writeFileSync(ENV_PATH, content);
}

function readEnvLocal(): Record<string, string> {
  if (!fs.existsSync(ENV_PATH)) return {};
  const result: Record<string, string> = {};
  for (const line of fs.readFileSync(ENV_PATH, 'utf-8').split('\n')) {
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    result[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }
  return result;
}

export async function POST() {
  const client = await getClient();
  let step = 'connect';

  try {
    const existing = readEnvLocal();
    const hasWallets = existing.ISSUER_SEED && existing.PRODUCER_SEED && existing.CONSUMER_SEED;
    const hasMpt = !!existing.MPT_ID;

    // Reuse existing wallets if present — no need to hit the faucet again
    let issuer: Wallet, producer: Wallet, consumer: Wallet;
    if (hasWallets) {
      console.log('[setup] Reusing existing wallets from .env.local');
      issuer = Wallet.fromSeed(existing.ISSUER_SEED);
      producer = Wallet.fromSeed(existing.PRODUCER_SEED);
      consumer = Wallet.fromSeed(existing.CONSUMER_SEED);
    } else {
      step = 'fund_issuer';
      console.log('[setup] Funding issuer...');
      ({ wallet: issuer } = await client.fundWallet());

      step = 'fund_producer';
      console.log('[setup] Funding producer...');
      ({ wallet: producer } = await client.fundWallet());

      step = 'fund_consumer';
      console.log('[setup] Funding consumer...');
      ({ wallet: consumer } = await client.fundWallet());

      console.log('[setup] Wallets:', issuer.classicAddress, producer.classicAddress, consumer.classicAddress);
    }

    // Reuse existing MPT if present
    let mptId: string;
    if (hasMpt) {
      console.log('[setup] Reusing existing MPT ID:', existing.MPT_ID);
      mptId = existing.MPT_ID;
    } else {
      step = 'create_mpt';
      console.log('[setup] Creating MPT issuance...');
      mptId = await createMptIssuance(client, issuer);
      console.log('[setup] MPT ID:', mptId);

      // Save immediately so a later failure doesn't lose the MPT ID
      writeEnvLocal({
        ISSUER_SEED: issuer.seed!,
        ISSUER_ADDRESS: issuer.classicAddress,
        PRODUCER_SEED: producer.seed!,
        PRODUCER_ADDRESS: producer.classicAddress,
        CONSUMER_SEED: consumer.seed!,
        CONSUMER_ADDRESS: consumer.classicAddress,
        MPT_ID: mptId,
        AMM_ADDRESS: '',
      });
      console.log('[setup] .env.local written');
    }

    // Authorize producer (silently skip if already authorized)
    step = 'authorize_producer';
    console.log('[setup] Authorizing producer...');
    try { await authorizeMpt(client, producer, mptId); } catch { console.log('[setup] Producer already opted in'); }
    try { await authorizeMptHolder(client, issuer, producer.classicAddress, mptId); } catch { console.log('[setup] Producer already authorized'); }

    // Authorize consumer
    step = 'authorize_consumer';
    console.log('[setup] Authorizing consumer...');
    try { await authorizeMpt(client, consumer, mptId); } catch { console.log('[setup] Consumer already opted in'); }
    try { await authorizeMptHolder(client, issuer, consumer.classicAddress, mptId); } catch { console.log('[setup] Consumer already authorized'); }

    // RLUSD trustlines
    step = 'trustlines';
    console.log('[setup] Setting trustlines...');
    try { await setTrustLine(client, producer); } catch { console.log('[setup] Producer trustline already set'); }
    try { await setTrustLine(client, consumer); } catch { console.log('[setup] Consumer trustline already set'); }

    // Persist final state
    writeEnvLocal({
      ISSUER_SEED: issuer.seed!,
      ISSUER_ADDRESS: issuer.classicAddress,
      PRODUCER_SEED: producer.seed!,
      PRODUCER_ADDRESS: producer.classicAddress,
      CONSUMER_SEED: consumer.seed!,
      CONSUMER_ADDRESS: consumer.classicAddress,
      MPT_ID: mptId,
      AMM_ADDRESS: '',
    });

    console.log('[setup] Done!');

    return NextResponse.json({
      success: true,
      issuer: issuer.classicAddress,
      producer: producer.classicAddress,
      consumer: consumer.classicAddress,
      mptId,
      reusedWallets: hasWallets,
      reusedMpt: hasMpt,
    });
  } catch (error: any) {
    console.error(`[setup] Error at step "${step}":`, error);
    return NextResponse.json(
      { error: `Step "${step}" failed: ${error.message}` },
      { status: 500 }
    );
  }
}
