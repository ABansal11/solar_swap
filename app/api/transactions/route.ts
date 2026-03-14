import { NextResponse } from 'next/server';
import { getClient } from '@/lib/xrpl';
import { getWalletsFromEnv } from '@/lib/wallets';
import { convertHexToString } from 'xrpl';

interface Trade {
  txHash: string;
  type: 'mint' | 'buy' | 'trade';
  from: string;
  to: string;
  amount: string;
  timestamp: number;
  provenance?: {
    houseId: number;
    generatedAt: number;
    solarKw: number;
  };
  co2Saved?: number;
}

export async function GET() {
  const wallets = getWalletsFromEnv();
  if (!wallets) {
    return NextResponse.json({ trades: [] });
  }

  try {
    const client = await getClient();

    const result = await client.request({
      command: 'account_tx',
      account: wallets.producer.classicAddress,
      limit: 20,
    });

    const trades: Trade[] = result.result.transactions
      .filter((t: any) => t.tx_json?.TransactionType === 'Payment' || t.tx_json?.TransactionType === 'OfferCreate')
      .map((t: any) => {
        let provenance;
        if (t.tx_json?.Memos?.[0]?.Memo?.MemoData) {
          try {
            const decoded = convertHexToString(t.tx_json.Memos[0].Memo.MemoData);
            provenance = JSON.parse(decoded);
          } catch {}
        }

        const amount = t.tx_json?.Amount;
        const amountStr = typeof amount === 'string'
          ? `${(parseInt(amount) / 1000000).toFixed(2)} XRP`
          : `${parseFloat(amount?.value || '0').toFixed(2)} ${amount?.mpt_issuance_id ? 'SOLAR' : (amount?.currency || '')}`;

        const kWh = provenance ? parseFloat(amountStr) / 100 : 0;

        return {
          txHash: t.tx_json?.hash || t.hash,
          type: t.tx_json?.TransactionType === 'Payment' ? 'mint' : 'trade',
          from: t.tx_json?.Account || '',
          to: t.tx_json?.Destination || '',
          amount: amountStr,
          timestamp: t.tx_json?.date ? (t.tx_json.date + 946684800) * 1000 : Date.now(),
          provenance,
          co2Saved: kWh * 0.386,
        };
      });

    return NextResponse.json({ trades });
  } catch (error: any) {
    return NextResponse.json({ error: error.message, trades: [] });
  }
}
