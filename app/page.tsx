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
    if (!name.trim()) {
      setError('Please enter your name first.');
      return;
    }
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

      // Auto-join the room as creator
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
    } catch (e: any) {
      setError(e.message);
    }
    setCreating(false);
  }

  async function handleJoin() {
    if (!name.trim()) {
      setError('Please enter your name first.');
      return;
    }
    const code = joinCode.trim().toUpperCase();
    if (code.length !== 6) {
      setError('Join code must be 6 characters.');
      return;
    }
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
    } catch (e: any) {
      setError(e.message);
    }
    setJoining(false);
  }

  const isLoading = creating || joining;

  return (
    <main className="min-h-screen bg-slate-900 text-white flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">⚡</div>
          <h1 className="text-3xl font-bold text-white">SolarSwap</h1>
          <p className="text-slate-400 mt-1 text-sm">P2P Energy Marketplace on XRPL</p>
          <span className="mt-2 inline-block px-2 py-0.5 text-xs bg-orange-500/20 text-orange-400 border border-orange-500/30 rounded-full">Testnet</span>
        </div>

        <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700 shadow-xl">
          {/* Name input */}
          <div className="mb-5">
            <label className="block text-sm text-slate-400 mb-1.5">Your name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Enter your name..."
              className="w-full bg-slate-700 text-white rounded-lg px-4 py-2.5 border border-slate-600 focus:border-blue-500 focus:outline-none text-sm"
              disabled={isLoading}
            />
          </div>

          {/* Create Neighborhood */}
          {!showCityPicker ? (
            <button
              onClick={handleCreateClick}
              disabled={isLoading}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl text-sm transition-colors mb-4"
            >
              {creating ? '⏳ Setting up neighborhood... (30–60s)' : 'Create Neighborhood'}
            </button>
          ) : (
            <div className="mt-4 space-y-2 mb-4">
              <p className="text-sm text-slate-300 text-center">Pick your neighborhood city:</p>
              <div className="grid grid-cols-3 gap-2">
                {CITIES.map(city => (
                  <button
                    key={city.city}
                    onClick={() => handleCreateRoom(city.city)}
                    disabled={creating}
                    className="bg-slate-700 hover:bg-slate-600 text-white text-xs rounded-lg p-2 text-center transition-colors"
                  >
                    <div className="text-lg">{city.flag}</div>
                    <div className="font-medium">{city.city}</div>
                    <div className="text-slate-400">{city.country}</div>
                  </button>
                ))}
              </div>
              {creating && (
                <p className="text-xs text-blue-300 text-center">⏳ Setting up neighborhood... (30–60s)</p>
              )}
              <button
                onClick={() => setShowCityPicker(false)}
                disabled={creating}
                className="w-full text-xs text-slate-500 hover:text-slate-400 py-1"
              >
                ← Back
              </button>
            </div>
          )}

          {/* Divider */}
          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 h-px bg-slate-700" />
            <span className="text-xs text-slate-500">or join existing</span>
            <div className="flex-1 h-px bg-slate-700" />
          </div>

          {/* Join Neighborhood */}
          <div className="flex gap-2">
            <input
              type="text"
              value={joinCode}
              onChange={e => setJoinCode(e.target.value.toUpperCase())}
              placeholder="Code: XXXXXX"
              maxLength={6}
              className="flex-1 bg-slate-700 text-white rounded-lg px-4 py-2.5 border border-slate-600 focus:border-green-500 focus:outline-none text-sm font-mono tracking-widest uppercase"
              disabled={isLoading}
            />
            <button
              onClick={handleJoin}
              disabled={isLoading}
              className="bg-green-600 hover:bg-green-500 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-semibold px-4 py-2.5 rounded-xl text-sm transition-colors whitespace-nowrap"
            >
              {joining ? '⏳ Joining...' : 'Join Neighborhood'}
            </button>
          </div>

          {error && (
            <div className="mt-4 p-3 bg-red-900/50 border border-red-700/50 rounded-lg text-xs text-red-300">
              {error}
            </div>
          )}

          {joining && (
            <div className="mt-4 p-3 bg-blue-900/30 border border-blue-700/50 rounded-lg text-xs text-blue-300">
              Setting up your XRPL wallet and joining the neighborhood... this can take 30–60 seconds.
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
