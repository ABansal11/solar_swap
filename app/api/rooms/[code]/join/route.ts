import { NextRequest, NextResponse } from 'next/server';
import { getClient } from '@/lib/xrpl';
import { authorizeMpt, authorizeMptHolder, setTrustLine } from '@/lib/mpt';
import { getRoom, joinRoom } from '@/lib/rooms';

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const upperCode = code.toUpperCase();
  let step = 'lookup_room';

  try {
    const room = getRoom(upperCode);
    if (!room) {
      return NextResponse.json({ error: 'Room not found' }, { status: 404 });
    }
    if (room.participants.size >= 6) {
      return NextResponse.json({ error: 'Room is full (max 6 participants)' }, { status: 400 });
    }

    const body = await req.json();
    const { name } = body;
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    const client = await getClient();

    step = 'fund_participant';
    console.log(`[rooms/${upperCode}/join] Funding participant wallet for "${name}"...`);
    // Add delay to respect faucet rate limiting
    await sleep(1500);
    const { wallet: participantWallet } = await client.fundWallet();
    console.log(`[rooms/${upperCode}/join] Participant wallet:`, participantWallet.classicAddress);

    step = 'authorize_mpt_participant';
    console.log(`[rooms/${upperCode}/join] Participant opting into MPT...`);
    try {
      await authorizeMpt(client, participantWallet, room.mptId);
    } catch (e) {
      console.warn(`[rooms/${upperCode}/join] authorizeMpt failed (may already be opted in):`, e);
    }

    step = 'authorize_mpt_holder';
    console.log(`[rooms/${upperCode}/join] Issuer approving participant...`);
    try {
      await authorizeMptHolder(client, room.issuerWallet, participantWallet.classicAddress, room.mptId);
    } catch (e) {
      console.warn(`[rooms/${upperCode}/join] authorizeMptHolder failed (may already be approved):`, e);
    }

    step = 'set_trustline';
    console.log(`[rooms/${upperCode}/join] Setting RLUSD trustline...`);
    try {
      await setTrustLine(client, participantWallet);
    } catch (e) {
      console.warn(`[rooms/${upperCode}/join] setTrustLine failed (may already be set):`, e);
    }

    step = 'add_participant';
    const result = joinRoom(upperCode, name.trim(), participantWallet);
    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    const { participant } = result;
    console.log(`[rooms/${upperCode}/join] Participant joined: ${participant.id} as House ${participant.houseId}`);

    return NextResponse.json({
      participantId: participant.id,
      houseId: participant.houseId,
      address: participantWallet.classicAddress,
      name: participant.name,
    });
  } catch (error: any) {
    console.error(`[rooms/${upperCode}/join] Error at step "${step}":`, error);
    return NextResponse.json({ error: `Step "${step}" failed: ${error.message}` }, { status: 500 });
  }
}
