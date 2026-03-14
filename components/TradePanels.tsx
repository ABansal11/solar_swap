'use client';

import { useState, useEffect } from 'react';

interface TradePanelsProps {
  currentPrice: number;
  onMintSuccess?: (result: any) => void;
  onBuySuccess?: (result: any) => void;
  roomCode?: string;
  participantId?: string;
  fixedHouseId?: number;
  pendingSettlementCount?: number;
}

interface IoTStatus {
  id: string;
  participantId: string;
  kWh: number;
  status: 'pending_iot' | 'verified' | 'failed';
  houseId: number;
  remainingSec: number;
  escrowTxHash: string;
}

interface ActiveLoan {
  id: string;
  kWh: number;
  mptAmount: string;
  dueDateRippleTime: number;
  status: 'active' | 'repaid' | 'overdue';
  simulated: boolean;
}

export default function TradePanels({
  currentPrice,
  onMintSuccess,
  onBuySuccess,
  roomCode,
  participantId,
  fixedHouseId,
  pendingSettlementCount = 0,
}: TradePanelsProps) {
  const [activeTab, setActiveTab] = useState<'sell' | 'buy' | 'credit'>('sell');
  const [kWh, setKwh] = useState('10');
  const [minPrice, setMinPrice] = useState('');
  const [houseId, setHouseId] = useState('1');
  const [rlusdAmount, setRlusdAmount] = useState('1');
  const [borrowKwh, setBorrowKwh] = useState('5');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // IoT status polling
  const [myIotStatus, setMyIotStatus] = useState<IoTStatus | null>(null);

  // Active loans for current participant
  const [activeLoans, setActiveLoans] = useState<ActiveLoan[]>([]);

  const estimatedEarnings = parseFloat(kWh || '0') * currentPrice;
  const estimatedKwh = parseFloat(rlusdAmount || '0') / currentPrice;

  // Poll IoT status every 2s when there are pending escrows
  useEffect(() => {
    if (!roomCode || !participantId) return;

    const poll = async () => {
      try {
        const res = await fetch(`/api/rooms/${roomCode}/iot-status`);
        if (!res.ok) return;
        const data = await res.json();
        const statuses: IoTStatus[] = data.escrows || [];
        const mine = statuses.find(s => s.participantId === participantId) ?? null;
        setMyIotStatus(mine);
      } catch {}
    };

    poll();
    const interval = setInterval(poll, 2000);
    return () => clearInterval(interval);
  }, [roomCode, participantId]);

  // Fetch active loans from room state
  useEffect(() => {
    if (!roomCode || !participantId) return;

    const fetchLoans = async () => {
      try {
        const res = await fetch(`/api/rooms/${roomCode}/state`);
        if (!res.ok) return;
        const data = await res.json();
        const loans: ActiveLoan[] = (data.activeLoans || []).filter(
          (l: any) => l.borrowerParticipantId === participantId
        );
        setActiveLoans(loans);
      } catch {}
    };

    fetchLoans();
    const interval = setInterval(fetchLoans, 6000);
    return () => clearInterval(interval);
  }, [roomCode, participantId]);

  async function handleSell() {
    setLoading(true);
    setMessage(null);
    try {
      let res: Response;
      if (roomCode && participantId) {
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
      } else if (data.status === 'pending_iot') {
        setMessage({ type: 'success', text: `📡 IoT meter verifying ${data.kWh} kWh delivery... (escrow posted)` });
        onMintSuccess?.(data);
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
        res = await fetch(`/api/rooms/${roomCode}/buy`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ participantId, rlusdAmount }),
        });
      } else {
        res = await fetch('/api/buy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rlusdAmount }),
        });
      }
      const data = await res.json();
      if (!res.ok) {
        setMessage({ type: 'error', text: data.error });
      } else if (data.status === 'queued') {
        setMessage({ type: 'success', text: `⏳ Trade queued for batch settlement (${data.pendingCount} pending)` });
        onBuySuccess?.(data);
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

  async function handleBorrow() {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/rooms/${roomCode}/borrow`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ participantId, kWh: parseFloat(borrowKwh) }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ type: 'error', text: data.error });
      } else {
        setMessage({ type: 'success', text: data.message });
      }
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message });
    }
    setLoading(false);
  }

  async function handleRepay(loanId: string, repayRlusd: string) {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/rooms/${roomCode}/repay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ participantId, loanId, rlusdAmount: repayRlusd }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ type: 'error', text: data.error });
      } else {
        setMessage({ type: 'success', text: `Loan repaid! TX: ${data.txHash?.slice(0, 8)}...` });
      }
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message });
    }
    setLoading(false);
  }

  return (
    <div className="bg-slate-800 rounded-lg p-4">
      {/* Tabs */}
      <div className="flex mb-4 bg-slate-700 rounded-lg p-0.5">
        <button
          className={`flex-1 py-2 text-xs font-medium rounded-md transition-colors ${activeTab === 'sell' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}
          onClick={() => setActiveTab('sell')}
        >
          ⚡ Sell
        </button>
        <button
          className={`flex-1 py-2 text-xs font-medium rounded-md transition-colors relative ${activeTab === 'buy' ? 'bg-green-600 text-white' : 'text-slate-400 hover:text-white'}`}
          onClick={() => setActiveTab('buy')}
        >
          🛒 Buy
          {pendingSettlementCount > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-yellow-500 rounded-full text-[9px] text-black font-bold flex items-center justify-center">
              {pendingSettlementCount}
            </span>
          )}
        </button>
        {roomCode && (
          <button
            className={`flex-1 py-2 text-xs font-medium rounded-md transition-colors ${activeTab === 'credit' ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-white'}`}
            onClick={() => setActiveTab('credit')}
          >
            💳 Credit
          </button>
        )}
      </div>

      {/* Sell tab */}
      {activeTab === 'sell' && (
        <div className="space-y-3">
          <div className="bg-blue-900/30 border border-blue-700/50 rounded p-2 text-xs text-blue-300">
            💰 Earn <strong>{currentPrice.toFixed(4)} RLUSD/kWh</strong> — IoT-verified via XRPL Escrow
          </div>

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
            <div className="text-slate-500 mt-0.5">🔒 1 XRP delivery bond held in Escrow until IoT confirms</div>
          </div>

          <button
            onClick={handleSell}
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-slate-600 text-white font-medium py-2.5 rounded-lg text-sm transition-colors"
          >
            {loading ? 'Creating Escrow...' : 'Post Ask (IoT-Verified) →'}
          </button>

          {/* IoT verification status */}
          {myIotStatus && (
            <IoTStatusCard status={myIotStatus} />
          )}
        </div>
      )}

      {/* Buy tab */}
      {activeTab === 'buy' && (
        <div className="space-y-3">
          <div className="bg-green-900/30 border border-green-700/50 rounded p-2 text-xs text-green-300">
            💡 Save <strong>47% vs PG&amp;E peak</strong>. ≤2 RLUSD → queued for atomic Batch settlement
          </div>

          {pendingSettlementCount > 0 && (
            <div className="bg-yellow-900/30 border border-yellow-700/30 rounded p-2 text-xs text-yellow-300 flex items-center justify-between">
              <span>⚡ {pendingSettlementCount} micro-trade{pendingSettlementCount !== 1 ? 's' : ''} queued</span>
              <span className="text-yellow-500 text-[10px]">Batch pending</span>
            </div>
          )}

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
            <div className="text-slate-500 mt-0.5">
              {parseFloat(rlusdAmount) <= 2 ? '⏳ Will queue for Batch settlement (atomic)' : 'DEX first, AMM fallback'}
            </div>
          </div>

          <button
            onClick={handleBuy}
            disabled={loading}
            className="w-full bg-green-600 hover:bg-green-500 disabled:bg-slate-600 text-white font-medium py-2.5 rounded-lg text-sm transition-colors"
          >
            {loading ? 'Processing...' : parseFloat(rlusdAmount) <= 2 ? 'Queue for Batch →' : 'Buy Energy →'}
          </button>
        </div>
      )}

      {/* Credit tab */}
      {activeTab === 'credit' && roomCode && (
        <div className="space-y-3">
          <div className="bg-purple-900/30 border border-purple-700/50 rounded p-2 text-xs text-purple-300">
            💳 <strong>Energy Credit Line</strong> — Borrow SOLAR now, repay RLUSD within 24h via XRPL LoanSet
          </div>

          {activeLoans.filter(l => l.status === 'active').length === 0 ? (
            <>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Borrow Amount (kWh, max 10)</label>
                <input
                  type="number"
                  value={borrowKwh}
                  onChange={e => setBorrowKwh(e.target.value)}
                  className="w-full bg-slate-700 text-white text-sm rounded px-3 py-2 border border-slate-600"
                  placeholder="5"
                  min="0.5"
                  max="10"
                  step="0.5"
                />
              </div>

              <div className="bg-slate-700/50 rounded p-2 text-xs">
                <span className="text-slate-400">Repay within 24h: </span>
                <span className="text-yellow-400 font-bold">{(parseFloat(borrowKwh || '0') * 0.12).toFixed(4)} RLUSD</span>
                <div className="text-slate-500 mt-0.5">Bilateral LoanSet countersigned by lender + borrower</div>
              </div>

              <button
                onClick={handleBorrow}
                disabled={loading}
                className="w-full bg-purple-600 hover:bg-purple-500 disabled:bg-slate-600 text-white font-medium py-2.5 rounded-lg text-sm transition-colors"
              >
                {loading ? 'Creating Credit Line...' : 'Borrow Energy Credit →'}
              </button>
            </>
          ) : null}

          {/* Outstanding loans */}
          {activeLoans.filter(l => l.status === 'active').map(loan => (
            <LoanCard
              key={loan.id}
              loan={loan}
              onRepay={(loanId) => {
                const repayAmt = (loan.kWh * 0.12).toFixed(6);
                handleRepay(loanId, repayAmt);
              }}
              loading={loading}
            />
          ))}

          {activeLoans.filter(l => l.status === 'repaid').length > 0 && (
            <div className="text-xs text-slate-500 mt-1">
              ✅ {activeLoans.filter(l => l.status === 'repaid').length} loan(s) repaid
            </div>
          )}
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

function IoTStatusCard({ status }: { status: IoTStatus }) {
  const progress = Math.max(0, Math.min(100, ((35 - status.remainingSec) / 35) * 100));
  const txUrl = `https://testnet.xrpl.org/transactions/${status.escrowTxHash}`;

  if (status.status === 'verified') {
    return (
      <div className="bg-green-900/40 border border-green-700/50 rounded p-3 text-xs">
        <div className="text-green-400 font-semibold">✅ {status.kWh} kWh verified on-chain</div>
        <div className="text-green-600 mt-0.5">IoT meter confirmed — SOLAR tokens minted</div>
      </div>
    );
  }

  if (status.status === 'failed') {
    return (
      <div className="bg-red-900/40 border border-red-700/50 rounded p-3 text-xs">
        <div className="text-red-400 font-semibold">❌ Meter rejected — insufficient output</div>
        <div className="text-red-600 mt-0.5">Delivery bond (1 XRP) returned via EscrowCancel</div>
      </div>
    );
  }

  return (
    <div className="bg-blue-900/40 border border-blue-700/50 rounded p-3 text-xs">
      <div className="text-blue-300 font-semibold mb-1.5">📡 IoT meter verifying delivery...</div>
      <div className="w-full bg-slate-700 rounded-full h-2 mb-1.5">
        <div
          className="bg-blue-500 h-2 rounded-full transition-all duration-1000"
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="flex justify-between text-slate-400">
        <span>{status.remainingSec > 0 ? `${status.remainingSec}s remaining` : 'Finalizing...'}</span>
        <a
          href={txUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-400 hover:text-blue-300 font-mono"
        >
          {status.escrowTxHash.slice(0, 6)}…
        </a>
      </div>
    </div>
  );
}

function LoanCard({
  loan,
  onRepay,
  loading,
}: {
  loan: ActiveLoan;
  onRepay: (loanId: string) => void;
  loading: boolean;
}) {
  const now = Math.floor(Date.now() / 1000) - 946684800;
  const secsLeft = loan.dueDateRippleTime - now;
  const hoursLeft = Math.max(0, Math.floor(secsLeft / 3600));
  const repayAmount = (loan.kWh * 0.12).toFixed(4);

  return (
    <div className="bg-purple-900/30 border border-purple-700/30 rounded p-3 text-xs space-y-2">
      <div className="flex justify-between">
        <span className="text-purple-300 font-semibold">Outstanding: {loan.kWh} kWh</span>
        <span className={`font-mono ${hoursLeft < 4 ? 'text-red-400' : 'text-slate-400'}`}>
          Due in {hoursLeft}h
        </span>
      </div>
      <div className="text-slate-400">
        Repay <span className="text-yellow-400">{repayAmount} RLUSD</span> via LoanPay
        {loan.simulated && <span className="text-slate-600 ml-1">(server-tracked)</span>}
      </div>
      <button
        onClick={() => onRepay(loan.id)}
        disabled={loading}
        className="w-full bg-purple-700 hover:bg-purple-600 disabled:bg-slate-600 text-white py-1.5 rounded text-xs transition-colors"
      >
        {loading ? 'Repaying...' : `Repay ${repayAmount} RLUSD →`}
      </button>
    </div>
  );
}
