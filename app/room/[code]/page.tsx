'use client';

import { useState, useEffect, useCallback, use } from 'react';
import { useRouter } from 'next/navigation';
import NeighborhoodMap, { ParticipantInfo } from '@/components/NeighborhoodMap';
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

  // Read participant info from localStorage on mount
  useEffect(() => {
    const pid = localStorage.getItem('participantId');
    const pname = localStorage.getItem('participantName');
    if (!pid) {
      // Not joined — redirect to lobby
      router.push('/');
      return;
    }
    setParticipantId(pid);
    setParticipantName(pname || '');
  }, [router]);

  // Fetch room state
  const fetchState = useCallback(async () => {
    try {
      const res = await fetch(`/api/rooms/${roomCode}/state`);
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to fetch room state');
        return;
      }
      const data: RoomState = await res.json();
      setRoomState(data);

      // Find my houseId from participants list
      if (participantId) {
        const me = data.participants.find(p => p.id === participantId);
        if (me) setMyHouseId(me.houseId);
      }
    } catch (e: any) {
      setError(e.message);
    }
  }, [roomCode, participantId]);

  const fetchTrades = useCallback(async () => {
    try {
      const res = await fetch(`/api/rooms/${roomCode}/transactions`);
      if (res.ok) {
        const data = await res.json();
        if (data.trades) setTrades(data.trades);
      }
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
    return () => {
      clearInterval(stateInterval);
      clearInterval(tradesInterval);
    };
  }, [fetchData, fetchState, fetchTrades, participantId]);

  function handleMintSuccess(result: any) {
    fetchState();
    fetchTrades();
    if (result.provenance?.houseId) {
      setActiveFlow({ fromHouse: result.provenance.houseId, toHouse: 0 });
      setTimeout(() => setActiveFlow(null), 2000);
    }
  }

  function handleBuySuccess(result: any) {
    fetchState();
    fetchTrades();
    if (result.provenance?.houseId) {
      setActiveFlow({ fromHouse: result.provenance.houseId, toHouse: 0 });
      setTimeout(() => setActiveFlow(null), 2000);
    }
  }

  function handleCopyCode() {
    navigator.clipboard.writeText(roomCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const battery = roomState?.battery ?? null;
  const orderBook = roomState?.orderbook ?? { asks: [], bids: [], midPrice: 0.10, ammSpotPrice: 0.10 };
  const participants = roomState?.participants ?? [];

  const nextPeakHour = () => {
    const now = new Date();
    const hour = now.getHours();
    if (hour < 17) return `${17 - hour}h`;
    if (hour >= 21) return `${41 - hour}h`;
    return 'NOW';
  };

  if (!participantId) {
    return (
      <main className="min-h-screen bg-slate-900 text-white flex items-center justify-center">
        <div className="text-slate-400">Redirecting to lobby...</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-900 text-white">
      {/* Header */}
      <header className="border-b border-slate-700 px-6 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">⚡</span>
            <div>
              <h1 className="font-bold text-lg leading-none">SolarSwap</h1>
              <p className="text-xs text-slate-400">P2P Energy Marketplace on XRPL</p>
            </div>
            <span className="ml-2 px-2 py-0.5 text-xs bg-orange-500/20 text-orange-400 border border-orange-500/30 rounded-full">Testnet</span>
          </div>

          <div className="flex items-center gap-3">
            {/* Share code */}
            <div className="flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5">
              <span className="text-xs text-slate-400">Share code:</span>
              <span className="font-mono font-bold text-yellow-400 tracking-widest text-sm">{roomCode}</span>
              <button
                onClick={handleCopyCode}
                className="text-xs text-slate-400 hover:text-white transition-colors ml-1"
              >
                {copied ? '✓' : '⎘'}
              </button>
            </div>

            {/* My house indicator */}
            {myHouseId && (
              <div className="px-3 py-1.5 bg-blue-600/20 border border-blue-500/30 rounded-lg text-xs text-blue-300">
                You are <span className="font-bold">House {myHouseId}</span>
                {participantName ? ` (${participantName})` : ''}
              </div>
            )}

            <a
              href="/"
              className="text-xs text-slate-400 hover:text-slate-300 transition-colors"
            >
              ← Leave
            </a>
          </div>
        </div>
      </header>

      {error && (
        <div className="bg-red-900/50 border-b border-red-700 px-6 py-2 text-sm text-red-300">
          Error: {error}
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 py-4">
        {/* Metrics row */}
        <div className="grid grid-cols-4 gap-3 mb-4">
          <MetricCard
            icon="🔋"
            label="Battery"
            value={battery ? `${battery.level}%` : '—'}
            sub={battery ? (battery.trend === 'charging' ? '↑ Charging' : '↓ Discharging') : ''}
            color={battery?.isReserveFloor ? 'red' : battery?.isDemandResponse ? 'orange' : 'green'}
          />
          <MetricCard
            icon="⚡"
            label="DEX Price"
            value={`$${orderBook.midPrice.toFixed(4)}`}
            sub="RLUSD/kWh"
            color="yellow"
          />
          <MetricCard
            icon="🌿"
            label="CO₂ Saved"
            value={`${(roomState?.co2SavedKg ?? 0).toFixed(1)} kg`}
            sub="Room total (CA grid avg)"
            color="green"
          />
          <MetricCard
            icon="⏰"
            label={battery?.timeOfDay === 'peak' ? 'PEAK HOURS' : 'Off-Peak'}
            value={battery?.timeOfDay === 'peak' ? 'Active' : `Peak in ${nextPeakHour()}`}
            sub="17:00–21:00 local"
            color={battery?.timeOfDay === 'peak' ? 'red' : 'blue'}
          />
        </div>

        {/* Tab switcher */}
        <div className="flex gap-1 bg-slate-800 rounded-lg p-1 mb-4 w-fit">
          <button
            onClick={() => setActiveTab('local')}
            className={`px-4 py-1.5 text-sm rounded-md transition-colors ${activeTab === 'local' ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-white'}`}
          >
            🏘 Local
          </button>
          <button
            onClick={() => setActiveTab('global')}
            className={`px-4 py-1.5 text-sm rounded-md transition-colors ${activeTab === 'global' ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-white'}`}
          >
            🌍 Global Market
          </button>
        </div>

        {/* Local tab */}
        {activeTab === 'local' && (
          <>
            {/* Main grid */}
            <div className="grid grid-cols-12 gap-4">
              {/* Left: Neighborhood Map + Participant Sidebar */}
              <div className="col-span-7 space-y-3">
                <div className="bg-slate-800 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h2 className="font-semibold text-sm text-slate-300">Neighborhood Grid</h2>
                    {battery?.isDemandResponse && (
                      <span className="text-xs text-orange-400 animate-pulse">⚠ Demand Response Active</span>
                    )}
                  </div>
                  <NeighborhoodMap batteryState={battery} activeFlow={activeFlow} participants={participants} />
                </div>

                {/* Participant list */}
                <div className="bg-slate-800 rounded-xl p-4">
                  <h2 className="font-semibold text-sm text-slate-300 mb-3">
                    Participants ({participants.length}/6)
                  </h2>
                  {participants.length === 0 ? (
                    <div className="text-xs text-slate-500">No participants yet. Share the code!</div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      {participants.map(p => (
                        <div
                          key={p.id}
                          className={`flex items-center gap-2 p-2 rounded-lg border text-xs ${
                            p.id === participantId
                              ? 'bg-blue-600/20 border-blue-500/40'
                              : 'bg-slate-700/50 border-slate-600/30'
                          }`}
                        >
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                            p.id === participantId ? 'bg-blue-600' : 'bg-slate-600'
                          }`}>
                            {p.houseId}
                          </div>
                          <div className="min-w-0">
                            <div className="font-medium text-white truncate">
                              {p.name}{p.id === participantId ? ' (you)' : ''}
                            </div>
                            <div className="text-slate-500 truncate font-mono text-[10px]">
                              {p.address.slice(0, 8)}…{p.address.slice(-4)}
                            </div>
                          </div>
                        </div>
                      ))}
                      {/* Empty slots */}
                      {Array.from({ length: 6 - participants.length }).map((_, i) => (
                        <div key={`empty-${i}`} className="flex items-center gap-2 p-2 rounded-lg border border-dashed border-slate-700 text-xs text-slate-600">
                          <div className="w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center text-xs">
                            {participants.length + i + 1}
                          </div>
                          <span>Waiting for player...</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Right: Stats + Controls */}
              <div className="col-span-5 space-y-4">
                <OrderBook
                  asks={orderBook.asks}
                  bids={orderBook.bids}
                  midPrice={orderBook.midPrice}
                  ammSpotPrice={orderBook.ammSpotPrice}
                />
                <TradePanels
                  currentPrice={orderBook.midPrice}
                  onMintSuccess={handleMintSuccess}
                  onBuySuccess={handleBuySuccess}
                  roomCode={roomCode}
                  participantId={participantId ?? undefined}
                  fixedHouseId={myHouseId ?? undefined}
                />
              </div>
            </div>

            {/* Bottom row */}
            <div className="grid grid-cols-2 gap-4 mt-4">
              <PriceChart currentPrice={orderBook.midPrice} ammSpotPrice={orderBook.ammSpotPrice} />
              <TradeHistory trades={trades} />
            </div>
          </>
        )}

        {/* Global tab */}
        {activeTab === 'global' && (
          <div className="space-y-4">
            <GlobalMap
              neighborhoods={globalNeighborhoods}
              myRoomCode={roomCode}
              activeArc={activeArc}
            />
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

function MetricCard({ icon, label, value, sub, color }: {
  icon: string; label: string; value: string; sub: string; color: 'green' | 'yellow' | 'red' | 'orange' | 'blue';
}) {
  const colorMap = {
    green: 'text-green-400',
    yellow: 'text-yellow-400',
    red: 'text-red-400',
    orange: 'text-orange-400',
    blue: 'text-blue-400',
  };

  return (
    <div className="bg-slate-800 rounded-lg p-3 border border-slate-700">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-base">{icon}</span>
        <span className="text-xs text-slate-400 uppercase tracking-wide">{label}</span>
      </div>
      <div className={`text-xl font-bold ${colorMap[color]}`}>{value}</div>
      <div className="text-xs text-slate-500 mt-0.5">{sub}</div>
    </div>
  );
}
