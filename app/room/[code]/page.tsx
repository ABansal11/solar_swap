'use client';

import { useState, useEffect, useCallback, use } from 'react';
import { useRouter } from 'next/navigation';
import NeighborhoodMap, { ParticipantInfo, PendingEscrowInfo } from '@/components/NeighborhoodMap';
import OrderBook from '@/components/OrderBook';
import PriceChart from '@/components/PriceChart';
import TradeHistory from '@/components/TradeHistory';
import TradePanels from '@/components/TradePanels';
import GlobalMap from '@/components/GlobalMap';
import GlobalMarketPanel from '@/components/GlobalMarketPanel';
import { CityOption } from '@/lib/geo';

interface BatteryState {
  level: number;
  trend: 'charging' | 'discharging';
  isDemandResponse: boolean;
  isReserveFloor: boolean;
  timeOfDay: 'peak' | 'offpeak';
  houses: any[];
  co2SavedKg: number;
}

interface OrderBookData {
  asks: any[];
  bids: any[];
  midPrice: number;
  ammSpotPrice: number;
}

interface RoomState {
  participants: ParticipantInfo[];
  battery: BatteryState;
  orderbook: OrderBookData;
  co2SavedKg: number;
  location?: CityOption;
  pendingEscrows: PendingEscrowInfo[];
  pendingSettlementCount: number;
  activeLoans: any[];
}

export default function RoomPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const roomCode = code.toUpperCase();
  const router = useRouter();

  const [participantId, setParticipantId] = useState<string | null>(null);
  const [participantName, setParticipantName] = useState<string>('');
  const [myHouseId, setMyHouseId] = useState<number | null>(null);
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [trades, setTrades] = useState<any[]>([]);
  const [activeFlow, setActiveFlow] = useState<{ fromHouse: number; toHouse: number } | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'local' | 'global'>('local');
  const [globalNeighborhoods, setGlobalNeighborhoods] = useState<any[]>([]);
  const [activeArc, setActiveArc] = useState<any>(null);
  const [settling, setSettling] = useState(false);
  const [settleResult, setSettleResult] = useState<any | null>(null);

  useEffect(() => {
    const pid = localStorage.getItem('participantId');
    const pname = localStorage.getItem('participantName');
    if (!pid) { router.push('/'); return; }
    setParticipantId(pid);
    setParticipantName(pname || '');
  }, [router]);

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch(`/api/rooms/${roomCode}/state`);
      if (!res.ok) { const data = await res.json(); setError(data.error || 'Failed to fetch room state'); return; }
      const data: RoomState = await res.json();
      setRoomState(data);
      if (participantId) {
        const me = data.participants.find(p => p.id === participantId);
        if (me) setMyHouseId(me.houseId);
      }
    } catch (e: any) { setError(e.message); }
  }, [roomCode, participantId]);

  const fetchTrades = useCallback(async () => {
    try {
      const res = await fetch(`/api/rooms/${roomCode}/transactions`);
      if (res.ok) { const data = await res.json(); if (data.trades) setTrades(data.trades); }
    } catch {}
  }, [roomCode]);

  const fetchData = useCallback(async () => {
    await fetchState();
    await fetchTrades();
    fetch('/api/global/neighborhoods').then(r => r.json()).then(data => {
      if (Array.isArray(data)) setGlobalNeighborhoods(data);
    }).catch(() => {});
  }, [fetchState, fetchTrades]);

  useEffect(() => {
    if (!participantId) return;
    fetchData();
    const stateInterval = setInterval(fetchState, 4000);
    const tradesInterval = setInterval(fetchTrades, 8000);
    return () => { clearInterval(stateInterval); clearInterval(tradesInterval); };
  }, [fetchData, fetchState, fetchTrades, participantId]);

  function handleMintSuccess(result: any) {
    fetchState(); fetchTrades();
    if (result.provenance?.houseId) {
      setActiveFlow({ fromHouse: result.provenance.houseId, toHouse: 0 });
      setTimeout(() => setActiveFlow(null), 2000);
    }
  }

  function handleBuySuccess(result: any) {
    fetchState(); fetchTrades();
    if (result.provenance?.houseId) {
      setActiveFlow({ fromHouse: result.provenance.houseId, toHouse: 0 });
      setTimeout(() => setActiveFlow(null), 2000);
    }
  }

  async function handleBatchSettle() {
    setSettling(true); setSettleResult(null);
    try {
      const res = await fetch(`/api/rooms/${roomCode}/batch-settle`, { method: 'POST' });
      const data = await res.json();
      setSettleResult(data); fetchState(); fetchTrades();
    } catch (e: any) { setSettleResult({ error: e.message }); }
    setSettling(false);
  }

  function handleCopyCode() {
    navigator.clipboard.writeText(roomCode).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }

  const battery = roomState?.battery ?? null;
  const orderBook = roomState?.orderbook ?? { asks: [], bids: [], midPrice: 0.10, ammSpotPrice: 0.10 };
  const participants = roomState?.participants ?? [];
  const pendingEscrows = roomState?.pendingEscrows ?? [];
  const pendingSettlementCount = roomState?.pendingSettlementCount ?? 0;

  if (!participantId) {
    return (
      <main style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--mono)', fontSize: '13px' }}>Redirecting...</span>
      </main>
    );
  }

  const tabBtn = (t: 'local' | 'global'): React.CSSProperties => ({
    padding: '7px 18px', fontSize: '12px', fontFamily: 'var(--mono)', borderRadius: '8px',
    border: 'none', cursor: 'pointer', transition: 'all 0.15s', letterSpacing: '0.05em',
    background: activeTab === t ? 'var(--gold)' : 'transparent',
    color: activeTab === t ? 'var(--surface)' : 'var(--text-muted-dark)',
    fontWeight: activeTab === t ? 700 : 400,
  });

  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)' }}>
      {/* Header */}
      <header style={{ borderBottom: '1px solid var(--border-light)', padding: '12px 24px', background: 'var(--bg)', position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ maxWidth: '1280px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h1 style={{ fontFamily: 'var(--serif)', fontStyle: 'normal', fontWeight: 700, fontSize: '24px', lineHeight: 1, color: 'var(--text)' }}>solarswap</h1>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--sans)' }}>P2P Energy · XRPL</span>
            <span style={{ padding: '2px 8px', fontSize: '10px', fontFamily: 'var(--mono)', letterSpacing: '0.08em', background: 'rgba(196,160,53,0.12)', color: 'var(--gold)', border: '1px solid rgba(196,160,53,0.25)', borderRadius: '99px' }}>TESTNET</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '6px 12px' }}>
              <span style={{ fontSize: '10px', color: 'var(--text-muted-dark)', fontFamily: 'var(--mono)' }}>room:</span>
              <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--gold)', letterSpacing: '0.15em', fontSize: '13px' }}>{roomCode}</span>
              <button onClick={handleCopyCode} style={{ background: 'none', border: 'none', cursor: 'pointer', color: copied ? 'var(--gold)' : 'var(--text-muted-dark)', fontFamily: 'var(--mono)', fontSize: '12px' }}>
                {copied ? '✓' : '⎘'}
              </button>
            </div>

            {myHouseId && (
              <div style={{ padding: '6px 12px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: '11px', fontFamily: 'var(--mono)', color: 'var(--gold)' }}>
                House <strong>{myHouseId}</strong>{participantName ? ` · ${participantName}` : ''}
              </div>
            )}

            <a href="/" style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--mono)', textDecoration: 'none' }}>← leave</a>
          </div>
        </div>
      </header>

      {error && (
        <div style={{ background: 'rgba(200,80,80,0.1)', borderBottom: '1px solid rgba(200,80,80,0.3)', padding: '8px 24px', fontSize: '12px', color: 'var(--red)', fontFamily: 'var(--mono)' }}>
          Error: {error}
        </div>
      )}

      <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '20px 28px' }}>
        {/* Metrics row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px', marginBottom: '18px' }}>
          <MetricCard label="Battery" value={battery ? `${battery.level}%` : '—'} sub={battery ? (battery.trend === 'charging' ? '↑ charging' : '↓ discharging') : ''} color={battery?.isReserveFloor ? 'red' : battery?.isDemandResponse ? 'amber' : 'gold'} />
          <MetricCard label="DEX Price" value={`$${orderBook.midPrice.toFixed(4)}`} sub="RLUSD/kWh" color="gold" />
          <MetricCard label="CO₂ Saved" value={`${(roomState?.co2SavedKg ?? 0).toFixed(1)} kg`} sub="room total" color="gold" />
          <MetricCard label={battery?.timeOfDay === 'peak' ? 'PEAK HOURS' : 'Off-Peak'} value={battery?.timeOfDay === 'peak' ? 'Active' : 'Standby'} sub="cycles every 3 min (demo)" color={battery?.timeOfDay === 'peak' ? 'red' : 'muted'} />
        </div>

        {/* Batch settle bar */}
        {pendingSettlementCount > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--surface)', border: '1px solid rgba(196,160,53,0.4)', borderRadius: 'var(--radius-sm)', padding: '10px 16px', marginBottom: '12px' }}>
            <div style={{ fontSize: '13px', color: 'var(--gold)', fontFamily: 'var(--mono)' }}>
              <strong>{pendingSettlementCount}</strong> micro-trade{pendingSettlementCount !== 1 ? 's' : ''} queued for atomic batch settlement
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              {settleResult && !settling && (
                <div style={{ fontSize: '11px', fontFamily: 'var(--mono)', color: settleResult.error ? 'var(--red)' : 'var(--gold)' }}>
                  {settleResult.error ? `Error: ${settleResult.error}` : settleResult.settledCount > 0 ? `✓ ${settleResult.settledCount} settled — ${settleResult.totalRlusd} RLUSD` : settleResult.message}
                </div>
              )}
              <button onClick={handleBatchSettle} disabled={settling} className="btn btn-primary" style={{ padding: '8px 16px', fontSize: '11px', opacity: settling ? 0.6 : 1 }}>
                {settling ? 'settling...' : 'settle all (batch)'}
              </button>
            </div>
          </div>
        )}

        {/* Tab switcher */}
        <div style={{ display: 'inline-flex', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '4px', marginBottom: '16px', gap: '4px' }}>
          <button onClick={() => setActiveTab('local')} style={tabBtn('local')}>local</button>
          <button onClick={() => setActiveTab('global')} style={tabBtn('global')}>global market</button>
        </div>

        {/* Local tab */}
        {activeTab === 'local' && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '7fr 5fr', gap: '20px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div className="card">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                    <span className="label">Neighborhood Grid</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      {pendingEscrows.filter(e => e.status === 'pending_iot').length > 0 && (
                        <span style={{ fontSize: '11px', color: 'var(--gold)', fontFamily: 'var(--mono)' }}>📡 IoT Verifying</span>
                      )}
                      {battery?.isDemandResponse && (
                        <span style={{ fontSize: '11px', color: 'var(--red)', fontFamily: 'var(--mono)' }}>Demand Response Active</span>
                      )}
                    </div>
                  </div>
                  <NeighborhoodMap batteryState={battery} activeFlow={activeFlow} participants={participants} pendingEscrows={pendingEscrows} />
                </div>

                <div className="card">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <span className="label">Participants</span>
                    <span className="badge">{participants.length}</span>
                  </div>
                  {participants.length === 0 ? (
                    <div style={{ fontSize: '12px', color: 'var(--text-muted-dark)', fontFamily: 'var(--mono)' }}>No participants yet. Share the code!</div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
                      {participants.map(p => {
                        const isMe = p.id === participantId;
                        const hasIot = pendingEscrows.some(e => e.participantId === p.id && e.status === 'pending_iot');
                        return (
                          <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', borderRadius: 'var(--radius-sm)', border: `1px solid ${isMe ? 'var(--gold)' : 'var(--border)'}`, background: isMe ? 'rgba(196,160,53,0.1)' : 'var(--surface2)', fontSize: '12px' }}>
                            <div style={{ width: '24px', height: '24px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, fontFamily: 'var(--mono)', background: isMe ? 'var(--gold)' : 'var(--border)', color: isMe ? 'var(--surface)' : 'var(--text-on-dark)', flexShrink: 0 }}>
                              {p.houseId}
                            </div>
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div style={{ fontWeight: 500, color: 'var(--text-on-dark)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {p.name}{isMe ? ' (you)' : ''}{hasIot && <span style={{ marginLeft: '4px', color: 'var(--gold)' }}>📡</span>}
                              </div>
                              <div style={{ color: 'var(--text-muted-dark)', fontFamily: 'var(--mono)', fontSize: '10px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {p.address.slice(0, 8)}…{p.address.slice(-4)}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <OrderBook asks={orderBook.asks} bids={orderBook.bids} midPrice={orderBook.midPrice} ammSpotPrice={orderBook.ammSpotPrice} />
                <TradePanels currentPrice={orderBook.midPrice} onMintSuccess={handleMintSuccess} onBuySuccess={handleBuySuccess} roomCode={roomCode} participantId={participantId ?? undefined} fixedHouseId={myHouseId ?? undefined} pendingSettlementCount={pendingSettlementCount} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '20px', marginTop: '20px' }}>
              <PriceChart currentPrice={orderBook.midPrice} ammSpotPrice={orderBook.ammSpotPrice} />
              <TradeHistory trades={trades} />
            </div>
          </>
        )}

        {activeTab === 'global' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <GlobalMap neighborhoods={globalNeighborhoods} myRoomCode={roomCode} activeArc={activeArc} />
            <GlobalMarketPanel
              roomCode={roomCode}
              participantId={participantId ?? ''}
              myCity={roomState?.location?.city ?? 'Unknown'}
              localPrice={roomState?.orderbook?.midPrice ?? 0.10}
              onTradeSuccess={(result) => {
                setActiveArc({ fromCode: result.sourceRoomCode ?? '', toCode: roomCode, id: Date.now().toString() });
                setTimeout(() => setActiveArc(null), 3500);
                fetchData();
              }}
            />
          </div>
        )}
      </div>
    </main>
  );
}

function MetricCard({ label, value, sub, color }: {
  label: string; value: string; sub: string;
  color: 'gold' | 'amber' | 'red' | 'muted';
}) {
  const colorMap = { gold: 'var(--gold)', amber: 'var(--gold)', red: 'var(--red)', muted: 'var(--text-muted-dark)' };
  return (
    <div className="card" style={{ padding: '18px 20px' }}>
      <div style={{ marginBottom: '6px' }}>
        <span className="label">{label}</span>
      </div>
      <div style={{ fontFamily: 'var(--mono)', fontSize: '20px', fontWeight: 700, color: colorMap[color] }}>{value}</div>
      <div style={{ fontSize: '11px', color: 'var(--text-muted-dark)', marginTop: '2px', fontFamily: 'var(--mono)' }}>{sub}</div>
    </div>
  );
}
