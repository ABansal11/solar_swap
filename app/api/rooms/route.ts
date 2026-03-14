import { NextRequest, NextResponse } from 'next/server';
import { getClient } from '@/lib/xrpl';
import { createMptIssuance } from '@/lib/mpt';
import { createRoom, generateCode } from '@/lib/rooms';
import { getCityByName, CITIES } from '@/lib/geo';

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

    step = 'create_room';
    const code = generateCode();
    createRoom(code, issuerWallet, mptId, location);
    console.log('[rooms/create] Room created:', code, 'in', location.city);

    return NextResponse.json({
      code,
      issuer: issuerWallet.classicAddress,
      mptId,
    });
  } catch (error: any) {
    console.error(`[rooms/create] Error at step "${step}":`, error);
    return NextResponse.json({ error: `Step "${step}" failed: ${error.message}` }, { status: 500 });
  }
}
