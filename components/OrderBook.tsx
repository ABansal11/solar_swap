'use client';

interface Offer {
  sequence: number;
  pricePerKwh: number;
  solarAmount: string;
  rlusdAmount: string;
  ageHours: number;
  provenance?: { houseId: number };
}

interface OrderBookProps {
  asks: Offer[];
  bids: Offer[];
  midPrice: number;
  ammSpotPrice: number;
}

export default function OrderBook({ asks, bids, midPrice, ammSpotPrice }: OrderBookProps) {
  const topAsks = [...asks].sort((a, b) => a.pricePerKwh - b.pricePerKwh).slice(0, 5);
  const topBids = [...bids].sort((a, b) => b.pricePerKwh - a.pricePerKwh).slice(0, 5);

  return (
    <div className="bg-slate-800 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-white font-semibold text-sm">Order Book (DEX)</h3>
        <span className="text-xs text-slate-400">AMM Oracle: ${ammSpotPrice.toFixed(4)}/kWh</span>
      </div>

      <div className="grid grid-cols-3 text-xs text-slate-400 mb-1 px-1">
        <span>House</span>
        <span className="text-center">Price (RLUSD)</span>
        <span className="text-right">kWh</span>
      </div>

      {/* Asks (sell orders) */}
      <div className="space-y-0.5 mb-2">
        {topAsks.length === 0 ? (
          <div className="text-xs text-slate-500 text-center py-2">No asks</div>
        ) : (
          topAsks.map((ask, i) => (
            <div key={i} className="grid grid-cols-3 text-xs px-1 py-0.5 rounded bg-red-950/30 hover:bg-red-950/50">
              <span className="text-slate-400">House {ask.provenance?.houseId || '?'}</span>
              <span className="text-red-400 text-center font-mono">{ask.pricePerKwh.toFixed(4)}</span>
              <span className="text-slate-300 text-right font-mono">{(parseFloat(ask.solarAmount) / 100).toFixed(2)}</span>
            </div>
          ))
        )}
      </div>

      {/* Mid price */}
      <div className="text-center py-1.5 border-y border-slate-600 mb-2">
        <span className="text-yellow-400 font-bold text-sm">${midPrice.toFixed(4)}</span>
        <span className="text-slate-400 text-xs ml-1">mid</span>
      </div>

      {/* Bids (buy orders) */}
      <div className="space-y-0.5">
        {topBids.length === 0 ? (
          <div className="text-xs text-slate-500 text-center py-2">No bids</div>
        ) : (
          topBids.map((bid, i) => (
            <div key={i} className="grid grid-cols-3 text-xs px-1 py-0.5 rounded bg-green-950/30 hover:bg-green-950/50">
              <span className="text-slate-400">—</span>
              <span className="text-green-400 text-center font-mono">{bid.pricePerKwh.toFixed(4)}</span>
              <span className="text-slate-300 text-right font-mono">{(parseFloat(bid.solarAmount) / 100).toFixed(2)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
