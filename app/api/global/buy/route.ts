import { NextRequest, NextResponse } from 'next/server';
import { getRoom, getParticipant, incrementRoomCo2 } from '@/lib/rooms';
import { ensureBridgeAuthorizedInRoom, executeCrossNeighborhoodTrade } from '@/lib/bridge';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { buyerRoomCode, participantId, sourceRoomCode, rlusdBudget } = body;

  if (!buyerRoomCode || !participantId || !sourceRoomCode || !rlusdBudget) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const buyerRoom = getRoom(buyerRoomCode);
  if (!buyerRoom) return NextResponse.json({ error: 'Buyer room not found' }, { status: 404 });

  const sourceRoom = getRoom(sourceRoomCode);
  if (!sourceRoom) return NextResponse.json({ error: 'Source room not found' }, { status: 404 });

  const participant = getParticipant(buyerRoomCode, participantId);
  if (!participant) return NextResponse.json({ error: 'Participant not found' }, { status: 404 });

  try {
    await ensureBridgeAuthorizedInRoom(buyerRoom);

    const result = await executeCrossNeighborhoodTrade({
      buyerRoom,
      buyerParticipant: participant,
      sourceRoom,
      rlusdBudget: String(rlusdBudget),
    });

    incrementRoomCo2(buyerRoomCode, result.kWhDelivered * 0.386);

    return NextResponse.json({
      success: true,
      ...result,
      summary: `Imported ${result.kWhDelivered.toFixed(2)} kWh from ${sourceRoom.location.city} | ${Math.round(result.feeRate * 100)}% transmission fee | ${result.distanceKm.toLocaleString()} km`,
    });
  } catch (error: any) {
    console.error('[global/buy] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
