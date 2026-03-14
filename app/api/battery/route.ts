import { NextResponse } from 'next/server';
import { getBatteryState } from '@/lib/battery';

export async function GET() {
  return NextResponse.json(getBatteryState());
}
