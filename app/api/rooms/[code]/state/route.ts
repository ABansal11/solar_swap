import { NextRequest, NextResponse } from 'next/server';
import { getClient } from '@/lib/xrpl';
import { getRoom } from '@/lib/rooms';
import { getBatteryState } from '@/lib/battery';
import { getOrderBook } from '@/lib/dex';
import { getAmmSpotPrice } from '@/lib/amm';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const upperCode = code.toUpperCase();

  const room = getRoom(upperCode);
  if (!room) {
    return NextResponse.json({ error: 'Room not found' }, { status: 404 });
  }

  try {
    const client = await getClient();

    const [battery, orderbookData, ammSpotPrice] = await Promise.all([
      Promise.resolve(getBatteryState(room.participants.size || 1)),
      getOrderBook(client, room.mptId),
      getAmmSpotPrice(client, room.mptId),
    ]);

    const { asks, bids } = orderbookData;

    let midPrice = ammSpotPrice;
    if (asks.length > 0 && bids.length > 0) {
      midPrice = (asks[0].pricePerKwh + bids[0].pricePerKwh) / 2;
    } else if (asks.length > 0) {
      midPrice = asks[0].pricePerKwh;
    }

    const participants = Array.from(room.participants.values()).map(p => ({
      id: p.id,
      name: p.name,
      houseId: p.houseId,
      address: p.wallet.classicAddress,
    }));

    // Pending counts for UI indicators
    const pendingEscrows = Array.from(room.pendingEscrows.values())
      .filter(e => e.status === 'pending_iot')
      .map(e => ({
        id: e.id,
        participantId: e.participantId,
        kWh: e.kWh,
        status: e.status,
        createdAt: e.createdAt,
        finishAfter: e.finishAfter,
        escrowTxHash: e.escrowTxHash,
      }));

    const pendingSettlementCount = room.pendingSettlement.length;

    const activeLoans = room.activeLoans.map(l => ({
      id: l.id,
      borrowerParticipantId: l.borrowerParticipantId,
      kWh: l.kWh,
      mptAmount: l.mptAmount,
      dueDateRippleTime: l.dueDateRippleTime,
      status: l.status,
      simulated: l.simulated,
    }));

    return NextResponse.json({
      participants,
      battery,
      orderbook: { asks, bids, midPrice, ammSpotPrice },
      co2SavedKg: room.co2SavedKg,
      location: room.location,
      pendingEscrows,
      pendingSettlementCount,
      activeLoans,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
