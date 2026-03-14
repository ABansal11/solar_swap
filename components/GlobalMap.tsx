'use client';

import { useEffect, useState } from 'react';
import { latLngToSvg } from '@/lib/geo';
import styles from './GlobalMap.module.css';

interface Neighborhood {
  code: string;
  city: string;
  country: string;
  flag: string;
  lat: number;
  lng: number;
  region: string;
  participantCount: number;
  batteryLevel: number;
  isDemandResponse: boolean;
  pricePerKwh: number;
}

interface TradeArc {
  fromCode: string;
  toCode: string;
  id: string;
}

interface GlobalMapProps {
  neighborhoods: Neighborhood[];
  myRoomCode: string;
  activeArc?: TradeArc | null;
}

const REGION_COLORS: Record<string, string> = {
  NA: '#c4a035',
  EU: '#a88a28',
  APAC: '#d4b045',
  SA: '#c85050',
  AF: '#9e9688',
};

export default function GlobalMap({ neighborhoods, myRoomCode, activeArc }: GlobalMapProps) {
  const [hoveredRoom, setHoveredRoom] = useState<string | null>(null);
  const [animatingArc, setAnimatingArc] = useState<TradeArc | null>(null);

  useEffect(() => {
    if (!activeArc) return;
    setAnimatingArc(activeArc);
    const t = setTimeout(() => setAnimatingArc(null), 3000);
    return () => clearTimeout(t);
  }, [activeArc]);

  const getPos = (n: Neighborhood) => latLngToSvg(n.lat, n.lng);

  const arcPath = (from: Neighborhood, to: Neighborhood) => {
    const f = getPos(from);
    const t = getPos(to);
    const mx = (f.x + t.x) / 2;
    const my = (f.y + t.y) / 2 - 60;
    return `M ${f.x} ${f.y} Q ${mx} ${my} ${t.x} ${t.y}`;
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <span className={styles.title}><span className="dot-live"/>global grid</span>
        <span className={styles.count}>{neighborhoods.length} active neighborhood{neighborhoods.length !== 1 ? 's' : ''}</span>
      </div>
      <svg viewBox="0 0 800 400" className={styles.map} style={{ height: 280 }}>
        <defs>
          <radialGradient id="oceanGrad" cx="50%" cy="50%" r="70%">
            <stop offset="0%" stopColor="#111a15" />
            <stop offset="100%" stopColor="#0a0f0d" />
          </radialGradient>
          <filter id="nodeGlow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <marker id="arcArrow" markerWidth="6" markerHeight="4" refX="5" refY="2" orient="auto">
            <polygon points="0 0, 6 2, 0 4" fill="#c4a035" opacity="0.8" />
          </marker>
        </defs>

        <rect width="800" height="400" fill="url(#oceanGrad)" />

        {[-60,-30,0,30,60].map(lat => {
          const y = (90-lat)/180*400;
          return <line key={lat} x1="0" y1={y} x2="800" y2={y} stroke="#2a4038" strokeWidth="0.5" opacity="0.5" />;
        })}
        {[-120,-60,0,60,120].map(lng => {
          const x = (lng+180)/360*800;
          return <line key={lng} x1={x} y1="0" x2={x} y2="400" stroke="#2a4038" strokeWidth="0.5" opacity="0.5" />;
        })}

        {animatingArc && (() => {
          const from = neighborhoods.find(n => n.code === animatingArc.fromCode);
          const to = neighborhoods.find(n => n.code === animatingArc.toCode);
          if (!from || !to) return null;
          return (
            <path d={arcPath(from, to)} fill="none" stroke="#c4a035" strokeWidth="2" strokeDasharray="8,4" markerEnd="url(#arcArrow)" opacity="0.85">
              <animate attributeName="stroke-dashoffset" from="0" to="-120" dur="2s" repeatCount="indefinite" />
            </path>
          );
        })()}

        {neighborhoods.map(n => {
          const pos = getPos(n);
          const isMe = n.code === myRoomCode;
          const color = isMe ? '#e8408c' : REGION_COLORS[n.region] || '#9e9688';
          const r = isMe ? 10 : 6 + n.participantCount;
          const isHovered = hoveredRoom === n.code;

          return (
            <g
              key={n.code}
              transform={`translate(${pos.x}, ${pos.y})`}
              onMouseEnter={() => setHoveredRoom(n.code)}
              onMouseLeave={() => setHoveredRoom(null)}
              style={{ cursor: 'pointer' }}
            >
              <circle r={r + 8} fill="none" stroke={color} strokeWidth="1" opacity="0.2">
                <animate attributeName="r" values={`${r+4};${r+14};${r+4}`} dur="3s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.3;0;0.3" dur="3s" repeatCount="indefinite" />
              </circle>
              <circle r={r} fill={color} opacity="0.9" filter="url(#nodeGlow)" />
              {n.isDemandResponse && (
                <circle r={r+3} fill="none" stroke="#c85050" strokeWidth="1.5" opacity="0.7" />
              )}
              <text y={-(r + 6)} textAnchor="middle" fill="white" fontSize="9" fontWeight={isMe ? 'bold' : 'normal'}>
                {isMe ? '★ ' : ''}{n.city}
              </text>
              <text y={r + 14} textAnchor="middle" fill={n.batteryLevel < 30 ? '#c85050' : '#c4a035'} fontSize="8">
                {n.batteryLevel}%
              </text>
              {isHovered && (
                <g>
                  <rect x={-60} y={r+18} width={120} height={44} rx={4} fill="#1c2e26" stroke="#2a4038" strokeWidth="1" />
                  <text x={0} y={r+32} textAnchor="middle" fill="#e8f5ee" fontSize="9">{n.flag} {n.city}, {n.country}</text>
                  <text x={0} y={r+44} textAnchor="middle" fill="#c4a035" fontSize="9">{n.pricePerKwh.toFixed(4)} RLUSD/kWh</text>
                  <text x={0} y={r+56} textAnchor="middle" fill="#7aab90" fontSize="8">{n.participantCount} participant{n.participantCount !== 1 ? 's' : ''}</text>
                </g>
              )}
            </g>
          );
        })}

        {neighborhoods.length === 0 && (
          <text x="400" y="200" textAnchor="middle" fill="#4d7a62" fontSize="13" fontFamily="monospace">
            no active neighborhoods yet
          </text>
        )}
      </svg>
    </div>
  );
}
