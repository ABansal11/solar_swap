import { NextRequest, NextResponse } from 'next/server';
import { getClient } from '@/lib/xrpl';
import { getRoom } from '@/lib/rooms';
import { convertHexToString } from 'xrpl';

interface Trade {
  txHash: string;
  type: 'mint' | 'buy' | 'trade';
  from: string;
  to: string;
  amount: string;
  timestamp: number;
  participant?: { id: string; name: string; houseId: number };
  provenance?: {
    houseId: number;
    generatedAt: number;
    solarKw: number;
  };
  co2Saved?: number;
}

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

  if (room.participants.size === 0) {
    return NextResponse.json({ trades: [] });
  }

  try {
    const client = await getClient();

    const participantList = Array.from(room.participants.values());

    // Fetch transactions for all participants in parallel
    const txResults = await Promise.allSettled(
      participantList.map(p =>
        client.request({
          command: 'account_tx',
          account: p.wallet.classicAddress,
          limit: 10,
        }).then(r => ({ participant: p, transactions: r.result.transactions }))
      )
    );

    const trades: Trade[] = [];

    for (const result of txResults) {
      if (result.status !== 'fulfilled') continue;
      const { participant, transactions } = result.value;

      for (const t of transactions) {
        const tx = t.tx_json as any;
        if (!tx) continue;
        if (tx.TransactionType !== 'Payment' && tx.TransactionType !== 'OfferCreate' && tx.TransactionType !== 'EscrowFinish') continue;

        let provenance;
        if (tx.Memos?.[0]?.Memo?.MemoData) {
          try {
            const decoded = convertHexToString(tx.Memos[0].Memo.MemoData);
            provenance = JSON.parse(decoded);
          } catch {}
        }

        const amount = tx.Amount;
        let amountStr: string;
        let kWh = 0;

        if (tx.TransactionType === 'EscrowFinish') {
          amountStr = '1.00 XRP (bond released)';
        } else if (typeof amount === 'string') {
          amountStr = `${(parseInt(amount) / 1000000).toFixed(2)} XRP`;
        } else if (amount?.mpt_issuance_id) {
          // MPT value is raw tokens; AssetScale=2 means 100 raw = 1 kWh
          const rawTokens = parseFloat(amount.value || '0');
          kWh = rawTokens / 100;
          amountStr = `${kWh.toFixed(2)} kWh SOLAR`;
        } else {
          amountStr = `${parseFloat(amount?.value || '0').toFixed(4)} ${amount?.currency || ''}`;
        }

        trades.push({
          txHash: tx.hash || (t as any).hash || '',
          type: tx.TransactionType === 'Payment' ? 'mint' : 'trade',
          from: tx.Account || '',
          to: tx.Destination || '',
          amount: amountStr,
          timestamp: tx.date ? (tx.date + 946684800) * 1000 : Date.now(),
          participant: { id: participant.id, name: participant.name, houseId: participant.houseId },
          provenance,
          co2Saved: kWh * 0.386,
        });
      }
    }

    // Sort by timestamp descending
    trades.sort((a, b) => b.timestamp - a.timestamp);

    return NextResponse.json({ trades: trades.slice(0, 30) });
  } catch (error: any) {
    return NextResponse.json({ error: error.message, trades: [] });
  }
}
