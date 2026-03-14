'use client';

import { useState } from 'react';

interface TradePanelsProps {
  currentPrice: number;
  onMintSuccess?: (result: any) => void;
  onBuySuccess?: (result: any) => void;
  // Room mode: if provided, posts to /api/rooms/[code]/mint and /api/rooms/[code]/buy
  roomCode?: string;
  participantId?: string;
  // In room mode the houseId is fixed; in legacy mode the user picks it
  fixedHouseId?: number;
}

export default function TradePanels({
  currentPrice,
  onMintSuccess,
  onBuySuccess,
  roomCode,
  participantId,
  fixedHouseId,
}: TradePanelsProps) {
  const [activeTab, setActiveTab] = useState<'sell' | 'buy'>('sell');
  const [kWh, setKwh] = useState('10');
  const [minPrice, setMinPrice] = useState('');
  const [houseId, setHouseId] = useState('1');
  const [rlusdAmount, setRlusdAmount] = useState('1');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const estimatedEarnings = parseFloat(kWh || '0') * currentPrice;
  const estimatedKwh = parseFloat(rlusdAmount || '0') / currentPrice;

  async function handleSell() {
    setLoading(true);
    setMessage(null);
    try {
      let res: Response;
      if (roomCode && participantId) {
        // Room mode
        res = await fetch(`/api/rooms/${roomCode}/mint`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            participantId,
            kWh: parseFloat(kWh),
            minPricePerKwh: minPrice ? parseFloat(minPrice) : undefined,
          }),
        });
      } else {
        // Legacy mode
        res = await fetch('/api/mint', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            kWh: parseFloat(kWh),
            houseId: parseInt(houseId),
            minPricePerKwh: minPrice ? parseFloat(minPrice) : undefined,
          }),
        });
      }
      const data = await res.json();
      if (!res.ok) {
        if (data.error === 'RESERVE_FLOOR_REACHED') {
          setMessage({ type: 'error', text: `Reserve floor reached (battery ${data.batteryLevel}%). Minting suspended.` });
        } else {
          setMessage({ type: 'error', text: data.error });
        }
      } else {
        setMessage({ type: 'success', text: `Minted ${data.kWh} kWh! DEX ask posted at ${data.pricePerKwh?.toFixed(4)} RLUSD/kWh` });
        onMintSuccess?.(data);
      }
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message });
    }
    setLoading(false);
  }

  async function handleBuy() {
    setLoading(true);
    setMessage(null);
    try {
      let res: Response;
      if (roomCode && participantId) {
        // Room mode
        res = await fetch(`/api/rooms/${roomCode}/buy`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ participantId, rlusdAmount }),
        });
      } else {
        // Legacy mode
        res = await fetch('/api/buy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rlusdAmount }),
        });
      }
      const data = await res.json();
      if (!res.ok) {
        setMessage({ type: 'error', text: data.error });
      } else {
        const provStr = data.provenance?.houseId
          ? `from House ${data.provenance.houseId}`
          : 'from neighborhood pool';
        setMessage({ type: 'success', text: `Bought ${data.kWh?.toFixed(2)} kWh ${provStr} via ${data.source}. Saved ${(data.kWh * 0.386).toFixed(2)} kg CO₂!` });
        onBuySuccess?.(data);
      }
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message });
    }
    setLoading(false);
  }

  const effectiveHouseId = fixedHouseId ?? parseInt(houseId);

  return (
    <div className="bg-slate-800 rounded-lg p-4">
      {/* Tabs */}
      <div className="flex mb-4 bg-slate-700 rounded-lg p-0.5">
        <button
          className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === 'sell' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}
          onClick={() => setActiveTab('sell')}
        >
          ⚡ Sell Energy
        </button>
        <button
          className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === 'buy' ? 'bg-green-600 text-white' : 'text-slate-400 hover:text-white'}`}
          onClick={() => setActiveTab('buy')}
        >
          🛒 Buy Energy
        </button>
      </div>

      {activeTab === 'sell' ? (
        <div className="space-y-3">
          <div className="bg-blue-900/30 border border-blue-700/50 rounded p-2 text-xs text-blue-300">
            💰 Earn <strong>{currentPrice.toFixed(4)} RLUSD/kWh</strong> — 3× more than grid export ($0.04/kWh)
          </div>

          {/* Show house ID selector only in legacy mode */}
          {!roomCode && (
            <div>
              <label className="text-xs text-slate-400 mb-1 block">House ID</label>
              <select
                value={houseId}
                onChange={e => setHouseId(e.target.value)}
                className="w-full bg-slate-700 text-white text-sm rounded px-3 py-2 border border-slate-600"
              >
                {[1,2,3,4,5,6].map(id => <option key={id} value={id}>House {id}</option>)}
              </select>
            </div>
          )}

          {roomCode && fixedHouseId && (
            <div className="bg-slate-700/50 rounded p-2 text-xs text-slate-300">
              Selling as <span className="text-blue-300 font-semibold">House {fixedHouseId}</span>
            </div>
          )}

          <div>
            <label className="text-xs text-slate-400 mb-1 block">Energy Amount (kWh)</label>
            <input
              type="number"
              value={kWh}
              onChange={e => setKwh(e.target.value)}
              className="w-full bg-slate-700 text-white text-sm rounded px-3 py-2 border border-slate-600"
              placeholder="10"
              min="0.01"
              step="0.5"
            />
          </div>

          <div>
            <label className="text-xs text-slate-400 mb-1 block">Min Price (RLUSD/kWh, optional)</label>
            <input
              type="number"
              value={minPrice}
              onChange={e => setMinPrice(e.target.value)}
              className="w-full bg-slate-700 text-white text-sm rounded px-3 py-2 border border-slate-600"
              placeholder={`${currentPrice.toFixed(4)} (AMM price)`}
              min="0"
              step="0.001"
            />
          </div>

          <div className="bg-slate-700/50 rounded p-2 text-xs">
            <span className="text-slate-400">Estimated earnings: </span>
            <span className="text-yellow-400 font-bold">{estimatedEarnings.toFixed(4)} RLUSD</span>
            <div className="text-slate-500 mt-0.5">Token expires in 24h — energy doesn&apos;t wait</div>
          </div>

          <button
            onClick={handleSell}
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-slate-600 text-white font-medium py-2.5 rounded-lg text-sm transition-colors"
          >
            {loading ? 'Posting to DEX...' : 'Post Ask on DEX →'}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="bg-green-900/30 border border-green-700/50 rounded p-2 text-xs text-green-300">
            💡 Save <strong>47% vs PG&amp;E peak</strong> ($0.35/kWh). Current: {currentPrice.toFixed(4)} RLUSD/kWh
          </div>

          <div>
            <label className="text-xs text-slate-400 mb-1 block">RLUSD to Spend</label>
            <input
              type="number"
              value={rlusdAmount}
              onChange={e => setRlusdAmount(e.target.value)}
              className="w-full bg-slate-700 text-white text-sm rounded px-3 py-2 border border-slate-600"
              placeholder="1.0"
              min="0.01"
              step="0.1"
            />
          </div>

          <div className="bg-slate-700/50 rounded p-2 text-xs">
            <span className="text-slate-400">Estimated: </span>
            <span className="text-yellow-400 font-bold">{estimatedKwh.toFixed(2)} kWh</span>
            <div className="text-green-400 mt-0.5">🌿 ~{(estimatedKwh * 0.386).toFixed(2)} kg CO₂ saved</div>
            <div className="text-slate-500 mt-0.5">DEX first, AMM fallback if no asks</div>
          </div>

          <button
            onClick={handleBuy}
            disabled={loading}
            className="w-full bg-green-600 hover:bg-green-500 disabled:bg-slate-600 text-white font-medium py-2.5 rounded-lg text-sm transition-colors"
          >
            {loading ? 'Matching on DEX...' : 'Buy Energy →'}
          </button>
        </div>
      )}

      {message && (
        <div className={`mt-3 p-2 rounded text-xs ${message.type === 'success' ? 'bg-green-900/50 text-green-300' : 'bg-red-900/50 text-red-300'}`}>
          {message.text}
        </div>
      )}
    </div>
  );
}
