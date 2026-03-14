import { NextRequest, NextResponse } from 'next/server';
import { getClient } from '@/lib/xrpl';
import { getRoom, getParticipant } from '@/lib/rooms';
import { mintSolar, authorizeMpt, authorizeMptHolder } from '@/lib/mpt';
import { createDexAsk } from '@/lib/dex';
import { getBatteryState } from '@/lib/battery';
import { getAmmSpotPrice, ammVote } from '@/lib/amm';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const upperCode = code.toUpperCase();

  const room = getRoom(upperCode);
  if (!room) {
    return NextResponse.json({ error: 'Room not found' }, { status: 404 });
  }

  const body = await req.json();
  const { participantId, kWh = 10, minPricePerKwh } = body;

  if (!participantId) {
    return NextResponse.json({ error: 'participantId is required' }, { status: 400 });
  }

  const participant = getParticipant(upperCode, participantId);
  if (!participant) {
    return NextResponse.json({ error: 'Participant not found' }, { status: 404 });
  }

  const battery = getBatteryState();
  if (battery.isReserveFloor) {
    return NextResponse.json({ error: 'RESERVE_FLOOR_REACHED', batteryLevel: battery.level }, { status: 403 });
  }

  try {
    const client = await getClient();

    // Demand response: vote to increase AMM fee
    if (battery.isDemandResponse) {
      try {
        await ammVote(client, room.issuerWallet, room.mptId, 300); // 3%
      } catch (e) {
        console.warn('[rooms/mint] AMMVote failed (possibly no AMM yet):', e);
      }
    }

    // Ensure participant is still authorized (idempotent)
    try {
      await authorizeMpt(client, participant.wallet, room.mptId);
    } catch {}
    try {
      await authorizeMptHolder(client, room.issuerWallet, participant.wallet.classicAddress, room.mptId);
    } catch {}

    const spotPrice = await getAmmSpotPrice(client, room.mptId);
    const pricePerKwh = minPricePerKwh || spotPrice;

    // Scale: kWh * 100 = token amount (2 decimal places)
    const tokenAmount = Math.round(kWh * 100).toString();
    const rlusdAmount = (kWh * pricePerKwh).toFixed(6);

    const provenance = {
      houseId: participant.houseId,
      generatedAt: Date.now(),
      solarKw: battery.houses[participant.houseId - 1]?.solarOutput || 2.5,
      batteryLevel: battery.level,
    };

    // Mint SOLAR to participant's wallet
    const { txHash: mintTxHash } = await mintSolar(
      client,
      room.issuerWallet,
      participant.wallet.classicAddress,
      room.mptId,
      tokenAmount,
      provenance
    );

    // Post DEX ask from participant's wallet
    const { txHash: offerTxHash, sequence } = await createDexAsk(
      client,
      participant.wallet,
      room.mptId,
      tokenAmount,
      rlusdAmount,
      provenance
    );

    return NextResponse.json({
      success: true,
      txHash: offerTxHash,
      mintTxHash,
      offerId: sequence,
      kWh,
      tokenAmount,
      pricePerKwh,
      rlusdAmount,
      provenance,
    });
  } catch (error: any) {
    console.error(`[rooms/${upperCode}/mint] Error:`, error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
