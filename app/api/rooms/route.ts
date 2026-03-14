import { NextRequest, NextResponse } from 'next/server';
import { getClient } from '@/lib/xrpl';
import {
  createMptIssuance,
  authorizeMpt,
  authorizeMptHolder,
  setTrustLine,
  mintSolar,
  acquireRlusd,
} from '@/lib/mpt';
import { createAmm } from '@/lib/amm';
import { createRoom, generateCode } from '@/lib/rooms';
import { getCityByName, CITIES } from '@/lib/geo';

// Seed the AMM with 100 SOLAR tokens (1 kWh) and 0.10 RLUSD → 0.10 RLUSD/kWh starting price.
// Raw token amount: 1 kWh × 100 = 100 tokens
const AMM_SEED_SOLAR_RAW = '100';
const AMM_SEED_RLUSD     = '0.10';

export async function POST(req: NextRequest) {
  let step = 'connect';
  try {
    const body = await req.json().catch(() => ({}));
    const city: string | undefined = body?.city;
    const location = (city ? getCityByName(city) : undefined) ?? CITIES[0];

    const client = await getClient();

    step = 'fund_issuer';
    console.log('[rooms/create] Funding issuer wallet...');
    const { wallet: issuerWallet } = await client.fundWallet();
    console.log('[rooms/create] Issuer:', issuerWallet.classicAddress);

    step = 'create_mpt';
    console.log('[rooms/create] Creating MPT issuance...');
    const mptId = await createMptIssuance(client, issuerWallet);
    console.log('[rooms/create] MPT ID:', mptId);

    // Authorize issuer to hold its own MPT (needed to seed the AMM)
    step = 'authorize_issuer_mpt';
    try { await authorizeMpt(client, issuerWallet, mptId); } catch {}
    try { await authorizeMptHolder(client, issuerWallet, issuerWallet.classicAddress, mptId); } catch {}

    // Set RLUSD trustline on issuer
    step = 'issuer_trustline';
    try { await setTrustLine(client, issuerWallet); } catch {}

    // Try to acquire RLUSD for the issuer so it can seed the AMM
    step = 'acquire_rlusd';
    const gotRlusd = await acquireRlusd(client, issuerWallet, AMM_SEED_RLUSD);

    // Seed the AMM if RLUSD was acquired
    if (gotRlusd) {
      step = 'mint_solar_for_amm';
      console.log('[rooms/create] Minting bootstrap SOLAR for AMM...');
      const bootstrapProvenance = {
        houseId: 0,
        generatedAt: Date.now(),
        solarKw: 0,
        batteryLevel: 100,
      };
      try {
        await mintSolar(client, issuerWallet, issuerWallet.classicAddress, mptId, AMM_SEED_SOLAR_RAW, bootstrapProvenance);

        step = 'create_amm';
        console.log('[rooms/create] Creating AMM...');
        await createAmm(client, issuerWallet, mptId, AMM_SEED_SOLAR_RAW, AMM_SEED_RLUSD);
        console.log('[rooms/create] AMM seeded at 0.10 RLUSD/kWh');
      } catch (e) {
        console.warn('[rooms/create] AMM creation failed (continuing without AMM):', e);
      }
    } else {
      console.warn('[rooms/create] Could not acquire RLUSD — AMM not seeded. Buy fallback will be unavailable until a DEX ask exists.');
    }

    step = 'create_room';
    const code = generateCode();
    createRoom(code, issuerWallet, mptId, location);
    console.log('[rooms/create] Room created:', code, 'in', location.city);

    return NextResponse.json({
      code,
      issuer: issuerWallet.classicAddress,
      mptId,
      ammSeeded: gotRlusd,
    });
  } catch (error: any) {
    console.error(`[rooms/create] Error at step "${step}":`, error);
    return NextResponse.json({ error: `Step "${step}" failed: ${error.message}` }, { status: 500 });
  }
}
