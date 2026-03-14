import { NextRequest, NextResponse } from 'next/server';
import { getRoom } from '@/lib/rooms';

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

  const now = Date.now();
  const escrows = Array.from(room.pendingEscrows.values()).map(e => {
    const elapsedSec = Math.floor((now - e.createdAt) / 1000);
    const remainingSec = Math.max(0, 35 - elapsedSec);
    return {
      id: e.id,
      participantId: e.participantId,
      kWh: e.kWh,
      status: e.status,
      houseId: e.provenance.houseId,
      createdAt: e.createdAt,
      escrowTxHash: e.escrowTxHash,
      remainingSec,
    };
  });

  return NextResponse.json({ escrows });
}
