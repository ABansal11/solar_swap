'use client';

import { useState, useEffect } from 'react';

interface GlobalOffer {
  sourceRoom: string;
  sourceCity: string;
  sourceCountry: string;
  flag: string;
  distanceKm: number;
  feeRate: number;
  lossRate: number;
  basePrice: number;
  totalPrice: number;
  kWhDeliveredPer10Budgeted: number;
  participantCount: number;
  batteryLevel: number;
  isDemandResponse: boolean;
}

interface GlobalMarketPanelProps {
  roomCode: string;
  participantId: string;
  myCity: string;
  localPrice: number;
  onTradeSuccess?: (result: any) => void;
}

export default function GlobalMarketPanel({ roomCode, participantId, myCity, localPrice, onTradeSuccess }: GlobalMarketPanelProps) {
  const [offers, setOffers] = useState<GlobalOffer[]>([]);
  const [selected, setSelected] = useState<GlobalOffer | null>(null);
  const [budget, setBudget] = useState('1.0');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    fetchOffers();
    const interval = setInterval(fetchOffers, 8000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomCode]);

  async function fetchOffers() {
    try {
      const res = await fetch(`/api/global/offers?fromRoom=${roomCode}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setOffers(data);
        if (data.length > 0 && !selected) setSelected(data[0]);
      }
    } catch {}
    setFetching(false);
  }

  // Better: delivered = (budget / totalPrice) * kWhDeliveredPerSent
  const kWhEstimate = selected
    ? (parseFloat(budget || '0') / selected.totalPrice) * (1 - selected.lossRate)
    : 0;

  const savings = selected ? ((0.35 - selected.totalPrice) / 0.35 * 100) : 0;

  async function handleImport() {
    if (!selected) return;
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch('/api/global/buy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          buyerRoomCode: roomCode,
          participantId,
          sourceRoomCode: selected.sourceRoom,
          rlusdBudget: budget,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ type: 'error', text: data.error });
      } else {
        setMessage({ type: 'success', text: data.summary });
        onTradeSuccess?.(data);
      }
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message });
    }
    setLoading(false);
  }

  if (fetching) {
    return (
      <div className="bg-slate-800 rounded-lg p-4 text-center text-slate-400 text-sm">
        Loading global market...
      </div>
    );
  }

  if (offers.length === 0) {
    return (
      <div className="bg-slate-800 rounded-lg p-4 text-center text-slate-400 text-sm">
        <div className="text-2xl mb-2">🌍</div>
        <div>No other neighborhoods online yet.</div>
        <div className="text-xs mt-1">Create another room in a different tab to enable cross-neighborhood trading.</div>
      </div>
    );
  }

  return (
    <div className="bg-slate-800 rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-white font-semibold text-sm">🌍 Global Energy Market</h3>
        <span className="text-xs text-slate-400">From: {myCity}</span>
      </div>

      {/* Offer table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-slate-400 border-b border-slate-700">
              <th className="text-left pb-1">City</th>
              <th className="text-right pb-1">Base</th>
              <th className="text-right pb-1">+Fee</th>
              <th className="text-right pb-1">Total</th>
              <th className="text-right pb-1">km</th>
            </tr>
          </thead>
          <tbody>
            {offers.map(offer => (
              <tr
                key={offer.sourceRoom}
                onClick={() => setSelected(offer)}
                className={`cursor-pointer border-b border-slate-700/50 hover:bg-slate-700/50 ${selected?.sourceRoom === offer.sourceRoom ? 'bg-slate-700/70' : ''}`}
              >
                <td className="py-1 font-medium text-white">
                  {offer.flag} {offer.sourceCity}
                  {offer.isDemandResponse && <span className="ml-1 text-orange-400">⚠</span>}
                </td>
                <td className="text-right text-slate-300 font-mono">{offer.basePrice.toFixed(4)}</td>
                <td className="text-right text-yellow-400">+{Math.round(offer.feeRate * 100)}%</td>
                <td className="text-right text-green-400 font-mono font-bold">{offer.totalPrice.toFixed(4)}</td>
                <td className="text-right text-slate-400">{offer.distanceKm.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Selected offer detail */}
      {selected && (
        <div className="bg-slate-700/50 rounded-lg p-3 space-y-2">
          <div className="font-semibold text-white text-sm">{selected.flag} Import from {selected.sourceCity}</div>
          <div className="grid grid-cols-2 gap-x-4 text-xs text-slate-300">
            <div>📍 Distance: <span className="text-white">{selected.distanceKm.toLocaleString()} km</span></div>
            <div>💸 Fee: <span className="text-yellow-400">+{Math.round(selected.feeRate * 100)}%</span></div>
            <div>⚡ Line loss: <span className="text-red-400">{(selected.lossRate * 100).toFixed(1)}%</span></div>
            <div>🔋 Battery: <span className="text-white">{selected.batteryLevel}%</span></div>
          </div>

          <div>
            <label className="text-xs text-slate-400 mb-1 block">RLUSD budget</label>
            <input
              type="number"
              value={budget}
              onChange={e => setBudget(e.target.value)}
              className="w-full bg-slate-600 text-white text-sm rounded px-3 py-2 border border-slate-500"
              min="0.1" step="0.1"
            />
          </div>

          <div className="bg-slate-600/50 rounded p-2 text-xs space-y-1">
            <div><span className="text-slate-400">You&apos;d receive: </span><span className="text-yellow-400 font-bold">{kWhEstimate.toFixed(2)} kWh</span></div>
            <div><span className="text-slate-400">Transmission fee: </span><span className="text-white">{(parseFloat(budget||'0') * selected.feeRate / (1+selected.feeRate)).toFixed(4)} RLUSD</span></div>
            <div><span className="text-slate-400">Line loss: </span><span className="text-red-400">{((parseFloat(budget||'0') / selected.totalPrice) * selected.lossRate).toFixed(3)} kWh lost in transit</span></div>
            {savings > 0 && <div className="text-green-400">Still {savings.toFixed(0)}% cheaper than grid ($0.35/kWh)</div>}
          </div>

          <button
            onClick={handleImport}
            disabled={loading || !budget || parseFloat(budget) <= 0}
            className="w-full bg-purple-600 hover:bg-purple-500 disabled:bg-slate-600 text-white font-medium py-2 rounded-lg text-sm transition-colors"
          >
            {loading ? '⏳ Importing...' : `Import from ${selected.sourceCity} →`}
          </button>
        </div>
      )}

      {message && (
        <div className={`p-2 rounded text-xs ${message.type === 'success' ? 'bg-green-900/50 text-green-300' : 'bg-red-900/50 text-red-300'}`}>
          {message.text}
        </div>
      )}
    </div>
  );
}
