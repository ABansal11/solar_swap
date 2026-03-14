import { NextRequest, NextResponse } from 'next/server';
import { getClient } from '@/lib/xrpl';
import { getWalletsFromEnv, getMptId } from '@/lib/wallets';
import { mintSolar } from '@/lib/mpt';
import { createDexAsk } from '@/lib/dex';
import { getBatteryState, updateHouseBalance } from '@/lib/battery';
import { ammVote, getAmmSpotPrice } from '@/lib/amm';

export async function POST(req: NextRequest) {
  const wallets = getWalletsFromEnv();
  if (!wallets) return NextResponse.json({ error: 'Not initialized. Run /api/setup first.' }, { status: 400 });

  const mptId = getMptId();
  if (!mptId) return NextResponse.json({ error: 'MPT ID not found' }, { status: 400 });

  const battery = getBatteryState();

  // Hard reserve floor check
  if (battery.isReserveFloor) {
    return NextResponse.json({ error: 'RESERVE_FLOOR_REACHED', batteryLevel: battery.level }, { status: 403 });
  }

  const body = await req.json();
  const { kWh = 10, houseId = 1, minPricePerKwh } = body;

  try {
    const client = await getClient();

    // Demand response: vote to increase AMM fee
    let demandResponseTxHash: string | undefined;
    if (battery.isDemandResponse) {
      try {
        demandResponseTxHash = await ammVote(client, wallets.issuer, mptId, 300); // 3%
      } catch (e) {
        console.warn('AMMVote failed (possibly no AMM yet):', e);
      }
    }

    const spotPrice = await getAmmSpotPrice(client, mptId);
    const pricePerKwh = minPricePerKwh || spotPrice;

    // Scale: kWh * 100 (2 decimal places) = token amount
    const tokenAmount = Math.round(kWh * 100).toString();
    const rlusdAmount = (kWh * pricePerKwh).toFixed(6);

    const provenance = {
      houseId,
      generatedAt: Date.now(),
      solarKw: battery.houses[houseId - 1]?.solarOutput || 2.5,
      batteryLevel: battery.level,
    };

    // Mint SOLAR to producer
    const { txHash: mintTxHash } = await mintSolar(
      client,
      wallets.issuer,
      wallets.producer.classicAddress,
      mptId,
      tokenAmount,
      provenance
    );

    // Post DEX ask
    const { txHash: offerTxHash, sequence } = await createDexAsk(
      client,
      wallets.producer,
      mptId,
      tokenAmount,
      rlusdAmount,
      provenance
    );

    updateHouseBalance(houseId, kWh);

    return NextResponse.json({
      success: true,
      mintTxHash,
      offerTxHash,
      offerId: sequence,
      mptId,
      kWh,
      tokenAmount,
      pricePerKwh,
      rlusdAmount,
      provenance,
      demandResponseTxHash,
      batteryLevel: battery.level,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
