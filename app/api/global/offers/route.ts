import { NextRequest, NextResponse } from 'next/server';
import { getRoom, getAllRoomsPublic } from '@/lib/rooms';
import { transmissionBreakdown } from '@/lib/geo';
import { getClient } from '@/lib/xrpl';
import { getAmmSpotPrice } from '@/lib/amm';
import { getBatteryState } from '@/lib/battery';

export async function GET(req: NextRequest) {
  const fromRoom = req.nextUrl.searchParams.get('fromRoom');
  if (!fromRoom) return NextResponse.json({ error: 'fromRoom required' }, { status: 400 });

  const buyerRoom = getRoom(fromRoom);
  if (!buyerRoom) return NextResponse.json({ error: 'Room not found' }, { status: 404 });

  const allRooms = getAllRoomsPublic();
  const otherRooms = allRooms.filter(r => r.code !== fromRoom);

  const client = await getClient();
  const battery = getBatteryState();

  const offers = await Promise.all(otherRooms.map(async (r) => {
    const sourceRoom = getRoom(r.code)!;
    const breakdown = transmissionBreakdown(sourceRoom.location, buyerRoom.location);
    let basePrice = 0.10;
    try { basePrice = await getAmmSpotPrice(client, sourceRoom.mptId); } catch {}

    const totalPrice = basePrice * breakdown.totalPriceMultiplier;
    const kWhDeliveredPer10Budgeted = (10 / totalPrice) * breakdown.kWhDeliveredPerSent;

    return {
      sourceRoom: r.code,
      sourceCity: sourceRoom.location.city,
      sourceCountry: sourceRoom.location.country,
      flag: sourceRoom.location.flag,
      region: sourceRoom.location.region,
      distanceKm: breakdown.distanceKm,
      feeRate: breakdown.feeRate,
      lossRate: breakdown.lossRate,
      basePrice,
      totalPrice,
      kWhDeliveredPer10Budgeted,
      participantCount: r.participantCount,
      batteryLevel: battery.level,
      isDemandResponse: battery.isDemandResponse,
    };
  }));

  return NextResponse.json(offers.sort((a, b) => a.totalPrice - b.totalPrice));
}
