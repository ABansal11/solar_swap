export interface House {
  id: number;
  solarOutput: number; // kW currently generating
  balance: number; // SOLAR tokens
  isProducing: boolean;
  x: number; // SVG position
  y: number; // SVG position
}

export interface BatteryState {
  level: number; // 0-100
  trend: 'charging' | 'discharging';
  isDemandResponse: boolean; // level < 30
  isReserveFloor: boolean; // level < 20
  timeOfDay: 'peak' | 'offpeak';
  houses: House[];
  co2SavedKg: number;
}

let co2SavedKg = 0;
const houseBalances: Record<number, number> = {};

export function incrementCo2(kWh: number): void {
  co2SavedKg += kWh * 0.386;
}

export function updateHouseBalance(houseId: number, delta: number): void {
  houseBalances[houseId] = Math.max(0, (houseBalances[houseId] || 0) + delta);
}

// Compute house positions evenly around a circle in SVG space.
// Center: (250, 200), radius: 140, starting from the top (−π/2).
function computeHousePositions(count: number): { x: number; y: number }[] {
  const CX = 250, CY = 200, R = 140;
  return Array.from({ length: count }, (_, i) => {
    const angle = (2 * Math.PI * i / count) - Math.PI / 2;
    return {
      x: Math.round(CX + R * Math.cos(angle)),
      y: Math.round(CY + R * Math.sin(angle)),
    };
  });
}

export function getBatteryState(houseCount = 6): BatteryState {
  const count = Math.max(1, houseCount);
  const now = Date.now();
  // Demo mode: battery cycles 40–80% over ~3 minutes
  const sinVal = Math.sin(now / 30000);
  const level = Math.round(sinVal * 20 + 60); // 40–80 range

  // Demo mode: cycle peak/off-peak every 3 minutes (last 60s of each 3-min window = peak)
  const cycleSecs = Math.floor(now / 1000) % 180;
  const timeOfDay: 'peak' | 'offpeak' = cycleSecs >= 120 ? 'peak' : 'offpeak';

  const positions = computeHousePositions(count);

  const houses: House[] = positions.map((pos, i) => {
    const id = i + 1;
    const producing = level > 50 && (id % 2 === 0 ? sinVal > -0.3 : sinVal > 0.2);
    const solarOutput = producing
      ? Math.round((level / 100) * 3 + Math.sin(now / 6000 + id) * 0.5) * 10 / 10
      : 0;
    return {
      id,
      solarOutput,
      balance: houseBalances[id] || 0,
      isProducing: producing,
      x: pos.x,
      y: pos.y,
    };
  });

  return {
    level,
    trend: sinVal > 0 ? 'charging' : 'discharging',
    isDemandResponse: level < 30,
    isReserveFloor: level < 20,
    timeOfDay,
    houses,
    co2SavedKg,
  };
}
