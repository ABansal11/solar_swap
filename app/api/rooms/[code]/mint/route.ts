import { NextRequest, NextResponse } from 'next/server';
import { getClient } from '@/lib/xrpl';
import { getRoom, getParticipant, addPendingEscrow } from '@/lib/rooms';
import { authorizeMpt, authorizeMptHolder } from '@/lib/mpt';
import { getAmmSpotPrice, ammVote } from '@/lib/amm';
import { getBatteryState } from '@/lib/battery';
import { createDeliveryEscrow, scheduleIoTVerification } from '@/lib/escrow';

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
        await ammVote(client, room.issuerWallet, room.mptId, 300);
      } catch (e) {
        console.warn('[rooms/mint] AMMVote failed:', e);
      }
    }

    // Ensure participant is authorized (idempotent)
    try { await authorizeMpt(client, participant.wallet, room.mptId); } catch {}
    try { await authorizeMptHolder(client, room.issuerWallet, participant.wallet.classicAddress, room.mptId); } catch {}

    const spotPrice = await getAmmSpotPrice(client, room.mptId);
    const pricePerKwh = minPricePerKwh || spotPrice;

    const provenance = {
      houseId: participant.houseId,
      generatedAt: Date.now(),
      solarKw: battery.houses[participant.houseId - 1]?.solarOutput || 2.5,
      batteryLevel: battery.level,
    };

    // Create delivery bond escrow (producer stakes 1 XRP until IoT confirms kWh delivery)
    const { escrowSequence, finishAfter, cancelAfter, txHash: escrowTxHash } =
      await createDeliveryEscrow(client, participant.wallet, kWh);

    const escrowId = crypto.randomUUID();

    addPendingEscrow(upperCode, {
      id: escrowId,
      participantId,
      escrowSequence,
      kWh,
      provenance,
      status: 'pending_iot',
      createdAt: Date.now(),
      finishAfter,
      escrowTxHash,
    });

    // Schedule IoT verification: EscrowFinish + mint fires ~40s later (after FinishAfter=35s)
    scheduleIoTVerification(
      upperCode,
      escrowId,
      escrowSequence,
      participant.wallet,
      room.issuerWallet,
      room.mptId,
      kWh,
      provenance
    );

    return NextResponse.json({
      status: 'pending_iot',
      escrowId,
      escrowTxHash,
      verifyingIn: 35,
      kWh,
      pricePerKwh,
      houseId: participant.houseId,
      provenance,
    });
  } catch (error: any) {
    console.error(`[rooms/${upperCode}/mint] Error:`, error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
