'use client';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useState, useEffect, useRef } from 'react';

interface PricePoint {
  time: string;
  price: number;
  ammPrice: number;
}

interface PriceChartProps {
  currentPrice: number;
  ammSpotPrice: number;
}

export default function PriceChart({ currentPrice, ammSpotPrice }: PriceChartProps) {
  const [priceHistory, setPriceHistory] = useState<PricePoint[]>([]);
  const latestRef = useRef({ currentPrice, ammSpotPrice });

  // Keep ref in sync so the interval always reads the latest prices
  useEffect(() => {
    latestRef.current = { currentPrice, ammSpotPrice };
  }, [currentPrice, ammSpotPrice]);

  // Add a new price point every 10 seconds regardless of whether price changed
  useEffect(() => {
    const addPoint = () => {
      const now = new Date();
      const timeStr = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}:${now.getSeconds().toString().padStart(2,'0')}`;
      const { currentPrice: p, ammSpotPrice: a } = latestRef.current;
      setPriceHistory(prev => [...prev, { time: timeStr, price: p, ammPrice: a }].slice(-30));
    };
    addPoint();
    const interval = setInterval(addPoint, 10_000);
    return () => clearInterval(interval);
  }, []); // run once

  if (priceHistory.length < 2) {
    return (
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '16px 18px', height: '160px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: 'var(--text-muted-dark)', fontFamily: 'var(--mono)', fontSize: '12px' }}>Waiting for price data...</span>
      </div>
    );
  }

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '16px 18px' }}>
      <span className="label" style={{ display: 'block', marginBottom: '12px' }}>Price History (RLUSD/kWh)</span>
      <ResponsiveContainer width="100%" height={140}>
        <LineChart data={priceHistory}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2e2a1c" />
          <XAxis dataKey="time" tick={{ fill: '#9e9688', fontSize: 10 }} />
          <YAxis tick={{ fill: '#9e9688', fontSize: 10 }} domain={['auto', 'auto']} />
          <Tooltip
            contentStyle={{ backgroundColor: '#1e1a12', border: '1px solid #2e2a1c', borderRadius: '8px' }}
            labelStyle={{ color: '#9e9688' }}
          />
          <Line type="monotone" dataKey="price" stroke="#c4a035" strokeWidth={2} dot={false} name="DEX Mid" />
          <Line type="monotone" dataKey="ammPrice" stroke="#7a6020" strokeWidth={1.5} dot={false} strokeDasharray="4 2" name="AMM Oracle" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
