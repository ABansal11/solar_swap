import { NextResponse } from 'next/server';
import { getClient } from '@/lib/xrpl';
import { getMptId } from '@/lib/wallets';
import { getOrderBook } from '@/lib/dex';
import { getAmmSpotPrice } from '@/lib/amm';

export async function GET() {
  const mptId = getMptId();
  if (!mptId) {
    return NextResponse.json({ asks: [], bids: [], midPrice: 0.10, ammSpotPrice: 0.10, initialized: false });
  }

  try {
    const client = await getClient();
    const [{ asks, bids }, ammSpotPrice] = await Promise.all([
      getOrderBook(client, mptId),
      getAmmSpotPrice(client, mptId),
    ]);

    // Calculate mid price from order book or fall back to AMM
    let midPrice = ammSpotPrice;
    if (asks.length > 0 && bids.length > 0) {
      midPrice = (asks[0].pricePerKwh + bids[0].pricePerKwh) / 2;
    } else if (asks.length > 0) {
      midPrice = asks[0].pricePerKwh;
    }

    return NextResponse.json({ asks, bids, midPrice, ammSpotPrice, initialized: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message, asks: [], bids: [], midPrice: 0.10, ammSpotPrice: 0.10 }, { status: 500 });
  }
}
