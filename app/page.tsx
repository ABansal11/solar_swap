'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CITIES } from '@/lib/geo';

export default function LobbyPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState('');
  const [showCityPicker, setShowCityPicker] = useState(false);

  async function handleCreateClick() {
    if (!name.trim()) { setError('Please enter your name first.'); return; }
    setError('');
    setShowCityPicker(true);
  }

  async function handleCreateRoom(cityName: string) {
    setCreating(true);
    setError('');
    try {
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ city: cityName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create room');
      const code: string = data.code;
      const joinRes = await fetch(`/api/rooms/${code}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      });
      const joinData = await joinRes.json();
      if (!joinRes.ok) throw new Error(joinData.error || 'Failed to join room');
      localStorage.setItem('participantId', joinData.participantId);
      localStorage.setItem('participantName', name.trim());
      router.push(`/room/${code}`);
    } catch (e: any) { setError(e.message); }
    setCreating(false);
  }

  async function handleJoin() {
    if (!name.trim()) { setError('Please enter your name first.'); return; }
    const code = joinCode.trim().toUpperCase();
    if (code.length !== 6) { setError('Join code must be 6 characters.'); return; }
    setJoining(true);
    setError('');
    try {
      const res = await fetch(`/api/rooms/${code}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to join room');
      localStorage.setItem('participantId', data.participantId);
      localStorage.setItem('participantName', name.trim());
      router.push(`/room/${code}`);
    } catch (e: any) { setError(e.message); }
    setJoining(false);
  }

  const isLoading = creating || joining;

  return (
    <main style={{
      minHeight: '100vh',
      background: 'var(--bg)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px 16px',
    }}>
      <div style={{ width: '100%', maxWidth: '420px' }}>

        {/* Logo / title */}
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <h1 style={{
            fontFamily: 'var(--serif)',
            fontStyle: 'normal',
            fontSize: '80px',
            fontWeight: 700,
            lineHeight: 0.95,
            color: 'var(--text)',
            letterSpacing: '-0.02em',
            marginBottom: '14px',
          }}>
            solar<br/>swap
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '16px', fontFamily: 'var(--sans)' }}>
            P2P Energy Marketplace on XRPL
          </p>
          <span style={{
            display: 'inline-block',
            marginTop: '10px',
            padding: '3px 10px',
            fontSize: '10px',
            fontFamily: 'var(--mono)',
            letterSpacing: '0.08em',
            background: 'rgba(196,160,53,0.12)',
            color: 'var(--gold)',
            border: '1px solid rgba(196,160,53,0.3)',
            borderRadius: '99px',
          }}>TESTNET</span>
        </div>

        {/* Card */}
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: '32px',
          display: 'flex',
          flexDirection: 'column',
          gap: '22px',
        }}>
          {/* Name input */}
          <div>
            <label style={{
              display: 'block',
              fontFamily: 'var(--mono)',
              fontSize: '12px',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: 'var(--text-muted-dark)',
              marginBottom: '10px',
            }}>Your name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Enter your name..."
              disabled={isLoading}
              style={{
                width: '100%',
                background: 'var(--surface2)',
                color: 'var(--text-on-dark)',
                borderRadius: 'var(--radius-sm)',
                padding: '14px 18px',
                border: '1px solid var(--border)',
                fontSize: '16px',
                fontFamily: 'var(--sans)',
                outline: 'none',
                transition: 'border-color 0.15s',
              }}
              onFocus={e => (e.target.style.borderColor = 'var(--gold)')}
              onBlur={e => (e.target.style.borderColor = 'var(--border)')}
            />
          </div>

          {/* Create room */}
          {!showCityPicker ? (
            <button
              className="btn btn-primary"
              onClick={handleCreateClick}
              disabled={isLoading}
              style={{ width: '100%', opacity: isLoading ? 0.6 : 1 }}
            >
              {creating ? '⏳ setting up room...' : 'create room'}
            </button>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <span style={{
                fontFamily: 'var(--mono)',
                fontSize: '10px',
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: 'var(--text-muted-dark)',
              }}>pick your neighborhood city</span>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                {CITIES.map(city => (
                  <button
                    key={city.city}
                    onClick={() => handleCreateRoom(city.city)}
                    disabled={creating}
                    style={{
                      background: 'var(--surface2)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-sm)',
                      padding: '10px 6px',
                      cursor: 'pointer',
                      color: 'var(--text-on-dark)',
                      transition: 'all 0.15s',
                      textAlign: 'center',
                    }}
                    onMouseEnter={e => {
                      (e.currentTarget as HTMLElement).style.borderColor = 'var(--gold)';
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)';
                    }}
                  >
                    <div style={{ fontSize: '18px' }}>{city.flag}</div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', fontWeight: 700, marginTop: '3px' }}>{city.city}</div>
                    <div style={{ fontSize: '9px', color: 'var(--text-muted-dark)', marginTop: '1px' }}>{city.country}</div>
                  </button>
                ))}
              </div>
              {creating && (
                <p style={{ fontSize: '11px', color: 'var(--gold)', textAlign: 'center', fontFamily: 'var(--mono)' }}>
                  ⏳ setting up room... (30–60s)
                </p>
              )}
              <button
                onClick={() => setShowCityPicker(false)}
                disabled={creating}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '11px', color: 'var(--text-muted-dark)', fontFamily: 'var(--mono)', padding: '2px 0' }}
              >
                ← back
              </button>
            </div>
          )}

          {/* Divider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
            <span style={{ fontSize: '12px', color: 'var(--text-muted-dark)', fontFamily: 'var(--mono)', letterSpacing: '0.08em' }}>or join existing</span>
            <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
          </div>

          {/* Join room */}
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              value={joinCode}
              onChange={e => setJoinCode(e.target.value.toUpperCase())}
              placeholder="CODE: XXXXXX"
              maxLength={6}
              disabled={isLoading}
              style={{
                flex: 1,
                background: 'var(--surface2)',
                color: 'var(--text-on-dark)',
                borderRadius: 'var(--radius-sm)',
                padding: '14px 18px',
                border: '1px solid var(--border)',
                fontFamily: 'var(--mono)',
                fontSize: '15px',
                letterSpacing: '0.15em',
                outline: 'none',
                transition: 'border-color 0.15s',
              }}
              onFocus={e => (e.target.style.borderColor = 'var(--gold)')}
              onBlur={e => (e.target.style.borderColor = 'var(--border)')}
            />
            <button
              className="btn btn-primary"
              onClick={handleJoin}
              disabled={isLoading}
              style={{ whiteSpace: 'nowrap', padding: '14px 24px', opacity: isLoading ? 0.6 : 1 }}
            >
              {joining ? '⏳' : 'join →'}
            </button>
          </div>

          {error && (
            <div style={{
              padding: '10px 14px',
              background: 'rgba(200,80,80,0.15)',
              border: '1px solid rgba(200,80,80,0.3)',
              borderRadius: 'var(--radius-sm)',
              fontSize: '12px',
              color: 'var(--red)',
              fontFamily: 'var(--mono)',
            }}>
              {error}
            </div>
          )}

          {joining && (
            <div style={{
              padding: '10px 14px',
              background: 'var(--gold-muted)',
              border: '1px solid rgba(196,160,53,0.3)',
              borderRadius: 'var(--radius-sm)',
              fontSize: '11px',
              color: 'var(--text-muted-dark)',
              fontFamily: 'var(--mono)',
              lineHeight: 1.6,
            }}>
              Setting up your XRPL wallet and authorizing MPT tokens... this can take 30–60 seconds.
            </div>
          )}
        </div>

        <p style={{ textAlign: 'center', fontSize: '13px', color: 'var(--text-muted)', marginTop: '20px', fontFamily: 'var(--mono)' }}>
          Each room supports up to 6 participants. Each gets their own XRPL wallet.
        </p>
      </div>
    </main>
  );
}
