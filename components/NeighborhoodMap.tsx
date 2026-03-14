'use client';

import { useEffect, useState } from 'react';

interface House {
  id: number;
  solarOutput: number;
  balance: number;
  isProducing: boolean;
  x: number;
  y: number;
}

interface BatteryState {
  level: number;
  trend: 'charging' | 'discharging';
  isDemandResponse: boolean;
  isReserveFloor: boolean;
  timeOfDay: 'peak' | 'offpeak';
  houses: House[];
  co2SavedKg: number;
}

interface FlowLine {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  id: string;
}

export interface ParticipantInfo {
  id: string;
  name: string;
  houseId: number;
  address: string;
}

export interface PendingEscrowInfo {
  id: string;
  participantId: string;
  kWh: number;
  status: 'pending_iot' | 'verified' | 'failed';
  houseId?: number;
}

interface NeighborhoodMapProps {
  batteryState: BatteryState | null;
  activeFlow?: { fromHouse: number; toHouse: number } | null;
  participants?: ParticipantInfo[];
  pendingEscrows?: PendingEscrowInfo[];
}

export default function NeighborhoodMap({
  batteryState,
  activeFlow,
  participants = [],
  pendingEscrows = [],
}: NeighborhoodMapProps) {
  const [flowLines, setFlowLines] = useState<FlowLine[]>([]);
  const [blink, setBlink] = useState(false);

  const CENTER = { x: 250, y: 200 };

  useEffect(() => {
    if (!activeFlow || !batteryState) return;

    const fromHouse = batteryState.houses.find(h => h.id === activeFlow.fromHouse);
    const toHouse = batteryState.houses.find(h => h.id === activeFlow.toHouse);

    if (!fromHouse || !toHouse) return;

    const lineId = `flow-${Date.now()}`;
    setFlowLines(prev => [...prev, {
      fromX: fromHouse.x,
      fromY: fromHouse.y,
      toX: toHouse.x,
      toY: toHouse.y,
      id: lineId,
    }]);

    setTimeout(() => {
      setFlowLines(prev => prev.filter(l => l.id !== lineId));
    }, 1500);
  }, [activeFlow, batteryState]);

  // Blink timer for IoT rings
  useEffect(() => {
    if (pendingEscrows.filter(e => e.status === 'pending_iot').length === 0) return;
    const interval = setInterval(() => setBlink(b => !b), 600);
    return () => clearInterval(interval);
  }, [pendingEscrows]);

  if (!batteryState) {
    return (
      <div className="flex items-center justify-center h-96 text-gray-400">
        <div className="text-center">
          <div className="text-4xl mb-2">⚡</div>
          <div>Loading neighborhood...</div>
        </div>
      </div>
    );
  }

  const { level, isDemandResponse, isReserveFloor, houses } = batteryState;

  const batteryColor = isReserveFloor ? '#ef4444' : isDemandResponse ? '#f97316' : '#22c55e';
  const batteryFillHeight = (level / 100) * 70;

  const participantByHouse: Record<number, ParticipantInfo> = {};
  for (const p of participants) {
    participantByHouse[p.houseId] = p;
  }

  // Build a set of houseIds with active IoT escrows
  const iotHouseIds = new Set<number>();
  for (const e of pendingEscrows) {
    if (e.status === 'pending_iot' && e.houseId) {
      iotHouseIds.add(e.houseId);
    }
  }

  return (
    <div className="relative">
      {(isDemandResponse || isReserveFloor) && (
        <div className={`absolute top-0 left-0 right-0 z-10 text-center py-1 text-sm font-bold rounded-t-lg ${
          isReserveFloor ? 'bg-red-500 text-white' : 'bg-orange-400 text-white'
        }`}>
          {isReserveFloor ? '🚫 RESERVE FLOOR — Minting Suspended' : '⚠ DEMAND RESPONSE ACTIVE — Prices Rising'}
        </div>
      )}

      <svg
        viewBox="0 0 500 400"
        className="w-full h-full"
        style={{ filter: isDemandResponse ? 'drop-shadow(0 0 8px rgba(249,115,22,0.3))' : 'none' }}
      >
        <defs>
          <marker id="arrowhead" markerWidth="6" markerHeight="4" refX="3" refY="2" orient="auto">
            <polygon points="0 0, 6 2, 0 4" fill="#fbbf24" />
          </marker>
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
          <filter id="iotGlow">
            <feGaussianBlur stdDeviation="4" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>

        {/* Background grid lines */}
        <circle cx={CENTER.x} cy={CENTER.y} r="160" fill="none" stroke="#1e3a5f" strokeWidth="1" strokeDasharray="4,8" opacity="0.4" />
        <circle cx={CENTER.x} cy={CENTER.y} r="100" fill="none" stroke="#1e3a5f" strokeWidth="1" strokeDasharray="4,8" opacity="0.2" />

        {/* Connection lines from houses to center */}
        {houses.map(house => (
          <line
            key={`conn-${house.id}`}
            x1={house.x}
            y1={house.y}
            x2={CENTER.x}
            y2={CENTER.y}
            stroke={house.isProducing ? '#fbbf24' : '#334155'}
            strokeWidth={house.isProducing ? 1.5 : 1}
            strokeDasharray={house.isProducing ? '4,3' : '3,6'}
            opacity={house.isProducing ? 0.7 : 0.3}
          />
        ))}

        {/* IoT verification rings — blinking yellow around houses pending escrow verification */}
        {houses.map(house => {
          if (!iotHouseIds.has(house.id)) return null;
          return (
            <circle
              key={`iot-ring-${house.id}`}
              cx={house.x}
              cy={house.y}
              r="32"
              fill="none"
              stroke="#eab308"
              strokeWidth="2.5"
              strokeDasharray="6,3"
              opacity={blink ? 0.9 : 0.2}
              filter="url(#iotGlow)"
            />
          );
        })}

        {/* Flow animation lines */}
        {flowLines.map(line => (
          <g key={line.id}>
            <line
              x1={line.fromX}
              y1={line.fromY}
              x2={line.toX}
              y2={line.toY}
              stroke="#fbbf24"
              strokeWidth="2.5"
              strokeDasharray="6,4"
              markerEnd="url(#arrowhead)"
              opacity="0.9"
              filter="url(#glow)"
            >
              <animate attributeName="stroke-dashoffset" from="0" to="-100" dur="1.5s" fill="freeze" />
            </line>
          </g>
        ))}

        {/* Central battery */}
        <g transform={`translate(${CENTER.x - 25}, ${CENTER.y - 45})`}>
          <rect x="0" y="10" width="50" height="75" rx="6" ry="6" fill="#0f172a" stroke={batteryColor} strokeWidth="2" />
          <rect x="15" y="5" width="20" height="8" rx="3" ry="3" fill={batteryColor} opacity="0.8" />
          <clipPath id="batteryClip">
            <rect x="0" y="10" width="50" height="75" rx="6" ry="6" />
          </clipPath>
          <rect
            x="3"
            y={10 + (70 - batteryFillHeight)}
            width="44"
            height={batteryFillHeight}
            rx="4" ry="4"
            fill={batteryColor}
            opacity="0.7"
            clipPath="url(#batteryClip)"
          />
          <text x="25" y="55" textAnchor="middle" fill="white" fontSize="14" fontWeight="bold">{level}%</text>
          <text x="25" y="70" textAnchor="middle" fill="#94a3b8" fontSize="9">BATTERY</text>
        </g>

        <text x={CENTER.x} y={CENTER.y + 55} textAnchor="middle" fill="#64748b" fontSize="8">⟳ AMM POOL</text>

        {/* Houses */}
        {houses.map(house => (
          <HouseIcon
            key={house.id}
            house={house}
            cx={house.x}
            cy={house.y}
            participantName={participantByHouse[house.id]?.name}
            iotPending={iotHouseIds.has(house.id)}
          />
        ))}
      </svg>
    </div>
  );
}

function HouseIcon({
  house,
  cx,
  cy,
  participantName,
  iotPending = false,
}: {
  house: House;
  cx: number;
  cy: number;
  participantName?: string;
  iotPending?: boolean;
}) {
  const isOccupied = !!participantName;
  const isProducing = house.isProducing;

  const houseColor = iotPending ? '#713f12' : isProducing ? '#1e40af' : isOccupied ? '#1e293b' : '#111827';
  const roofColor = iotPending ? '#92400e' : isProducing ? '#3b82f6' : isOccupied ? '#334155' : '#1f2937';
  const solarColor = iotPending ? '#eab308' : isProducing ? '#fbbf24' : isOccupied ? '#475569' : '#1f2937';
  const strokeColor = iotPending ? '#ca8a04' : isProducing ? '#3b82f6' : isOccupied ? '#334155' : '#1e293b';

  return (
    <g transform={`translate(${cx - 22}, ${cy - 28})`} className="cursor-pointer" opacity={isOccupied || participantName === undefined ? 1 : 0.4}>
      <rect x="4" y="22" width="36" height="26" rx="2" fill={houseColor} stroke={strokeColor} strokeWidth="1.5" />
      <polygon points="2,22 22,4 42,22" fill={roofColor} stroke={iotPending ? '#ca8a04' : isProducing ? '#60a5fa' : isOccupied ? '#475569' : '#1f2937'} strokeWidth="1" />
      <rect x="15" y="33" width="10" height="15" rx="1" fill={isProducing || iotPending ? '#1d4ed8' : '#0f172a'} />
      <g transform="translate(8, 10)">
        <rect x="0" y="0" width="12" height="8" rx="1" fill={solarColor} stroke={isProducing || iotPending ? '#f59e0b' : '#64748b'} strokeWidth="0.8" />
        {(isProducing || iotPending) && (
          <>
            <line x1="4" y1="0" x2="4" y2="8" stroke="#92400e" strokeWidth="0.5" />
            <line x1="8" y1="0" x2="8" y2="8" stroke="#92400e" strokeWidth="0.5" />
            <line x1="0" y1="3" x2="12" y2="3" stroke="#92400e" strokeWidth="0.5" />
          </>
        )}
      </g>
      <text x="22" y="45" textAnchor="middle" fill="white" fontSize="10" fontWeight="bold">{house.id}</text>
      {participantName !== undefined ? (
        isOccupied ? (
          <text x="22" y="58" textAnchor="middle" fill={iotPending ? '#eab308' : '#60a5fa'} fontSize="7" fontWeight="bold">
            {participantName.length > 8 ? participantName.slice(0, 7) + '…' : participantName}
          </text>
        ) : (
          <text x="22" y="58" textAnchor="middle" fill="#475569" fontSize="7">Empty</text>
        )
      ) : null}
      {iotPending && (
        <text x="22" y={participantName !== undefined ? 65 : 58} textAnchor="middle" fill="#eab308" fontSize="7">
          📡 IoT
        </text>
      )}
      {isProducing && !iotPending && (
        <text x="22" y={participantName !== undefined ? 65 : 58} textAnchor="middle" fill="#fbbf24" fontSize="7">
          ⚡{house.solarOutput.toFixed(1)}kW
        </text>
      )}
      {house.balance > 0 && (
        <text x="22" y={(isProducing || iotPending) ? (participantName !== undefined ? 72 : 65) : (participantName !== undefined ? 65 : 58)} textAnchor="middle" fill="#22c55e" fontSize="7">
          {house.balance.toFixed(1)} SOLAR
        </text>
      )}
    </g>
  );
}
