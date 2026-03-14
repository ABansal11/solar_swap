import { NextResponse } from 'next/server';
import { getAllRoomsPublic } from '@/lib/rooms';
import { getBatteryState } from '@/lib/battery';
import { getClient } from '@/lib/xrpl';
import { getAmmSpotPrice } from '@/lib/amm';

export async function GET() {
  const rooms = getAllRoomsPublic();
  const battery = getBatteryState();

  const client = await getClient();
  const enriched = await Promise.all(rooms.map(async (room) => {
    let pricePerKwh = 0.10;
    try {
      pricePerKwh = await getAmmSpotPrice(client, room.mptId);
    } catch {}
    return {
      ...room,
      batteryLevel: battery.level,
      isDemandResponse: battery.isDemandResponse,
      pricePerKwh,
    };
  }));

  return NextResponse.json(enriched);
}
