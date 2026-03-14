'use client';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useState, useEffect } from 'react';

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

  useEffect(() => {
    const now = new Date();
    const timeStr = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;

    setPriceHistory(prev => {
      const next = [...prev, { time: timeStr, price: currentPrice, ammPrice: ammSpotPrice }];
      return next.slice(-30); // keep last 30 points
    });
  }, [currentPrice, ammSpotPrice]);

  if (priceHistory.length < 2) {
    return (
      <div className="bg-slate-800 rounded-lg p-4 h-40 flex items-center justify-center">
        <span className="text-slate-400 text-sm">Waiting for price data...</span>
      </div>
    );
  }

  return (
    <div className="bg-slate-800 rounded-lg p-4">
      <h3 className="text-white font-semibold text-sm mb-3">Price History (RLUSD/kWh)</h3>
      <ResponsiveContainer width="100%" height={140}>
        <LineChart data={priceHistory}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2e2a1c" />
          <XAxis dataKey="time" tick={{ fill: '#9e9688', fontSize: 10 }} />
          <YAxis tick={{ fill: '#9e9688', fontSize: 10 }} domain={['auto', 'auto']} />
          <Tooltip
            contentStyle={{ backgroundColor: '#1e1a12', border: '1px solid #2e2a1c', borderRadius: '6px' }}
            labelStyle={{ color: '#9e9688' }}
          />
          <Line type="monotone" dataKey="price" stroke="#c4a035" strokeWidth={2} dot={false} name="DEX Mid" />
          <Line type="monotone" dataKey="ammPrice" stroke="#7a6020" strokeWidth={1.5} dot={false} strokeDasharray="4 2" name="AMM Oracle" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
