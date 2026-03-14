import { NextRequest, NextResponse } from 'next/server';
import { getClient } from '@/lib/xrpl';
import { getRoom, getParticipant, addActiveLoan } from '@/lib/rooms';
import { createEnergyCredit } from '@/lib/lending';
import { getRippleTime } from '@/lib/escrow';

const MAX_BORROW_KWH = 10;

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
  const { participantId, kWh = 5 } = body;

  if (!participantId) {
    return NextResponse.json({ error: 'participantId is required' }, { status: 400 });
  }

  const participant = getParticipant(upperCode, participantId);
  if (!participant) {
    return NextResponse.json({ error: 'Participant not found' }, { status: 404 });
  }

  if (kWh > MAX_BORROW_KWH) {
    return NextResponse.json({ error: `Max borrow is ${MAX_BORROW_KWH} kWh` }, { status: 400 });
  }

  // Check for existing active loans
  const existingLoan = room.activeLoans.find(
    l => l.borrowerParticipantId === participantId && l.status === 'active'
  );
  if (existingLoan) {
    return NextResponse.json({
      error: 'Repay your existing credit line before borrowing again',
      existingLoanId: existingLoan.id,
    }, { status: 400 });
  }

  try {
    const client = await getClient();

    const { loanTxHash, mintTxHash, loanId, simulated } = await createEnergyCredit(
      client,
      room.issuerWallet,
      participant.wallet,
      room.mptId,
      kWh
    );

    const mptAmount = Math.round(kWh * 100).toString();
    const dueDateRippleTime = getRippleTime() + 86400; // 24h

    addActiveLoan(upperCode, {
      id: loanId,
      borrowerParticipantId: participantId,
      kWh,
      mptAmount,
      dueDateRippleTime,
      status: 'active',
      loanTxHash,
      simulated,
    });

    return NextResponse.json({
      success: true,
      loanId,
      loanTxHash,
      mintTxHash,
      kWh,
      mptAmount,
      dueDateRippleTime,
      simulated,
      message: simulated
        ? `${kWh} kWh credit issued (server-tracked — Loan amendment pending on testnet)`
        : `${kWh} kWh credit line created on-chain via LoanSet`,
    });
  } catch (error: any) {
    console.error(`[rooms/${upperCode}/borrow] Error:`, error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
