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
const houseBalances: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };

export function incrementCo2(kWh: number): void {
  co2SavedKg += kWh * 0.386;
}

export function updateHouseBalance(houseId: number, delta: number): void {
  houseBalances[houseId] = Math.max(0, (houseBalances[houseId] || 0) + delta);
}

// Hexagon positions for 6 houses around center (SVG coords, center at 250,200)
const HOUSE_POSITIONS = [
  { x: 250, y: 60 },   // top
  { x: 390, y: 130 },  // top-right
  { x: 390, y: 270 },  // bottom-right
  { x: 250, y: 340 },  // bottom
  { x: 110, y: 270 },  // bottom-left
  { x: 110, y: 130 },  // top-left
];

export function getBatteryState(): BatteryState {
  const now = Date.now();
  // sin-based oscillation: 40-80% range, period ~5 minutes for demo
  const sinVal = Math.sin(now / 300000);
  const level = Math.round(sinVal * 20 + 60); // 40-80 range

  const hour = new Date().getHours();
  const timeOfDay = (hour >= 17 && hour < 21) ? 'peak' : 'offpeak';

  const houses: House[] = HOUSE_POSITIONS.map((pos, i) => {
    const id = i + 1;
    // Alternate houses produce during day, others at different times
    const producing = level > 50 && (id % 2 === 0 ? sinVal > -0.3 : sinVal > 0.2);
    const solarOutput = producing ? Math.round((level / 100) * 3 + Math.sin(now / 60000 + id) * 0.5) * 10 / 10 : 0;
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
