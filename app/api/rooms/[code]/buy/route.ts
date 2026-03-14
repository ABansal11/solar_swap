import { NextRequest, NextResponse } from 'next/server';
import { getClient } from '@/lib/xrpl';
import { getRoom, getParticipant, incrementRoomCo2, addPendingSettlement } from '@/lib/rooms';
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
  const { participantId, rlusdAmount = '1', forceImmediate = false } = body;

  if (!participantId) {
    return NextResponse.json({ error: 'participantId is required' }, { status: 400 });
  }

  const participant = getParticipant(upperCode, participantId);
  if (!participant) {
    return NextResponse.json({ error: 'Participant not found' }, { status: 404 });
  }

  const amount = parseFloat(rlusdAmount);

  // Queue micro-trades (≤ 2 RLUSD) for batch settlement unless forced immediate
  if (amount <= 2 && !forceImmediate) {
    try {
      const client = await getClient();
      const spotPrice = await getAmmSpotPrice(client, room.mptId);
      const kWh = amount / spotPrice;

      // Find a producer address from the order book (best ask)
      const { asks } = await getOrderBook(client, room.mptId);
      const freshAsks = asks.filter(a => !a.expired);
      const producerAddress = freshAsks[0]?.account ?? room.issuerWallet.classicAddress;

      addPendingSettlement(upperCode, {
        id: crypto.randomUUID(),
        buyerParticipantId: participantId,
        producerAddress,
        rlusdAmount: amount.toFixed(6),
        kWh,
        queuedAt: Date.now(),
      });

      const pendingCount = room.pendingSettlement.length;

      return NextResponse.json({
        status: 'queued',
        pendingCount,
        rlusdAmount,
        kWh: kWh.toFixed(2),
        message: `Trade queued for batch settlement (${pendingCount} pending)`,
      });
    } catch (error: any) {
      console.error(`[rooms/${upperCode}/buy] Queue error:`, error);
      // Fall through to immediate execution on error
    }
  }

  // Immediate execution (amount > 2 RLUSD or forceImmediate=true)
  try {
    const client = await getClient();

    try { await authorizeMpt(client, participant.wallet, room.mptId); } catch {}
    try { await authorizeMptHolder(client, room.issuerWallet, participant.wallet.classicAddress, room.mptId); } catch {}

    const { asks } = await getOrderBook(client, room.mptId);

    for (const ask of asks.filter(a => a.expired)) {
      try { await cancelOffer(client, participant.wallet, ask.sequence); } catch {}
    }

    const freshAsks = asks.filter(a => !a.expired);

    let txHash: string;
    let solarReceived: number;
    let provenance: any;
    let source: 'DEX' | 'AMM';

    if (freshAsks.length > 0) {
      const result = await createDexBid(client, participant.wallet, room.mptId, rlusdAmount);
      txHash = result.txHash;
      solarReceived = result.solarReceived;
      provenance = freshAsks[0].provenance;
      source = 'DEX';
    } else {
      const result = await ammSwap(client, participant.wallet, room.mptId, rlusdAmount);
      txHash = result.txHash;
      solarReceived = result.solarReceived;
      provenance = { houseId: 0, source: 'neighborhood pool' };
      source = 'AMM';
    }

    const kWh = solarReceived / 100;
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
