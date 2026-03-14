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

const S = {
  wrap: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '16px 18px', color: 'var(--text-on-dark)' } as React.CSSProperties,
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' } as React.CSSProperties,
  colHeader: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', fontSize: '10px', color: 'var(--text-muted-dark)', fontFamily: 'var(--mono)', letterSpacing: '0.08em', marginBottom: '4px', padding: '0 4px' } as React.CSSProperties,
  askRow: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', fontSize: '11px', padding: '3px 4px', borderRadius: '4px', background: 'rgba(200,80,80,0.08)' } as React.CSSProperties,
  bidRow: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', fontSize: '11px', padding: '3px 4px', borderRadius: '4px', background: 'rgba(196,160,53,0.08)' } as React.CSSProperties,
  empty: { fontSize: '11px', color: 'var(--text-muted-dark)', textAlign: 'center' as const, padding: '8px 0', fontFamily: 'var(--mono)' },
  midPrice: { textAlign: 'center' as const, padding: '8px 0', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', margin: '6px 0' },
};

export default function OrderBook({ asks, bids, midPrice, ammSpotPrice }: OrderBookProps) {
  const topAsks = [...asks].sort((a, b) => a.pricePerKwh - b.pricePerKwh).slice(0, 5);
  const topBids = [...bids].sort((a, b) => b.pricePerKwh - a.pricePerKwh).slice(0, 5);

  return (
    <div style={S.wrap}>
      <div style={S.header}>
        <span className="label">Order Book (DEX)</span>
        <span style={{ fontSize: '10px', color: 'var(--text-muted-dark)', fontFamily: 'var(--mono)' }}>
          AMM: ${ammSpotPrice.toFixed(4)}
        </span>
      </div>

      <div style={S.colHeader}>
        <span>House</span>
        <span style={{ textAlign: 'center' }}>Price</span>
        <span style={{ textAlign: 'right' }}>kWh</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginBottom: '4px' }}>
        {topAsks.length === 0 ? (
          <div style={S.empty}>no asks</div>
        ) : (
          topAsks.map((ask, i) => (
            <div key={i} style={S.askRow}>
              <span style={{ color: 'var(--text-muted-dark)' }}>#{ask.provenance?.houseId || '?'}</span>
              <span style={{ color: 'var(--red)', textAlign: 'center', fontFamily: 'var(--mono)' }}>{ask.pricePerKwh.toFixed(4)}</span>
              <span style={{ color: 'var(--text-on-dark)', textAlign: 'right', fontFamily: 'var(--mono)' }}>{(parseFloat(ask.solarAmount) / 100).toFixed(2)}</span>
            </div>
          ))
        )}
      </div>

      <div style={S.midPrice}>
        <span style={{ color: 'var(--gold)', fontWeight: 700, fontSize: '14px', fontFamily: 'var(--mono)' }}>${midPrice.toFixed(4)}</span>
        <span style={{ color: 'var(--text-muted-dark)', fontSize: '10px', marginLeft: '6px', fontFamily: 'var(--mono)' }}>mid</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {topBids.length === 0 ? (
          <div style={S.empty}>no bids</div>
        ) : (
          topBids.map((bid, i) => (
            <div key={i} style={S.bidRow}>
              <span style={{ color: 'var(--text-muted-dark)' }}>—</span>
              <span style={{ color: 'var(--gold)', textAlign: 'center', fontFamily: 'var(--mono)' }}>{bid.pricePerKwh.toFixed(4)}</span>
              <span style={{ color: 'var(--text-on-dark)', textAlign: 'right', fontFamily: 'var(--mono)' }}>{(parseFloat(bid.solarAmount) / 100).toFixed(2)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
