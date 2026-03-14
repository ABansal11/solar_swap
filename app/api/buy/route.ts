import { NextRequest, NextResponse } from 'next/server';
import { getClient } from '@/lib/xrpl';
import { getWalletsFromEnv, getMptId } from '@/lib/wallets';
import { getOrderBook, createDexBid, cancelOffer } from '@/lib/dex';
import { ammSwap, getAmmSpotPrice } from '@/lib/amm';
import { incrementCo2, updateHouseBalance } from '@/lib/battery';

export async function POST(req: NextRequest) {
  const wallets = getWalletsFromEnv();
  if (!wallets) return NextResponse.json({ error: 'Not initialized. Run /api/setup first.' }, { status: 400 });

  const mptId = getMptId();
  if (!mptId) return NextResponse.json({ error: 'MPT ID not found' }, { status: 400 });

  const body = await req.json();
  const { rlusdAmount = '1' } = body;

  try {
    const client = await getClient();

    // Check order book for fresh asks
    const { asks } = await getOrderBook(client, mptId);

    // Cancel expired offers
    for (const ask of asks.filter(a => a.expired)) {
      try {
        await cancelOffer(client, wallets.producer, ask.sequence);
      } catch (e) {
        console.warn('Failed to cancel expired offer:', e);
      }
    }

    const freshAsks = asks.filter(a => !a.expired);

    let txHash: string;
    let solarReceived: number;
    let provenance: any;
    let source: 'DEX' | 'AMM';

    if (freshAsks.length > 0) {
      // DEX: match against best ask
      const result = await createDexBid(client, wallets.consumer, mptId, rlusdAmount);
      txHash = result.txHash;
      solarReceived = result.solarReceived;
      provenance = freshAsks[0].provenance;
      source = 'DEX';
    } else {
      // AMM fallback
      const result = await ammSwap(client, wallets.consumer, mptId, rlusdAmount);
      txHash = result.txHash;
      solarReceived = result.solarReceived;
      provenance = { houseId: 0, source: 'neighborhood pool' };
      source = 'AMM';
    }

    const kWh = solarReceived / 100; // scale back from token units
    incrementCo2(kWh);

    if (provenance?.houseId) {
      updateHouseBalance(provenance.houseId, -kWh);
    }

    const spotPrice = await getAmmSpotPrice(client, mptId);

    return NextResponse.json({
      success: true,
      txHash,
      kWh,
      solarReceived,
      rlusdSpent: rlusdAmount,
      provenance,
      source,
      spotPrice,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
