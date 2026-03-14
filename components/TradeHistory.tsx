'use client';

interface Trade {
  txHash: string;
  type: 'mint' | 'buy' | 'trade';
  from: string;
  to: string;
  amount: string;
  timestamp: number;
  provenance?: { houseId: number; generatedAt: number; solarKw: number };
  co2Saved?: number;
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
  return `${Math.floor(mins / 60)}h ago`;
}

export default function TradeHistory({ trades }: { trades: Trade[] }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '16px 18px', color: 'var(--text-on-dark)' }}>
      <span className="label" style={{ display: 'block', marginBottom: '12px' }}>Trade Feed</span>

      {trades.length === 0 ? (
        <div style={{ fontSize: '11px', color: 'var(--text-muted-dark)', textAlign: 'center', padding: '16px 0', fontFamily: 'var(--mono)' }}>
          No trades yet. Start trading!
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '192px', overflowY: 'auto' }}>
          {trades.map((trade, i) => (
            <div key={i} style={{ background: 'var(--surface2)', borderRadius: '8px', padding: '8px 10px', fontSize: '11px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ fontWeight: 600, color: trade.type === 'mint' ? 'var(--gold)' : '#c4a035', fontFamily: 'var(--mono)' }}>
                  {trade.type === 'mint' ? 'mint' : 'trade'}
                </span>
                <span style={{ color: 'var(--text-muted-dark)', fontFamily: 'var(--mono)', fontSize: '10px' }}>{timeAgo(trade.timestamp)}</span>
              </div>

              {trade.provenance && (
                <div style={{ color: 'var(--text-muted-dark)', marginBottom: '3px', fontFamily: 'var(--mono)', fontSize: '10px' }}>
                  House {trade.provenance.houseId} → {shortenAddress(trade.to)}
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-on-dark)', fontFamily: 'var(--mono)' }}>{trade.amount}</span>
                {trade.co2Saved != null && trade.co2Saved > 0 && (
                  <span style={{ color: 'var(--gold)', fontSize: '10px', fontFamily: 'var(--mono)' }}>{trade.co2Saved.toFixed(2)} kg CO₂</span>
                )}
              </div>

              <a
                href={`https://testnet.xrpl.org/transactions/${trade.txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'var(--gold)', display: 'block', marginTop: '3px', fontFamily: 'var(--mono)', fontSize: '10px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: 'none' }}
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
