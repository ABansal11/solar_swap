import { NextRequest, NextResponse } from 'next/server';
import { getClient } from '@/lib/xrpl';
import { getRoom, getParticipant, incrementRoomCo2 } from '@/lib/rooms';
import { authorizeMpt, authorizeMptHolder } from '@/lib/mpt';
import { getOrderBook, createDexBid, cancelOffer } from '@/lib/dex';
import { ammSwap, getAmmSpotPrice } from '@/lib/amm';

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
  const { participantId, rlusdAmount = '1' } = body;

  if (!participantId) {
    return NextResponse.json({ error: 'participantId is required' }, { status: 400 });
  }

  const participant = getParticipant(upperCode, participantId);
  if (!participant) {
    return NextResponse.json({ error: 'Participant not found' }, { status: 404 });
  }

  try {
    const client = await getClient();

    // Ensure participant is authorized (idempotent)
    try {
      await authorizeMpt(client, participant.wallet, room.mptId);
    } catch {}
    try {
      await authorizeMptHolder(client, room.issuerWallet, participant.wallet.classicAddress, room.mptId);
    } catch {}

    // Check order book for fresh asks
    const { asks } = await getOrderBook(client, room.mptId);

    // Cancel expired offers (best effort)
    for (const ask of asks.filter(a => a.expired)) {
      try {
        await cancelOffer(client, participant.wallet, ask.sequence);
      } catch (e) {
        console.warn('[rooms/buy] Failed to cancel expired offer:', e);
      }
    }

    const freshAsks = asks.filter(a => !a.expired);

    let txHash: string;
    let solarReceived: number;
    let provenance: any;
    let source: 'DEX' | 'AMM';

    if (freshAsks.length > 0) {
      // DEX: match against best ask
      const result = await createDexBid(client, participant.wallet, room.mptId, rlusdAmount);
      txHash = result.txHash;
      solarReceived = result.solarReceived;
      provenance = freshAsks[0].provenance;
      source = 'DEX';
    } else {
      // AMM fallback
      const result = await ammSwap(client, participant.wallet, room.mptId, rlusdAmount);
      txHash = result.txHash;
      solarReceived = result.solarReceived;
      provenance = { houseId: 0, source: 'neighborhood pool' };
      source = 'AMM';
    }

    const kWh = solarReceived / 100; // scale back from token units
    const co2Saved = kWh * 0.386;
    incrementRoomCo2(upperCode, co2Saved);

    const spotPrice = await getAmmSpotPrice(client, room.mptId);

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
    console.error(`[rooms/${upperCode}/buy] Error:`, error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
