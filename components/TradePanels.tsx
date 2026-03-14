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

  const tabActive: React.CSSProperties = { background: 'var(--gold)', color: 'var(--surface)', fontWeight: 700 };
  const tabInactive: React.CSSProperties = { background: 'transparent', color: 'var(--text-muted-dark)' };

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '16px 18px', color: 'var(--text-on-dark)' }}>
      {/* Tabs */}
      <div style={{ display: 'flex', marginBottom: '16px', background: 'var(--surface2)', borderRadius: 'var(--radius-sm)', padding: '3px', gap: '3px' }}>
        <button
          style={{ flex: 1, padding: '8px', fontSize: '12px', fontFamily: 'var(--mono)', borderRadius: '10px', border: 'none', cursor: 'pointer', transition: 'all 0.15s', ...(activeTab === 'sell' ? tabActive : tabInactive) }}
          onClick={() => setActiveTab('sell')}
        >
          sell
        </button>
        <button
          style={{ flex: 1, padding: '8px', fontSize: '12px', fontFamily: 'var(--mono)', borderRadius: '10px', border: 'none', cursor: 'pointer', transition: 'all 0.15s', position: 'relative', ...(activeTab === 'buy' ? tabActive : tabInactive) }}
          onClick={() => setActiveTab('buy')}
        >
          buy
          {pendingSettlementCount > 0 && (
            <span style={{ position: 'absolute', top: '-4px', right: '-4px', width: '16px', height: '16px', background: 'var(--gold)', borderRadius: '50%', fontSize: '9px', color: 'var(--surface)', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {pendingSettlementCount}
            </span>
          )}
        </button>
        {roomCode && (
          <button
            style={{ flex: 1, padding: '8px', fontSize: '12px', fontFamily: 'var(--mono)', borderRadius: '10px', border: 'none', cursor: 'pointer', transition: 'all 0.15s', ...(activeTab === 'credit' ? tabActive : tabInactive) }}
            onClick={() => setActiveTab('credit')}
          >
            credit
          </button>
        )}
      </div>

      {/* Sell tab */}
      {activeTab === 'sell' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ background: 'rgba(196,160,53,0.1)', border: '1px solid rgba(196,160,53,0.25)', borderRadius: '10px', padding: '8px 10px', fontSize: '11px', color: 'var(--gold)', fontFamily: 'var(--mono)' }}>
            Earn <strong>{currentPrice.toFixed(4)} RLUSD/kWh</strong> — IoT-verified via XRPL Escrow
          </div>

          {!roomCode && (
            <div>
              <label style={{ display: 'block', fontSize: '10px', fontFamily: 'var(--mono)', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted-dark)', marginBottom: '6px' }}>House ID</label>
              <select value={houseId} onChange={e => setHouseId(e.target.value)} style={{ width: '100%', background: 'var(--surface2)', color: 'var(--text-on-dark)', border: '1px solid var(--border)', borderRadius: '10px', padding: '8px 10px', fontSize: '13px', fontFamily: 'var(--mono)', outline: 'none' }}>
                {[1,2,3,4,5,6].map(id => <option key={id} value={id}>House {id}</option>)}
              </select>
            </div>
          )}

          {roomCode && fixedHouseId && (
            <div style={{ background: 'var(--surface2)', borderRadius: '10px', padding: '8px 10px', fontSize: '11px', color: 'var(--text-muted-dark)', fontFamily: 'var(--mono)' }}>
              Selling as <span style={{ color: 'var(--gold)', fontWeight: 600 }}>House {fixedHouseId}</span>
            </div>
          )}

          <div>
            <label style={{ display: 'block', fontSize: '10px', fontFamily: 'var(--mono)', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted-dark)', marginBottom: '6px' }}>Energy Amount (kWh)</label>
            <input type="number" value={kWh} onChange={e => setKwh(e.target.value)} placeholder="10" min="0.01" step="0.5"
              style={{ width: '100%', background: 'var(--surface2)', color: 'var(--text-on-dark)', border: '1px solid var(--border)', borderRadius: '10px', padding: '8px 10px', fontSize: '13px', fontFamily: 'var(--mono)', outline: 'none' }} />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '10px', fontFamily: 'var(--mono)', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted-dark)', marginBottom: '6px' }}>Min Price (RLUSD/kWh, optional)</label>
            <input type="number" value={minPrice} onChange={e => setMinPrice(e.target.value)} placeholder={`${currentPrice.toFixed(4)} (AMM price)`} min="0" step="0.001"
              style={{ width: '100%', background: 'var(--surface2)', color: 'var(--text-on-dark)', border: '1px solid var(--border)', borderRadius: '10px', padding: '8px 10px', fontSize: '13px', fontFamily: 'var(--mono)', outline: 'none' }} />
          </div>

          <div style={{ background: 'var(--surface2)', borderRadius: '10px', padding: '8px 10px', fontSize: '11px', fontFamily: 'var(--mono)' }}>
            <span style={{ color: 'var(--text-muted-dark)' }}>Estimated earnings: </span>
            <span style={{ color: 'var(--gold)', fontWeight: 700 }}>{estimatedEarnings.toFixed(4)} RLUSD</span>
            <div style={{ color: 'var(--text-muted-dark)', marginTop: '3px' }}>1 XRP delivery bond held in Escrow until IoT confirms</div>
          </div>

          <button onClick={handleSell} disabled={loading} className="btn btn-primary" style={{ width: '100%', padding: '10px', fontSize: '13px', opacity: loading ? 0.6 : 1 }}>
            {loading ? 'Creating Escrow...' : 'Post Ask (IoT-Verified) →'}
          </button>

          {myIotStatus && <IoTStatusCard status={myIotStatus} />}
        </div>
      )}

      {/* Buy tab */}
      {activeTab === 'buy' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ background: 'rgba(196,160,53,0.1)', border: '1px solid rgba(196,160,53,0.25)', borderRadius: '10px', padding: '8px 10px', fontSize: '11px', color: 'var(--gold)', fontFamily: 'var(--mono)' }}>
            Save 47% vs grid peak. Trades ≤2 RLUSD queue for atomic Batch settlement.
          </div>

          {pendingSettlementCount > 0 && (
            <div style={{ background: 'var(--surface2)', border: '1px solid rgba(196,160,53,0.3)', borderRadius: '10px', padding: '8px 10px', fontSize: '11px', color: 'var(--gold)', fontFamily: 'var(--mono)', display: 'flex', justifyContent: 'space-between' }}>
              <span>{pendingSettlementCount} micro-trade{pendingSettlementCount !== 1 ? 's' : ''} queued</span>
              <span style={{ color: 'var(--text-muted-dark)', fontSize: '10px' }}>batch pending</span>
            </div>
          )}

          <div>
            <label style={{ display: 'block', fontSize: '10px', fontFamily: 'var(--mono)', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted-dark)', marginBottom: '6px' }}>RLUSD to Spend</label>
            <input type="number" value={rlusdAmount} onChange={e => setRlusdAmount(e.target.value)} placeholder="1.0" min="0.01" step="0.1"
              style={{ width: '100%', background: 'var(--surface2)', color: 'var(--text-on-dark)', border: '1px solid var(--border)', borderRadius: '10px', padding: '8px 10px', fontSize: '13px', fontFamily: 'var(--mono)', outline: 'none' }} />
          </div>

          <div style={{ background: 'var(--surface2)', borderRadius: '10px', padding: '8px 10px', fontSize: '11px', fontFamily: 'var(--mono)' }}>
            <span style={{ color: 'var(--text-muted-dark)' }}>Estimated: </span>
            <span style={{ color: 'var(--gold)', fontWeight: 700 }}>{estimatedKwh.toFixed(2)} kWh</span>
            <div style={{ color: 'var(--text-muted-dark)', marginTop: '3px' }}>~{(estimatedKwh * 0.386).toFixed(2)} kg CO₂ saved</div>
            <div style={{ color: 'var(--text-dim)', marginTop: '2px' }}>
              {parseFloat(rlusdAmount) <= 2 ? 'Will queue for Batch settlement (atomic)' : 'DEX first, AMM fallback'}
            </div>
          </div>

          <button onClick={handleBuy} disabled={loading} className="btn btn-primary" style={{ width: '100%', padding: '10px', fontSize: '13px', opacity: loading ? 0.6 : 1 }}>
            {loading ? 'Processing...' : parseFloat(rlusdAmount) <= 2 ? 'Queue for Batch →' : 'Buy Energy →'}
          </button>
        </div>
      )}

      {/* Credit tab */}
      {activeTab === 'credit' && roomCode && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ background: 'rgba(196,160,53,0.1)', border: '1px solid rgba(196,160,53,0.25)', borderRadius: '10px', padding: '8px 10px', fontSize: '11px', color: 'var(--gold)', fontFamily: 'var(--mono)' }}>
            <strong>Energy Credit Line</strong> — Borrow SOLAR now, repay RLUSD within 24h via XRPL LoanSet
          </div>

          {activeLoans.filter(l => l.status === 'active').length === 0 ? (
            <>
              <div>
                <label style={{ display: 'block', fontSize: '10px', fontFamily: 'var(--mono)', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted-dark)', marginBottom: '6px' }}>Borrow Amount (kWh, max 10)</label>
                <input type="number" value={borrowKwh} onChange={e => setBorrowKwh(e.target.value)} placeholder="5" min="0.5" max="10" step="0.5"
                  style={{ width: '100%', background: 'var(--surface2)', color: 'var(--text-on-dark)', border: '1px solid var(--border)', borderRadius: '10px', padding: '8px 10px', fontSize: '13px', fontFamily: 'var(--mono)', outline: 'none' }} />
              </div>
              <div style={{ background: 'var(--surface2)', borderRadius: '10px', padding: '8px 10px', fontSize: '11px', fontFamily: 'var(--mono)' }}>
                <span style={{ color: 'var(--text-muted-dark)' }}>Repay within 24h: </span>
                <span style={{ color: 'var(--gold)', fontWeight: 700 }}>{(parseFloat(borrowKwh || '0') * 0.12).toFixed(4)} RLUSD</span>
                <div style={{ color: 'var(--text-muted-dark)', marginTop: '3px' }}>Bilateral LoanSet countersigned by lender + borrower</div>
              </div>
              <button onClick={handleBorrow} disabled={loading} className="btn btn-primary" style={{ width: '100%', padding: '10px', fontSize: '13px', opacity: loading ? 0.6 : 1 }}>
                {loading ? 'Creating Credit Line...' : 'Borrow Energy Credit →'}
              </button>
            </>
          ) : null}

          {activeLoans.filter(l => l.status === 'active').map(loan => (
            <LoanCard key={loan.id} loan={loan} onRepay={(loanId) => { handleRepay(loanId, (loan.kWh * 0.12).toFixed(6)); }} loading={loading} />
          ))}

          {activeLoans.filter(l => l.status === 'repaid').length > 0 && (
            <div style={{ fontSize: '11px', color: 'var(--text-muted-dark)', fontFamily: 'var(--mono)' }}>
              {activeLoans.filter(l => l.status === 'repaid').length} loan(s) repaid
            </div>
          )}
        </div>
      )}

      {message && (
        <div style={{ marginTop: '10px', padding: '8px 10px', borderRadius: '10px', fontSize: '11px', fontFamily: 'var(--mono)', background: message.type === 'success' ? 'rgba(196,160,53,0.12)' : 'rgba(200,80,80,0.12)', color: message.type === 'success' ? 'var(--gold)' : 'var(--red)', border: `1px solid ${message.type === 'success' ? 'rgba(196,160,53,0.3)' : 'rgba(200,80,80,0.3)'}` }}>
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
      <div style={{ background: 'rgba(196,160,53,0.12)', border: '1px solid rgba(196,160,53,0.3)', borderRadius: '10px', padding: '10px 12px', fontSize: '11px' }}>
        <div style={{ color: 'var(--gold)', fontWeight: 600, fontFamily: 'var(--mono)' }}>{status.kWh} kWh verified on-chain</div>
        <div style={{ color: 'var(--text-muted-dark)', marginTop: '3px', fontFamily: 'var(--mono)' }}>IoT meter confirmed — SOLAR tokens minted</div>
      </div>
    );
  }

  if (status.status === 'failed') {
    return (
      <div style={{ background: 'rgba(200,80,80,0.12)', border: '1px solid rgba(200,80,80,0.3)', borderRadius: '10px', padding: '10px 12px', fontSize: '11px' }}>
        <div style={{ color: 'var(--red)', fontWeight: 600, fontFamily: 'var(--mono)' }}>IoT meter rejected delivery</div>
        <div style={{ color: 'var(--text-muted-dark)', marginTop: '3px', fontFamily: 'var(--mono)' }}>Delivery bond (1 XRP) will be returned via EscrowCancel after the lock period (~2 min). You can retry.</div>
      </div>
    );
  }

  return (
    <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '10px', padding: '10px 12px', fontSize: '11px' }}>
      <div style={{ color: 'var(--gold)', fontWeight: 600, fontFamily: 'var(--mono)', marginBottom: '8px' }}>📡 IoT meter verifying delivery...</div>
      <div style={{ width: '100%', background: 'var(--border)', borderRadius: '99px', height: '4px', marginBottom: '8px' }}>
        <div style={{ width: `${progress}%`, height: '4px', borderRadius: '99px', background: 'var(--gold)', transition: 'width 1s' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted-dark)', fontFamily: 'var(--mono)' }}>
        <span>{status.remainingSec > 0 ? `${status.remainingSec}s remaining` : 'Finalizing...'}</span>
        <a href={txUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--gold)', textDecoration: 'none', fontFamily: 'var(--mono)' }}>
          {status.escrowTxHash.slice(0, 6)}…
        </a>
      </div>
    </div>
  );
}

function LoanCard({ loan, onRepay, loading }: { loan: ActiveLoan; onRepay: (loanId: string) => void; loading: boolean }) {
  const now = Math.floor(Date.now() / 1000) - 946684800;
  const secsLeft = loan.dueDateRippleTime - now;
  const hoursLeft = Math.max(0, Math.floor(secsLeft / 3600));
  const repayAmount = (loan.kWh * 0.12).toFixed(4);

  return (
    <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '10px', padding: '10px 12px', fontSize: '11px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ color: 'var(--gold)', fontWeight: 600, fontFamily: 'var(--mono)' }}>Outstanding: {loan.kWh} kWh</span>
        <span style={{ fontFamily: 'var(--mono)', color: hoursLeft < 4 ? 'var(--red)' : 'var(--text-muted-dark)' }}>Due in {hoursLeft}h</span>
      </div>
      <div style={{ color: 'var(--text-muted-dark)', fontFamily: 'var(--mono)' }}>
        Repay <span style={{ color: 'var(--gold)' }}>{repayAmount} RLUSD</span> via LoanPay
        {loan.simulated && <span style={{ color: 'var(--text-dim)', marginLeft: '6px' }}>(server-tracked)</span>}
      </div>
      <button onClick={() => onRepay(loan.id)} disabled={loading} className="btn btn-primary" style={{ width: '100%', padding: '8px', fontSize: '12px', opacity: loading ? 0.6 : 1 }}>
        {loading ? 'Repaying...' : `Repay ${repayAmount} RLUSD →`}
      </button>
    </div>
  );
}
