import { NextRequest, NextResponse } from 'next/server';
import { getClient } from '@/lib/xrpl';
import { getRoom, clearSettlements } from '@/lib/rooms';
import { buildAndSubmitBatch } from '@/lib/batch';

const MAX_BATCH_SIZE = 8; // XRPL Batch limit

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const upperCode = code.toUpperCase();

  const room = getRoom(upperCode);
  if (!room) {
    return NextResponse.json({ error: 'Room not found' }, { status: 404 });
  }

  const toSettle = room.pendingSettlement.slice(0, MAX_BATCH_SIZE);
  if (toSettle.length === 0) {
    return NextResponse.json({ message: 'No pending settlements', settledCount: 0 });
  }

  try {
    const client = await getClient();

    // Build settlement items with buyer wallets resolved from participants
    const settlements = toSettle.map(s => {
      const participant = room.participants.get(s.buyerParticipantId);
      if (!participant) throw new Error(`Participant ${s.buyerParticipantId} not found`);
      return {
        buyerWallet: participant.wallet,
        producerAddress: s.producerAddress,
        rlusdAmount: s.rlusdAmount,
      };
    });

    const result = await buildAndSubmitBatch(client, room.issuerWallet, settlements);

    // Clear settled items
    clearSettlements(upperCode, toSettle.map(s => s.id));

    const trades = toSettle.map(s => ({
      buyerParticipantId: s.buyerParticipantId,
      producerAddress: s.producerAddress,
      rlusdAmount: s.rlusdAmount,
      kWh: s.kWh,
    }));

    return NextResponse.json({
      success: true,
      txHash: result.txHash,
      settledCount: result.settledCount,
      totalRlusd: result.totalRlusd,
      atomic: result.atomic,
      trades,
    });
  } catch (error: any) {
    console.error(`[rooms/${upperCode}/batch-settle] Batch tx failed, falling back to individual settlements:`, error.message);

    // Fallback: Batch amendment may not be enabled — execute settlements individually
    try {
      const client = await getClient();
      const { createDexBid } = await import('@/lib/dex');
      const results: any[] = [];

      for (const s of toSettle) {
        const participant = room.participants.get(s.buyerParticipantId);
        if (!participant) continue;
        try {
          const r = await createDexBid(client, participant.wallet, room.mptId, s.rlusdAmount);
          results.push(r);
        } catch (e) {
          console.warn('[batch-settle fallback] Individual trade failed:', e);
        }
      }

      clearSettlements(upperCode, toSettle.map(s => s.id));

      return NextResponse.json({
        success: true,
        txHash: results[0]?.txHash ?? 'fallback',
        settledCount: results.length,
        totalRlusd: toSettle.reduce((s, t) => s + parseFloat(t.rlusdAmount), 0).toFixed(6),
        atomic: false,
        fallback: true,
        message: 'Batch amendment not enabled; settled individually',
      });
    } catch (fallbackError: any) {
      return NextResponse.json({ error: fallbackError.message }, { status: 500 });
    }
  }
}
