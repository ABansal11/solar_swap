import { NextRequest, NextResponse } from 'next/server';
import { getClient } from '@/lib/xrpl';
import { getRoom, getParticipant, updateLoanStatus } from '@/lib/rooms';
import { repayCredit } from '@/lib/lending';

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
  const { participantId, loanId, rlusdAmount } = body;

  if (!participantId || !loanId || !rlusdAmount) {
    return NextResponse.json({ error: 'participantId, loanId, and rlusdAmount are required' }, { status: 400 });
  }

  const participant = getParticipant(upperCode, participantId);
  if (!participant) {
    return NextResponse.json({ error: 'Participant not found' }, { status: 404 });
  }

  const loan = room.activeLoans.find(l => l.id === loanId);
  if (!loan) {
    return NextResponse.json({ error: 'Loan not found' }, { status: 404 });
  }
  if (loan.borrowerParticipantId !== participantId) {
    return NextResponse.json({ error: 'Not your loan' }, { status: 403 });
  }
  if (loan.status === 'repaid') {
    return NextResponse.json({ error: 'Loan already repaid' }, { status: 400 });
  }

  try {
    const client = await getClient();

    const txHash = await repayCredit(
      client,
      participant.wallet,
      room.issuerWallet,
      loanId,
      rlusdAmount
    );

    updateLoanStatus(upperCode, loanId, 'repaid');

    return NextResponse.json({
      success: true,
      txHash,
      loanId,
      rlusdRepaid: rlusdAmount,
    });
  } catch (error: any) {
    console.error(`[rooms/${upperCode}/repay] Error:`, error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
