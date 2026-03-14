'use client';

interface Trade {
  txHash: string;
  type: 'mint' | 'buy' | 'trade';
  from: string;
  to: string;
  amount: string;
  timestamp: number;
  provenance?: {
    houseId: number;
    generatedAt: number;
    solarKw: number;
  };
  co2Saved?: number;
}

interface TradeHistoryProps {
  trades: Trade[];
}

function shortenAddress(addr: string): string {
  if (!addr) return '—';
  return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
}

function timeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ago`;
}

export default function TradeHistory({ trades }: TradeHistoryProps) {
  return (
    <div className="bg-slate-800 rounded-lg p-4">
      <h3 className="text-white font-semibold text-sm mb-3">Trade Feed</h3>

      {trades.length === 0 ? (
        <div className="text-slate-400 text-xs text-center py-4">
          No trades yet. Complete setup and start trading!
        </div>
      ) : (
        <div className="space-y-2 max-h-48 overflow-y-auto">
          {trades.map((trade, i) => (
            <div key={i} className="bg-slate-700/50 rounded p-2 text-xs">
              <div className="flex items-center justify-between mb-1">
                <span className={`font-semibold ${trade.type === 'mint' ? 'text-blue-400' : 'text-green-400'}`}>
                  {trade.type === 'mint' ? '⚡ Mint' : '🔄 Trade'}
                </span>
                <span className="text-slate-400">{timeAgo(trade.timestamp)}</span>
              </div>

              {trade.provenance && (
                <div className="text-slate-300">
                  House {trade.provenance.houseId} → {shortenAddress(trade.to)}
                </div>
              )}

              <div className="flex items-center justify-between mt-1">
                <span className="text-white">{trade.amount}</span>
                {trade.co2Saved != null && trade.co2Saved > 0 && (
                  <span className="text-green-400">🌿 {trade.co2Saved.toFixed(2)} kg CO₂</span>
                )}
              </div>

              <a
                href={`https://testnet.xrpl.org/transactions/${trade.txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300 mt-1 block truncate"
              >
                {shortenAddress(trade.txHash)}
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
