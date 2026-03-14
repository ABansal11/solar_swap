export interface CityOption {
  city: string;
  country: string;
  flag: string;
  lat: number;
  lng: number;
  region: 'NA' | 'EU' | 'APAC' | 'SA' | 'AF';
  solarPotential: 'high' | 'medium' | 'low';
}

export const CITIES: CityOption[] = [
  { city: 'San Francisco', country: 'USA',       flag: '🇺🇸', lat: 37.77,  lng: -122.42, region: 'NA',   solarPotential: 'high' },
  { city: 'New York',      country: 'USA',       flag: '🇺🇸', lat: 40.71,  lng: -74.01,  region: 'NA',   solarPotential: 'medium' },
  { city: 'London',        country: 'UK',        flag: '🇬🇧', lat: 51.51,  lng: -0.13,   region: 'EU',   solarPotential: 'low' },
  { city: 'Berlin',        country: 'Germany',   flag: '🇩🇪', lat: 52.52,  lng: 13.40,   region: 'EU',   solarPotential: 'low' },
  { city: 'Tokyo',         country: 'Japan',     flag: '🇯🇵', lat: 35.68,  lng: 139.69,  region: 'APAC', solarPotential: 'medium' },
  { city: 'Sydney',        country: 'Australia', flag: '🇦🇺', lat: -33.87, lng: 151.21,  region: 'APAC', solarPotential: 'high' },
  { city: 'Dubai',         country: 'UAE',       flag: '🇦🇪', lat: 25.20,  lng: 55.27,   region: 'APAC', solarPotential: 'high' },
  { city: 'São Paulo',     country: 'Brazil',    flag: '🇧🇷', lat: -23.55, lng: -46.63,  region: 'SA',   solarPotential: 'high' },
  { city: 'Lagos',         country: 'Nigeria',   flag: '🇳🇬', lat: 6.52,   lng: 3.38,    region: 'AF',   solarPotential: 'high' },
  { city: 'Mumbai',        country: 'India',     flag: '🇮🇳', lat: 19.08,  lng: 72.88,   region: 'APAC', solarPotential: 'high' },
  { city: 'Singapore',     country: 'Singapore', flag: '🇸🇬', lat: 1.35,   lng: 103.82,  region: 'APAC', solarPotential: 'medium' },
  { city: 'Toronto',       country: 'Canada',    flag: '🇨🇦', lat: 43.65,  lng: -79.38,  region: 'NA',   solarPotential: 'medium' },
];

export interface TransmissionBreakdown {
  distanceKm: number;
  feeRate: number;           // e.g. 0.15 = 15%
  lossRate: number;          // e.g. 0.06 = 6%
  totalPriceMultiplier: number; // 1 + feeRate
  kWhDeliveredPerSent: number;  // 1 - lossRate
}

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// 500km → 1.5%, 5000km → 15%, 13000km → 39% (cap 40%)
export function transmissionFeeRate(distanceKm: number): number {
  return Math.min(0.40, distanceKm * 0.00003);
}

// 500km → 0.6%, 5000km → 6%, 12500km → 15% (cap 15%)
export function lineLossRate(distanceKm: number): number {
  return Math.min(0.15, distanceKm * 0.000012);
}

export function transmissionBreakdown(from: CityOption, to: CityOption): TransmissionBreakdown {
  const distanceKm = Math.round(haversineKm(from.lat, from.lng, to.lat, to.lng));
  const feeRate = transmissionFeeRate(distanceKm);
  const lossRate = lineLossRate(distanceKm);
  return {
    distanceKm,
    feeRate,
    lossRate,
    totalPriceMultiplier: 1 + feeRate,
    kWhDeliveredPerSent: 1 - lossRate,
  };
}

// Convert lat/lng to SVG coords for viewBox="0 0 800 400"
export function latLngToSvg(lat: number, lng: number): { x: number; y: number } {
  return {
    x: (lng + 180) / 360 * 800,
    y: (90 - lat) / 180 * 400,
  };
}

export function getCityByName(name: string): CityOption | undefined {
  return CITIES.find(c => c.city === name);
}
