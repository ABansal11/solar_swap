import { Wallet } from 'xrpl';
import { CityOption } from './geo';

export interface Participant {
  id: string;       // UUID, stored in client's localStorage
  name: string;
  houseId: number;  // assigned on join (1-indexed, no upper limit)
  wallet: Wallet;
  joinedAt: number;
}

export interface PendingEscrow {
  id: string;             // UUID
  participantId: string;
  escrowSequence: number;
  kWh: number;
  provenance: { houseId: number; generatedAt: number; solarKw: number; batteryLevel: number };
  status: 'pending_iot' | 'verified' | 'failed';
  createdAt: number;
  finishAfter: number;    // ripple epoch
  escrowTxHash: string;
}

export interface PendingSettlement {
  id: string;
  buyerParticipantId: string;
  producerAddress: string;
  rlusdAmount: string;
  kWh: number;
  queuedAt: number;
}

export interface ActiveLoan {
  id: string;
  borrowerParticipantId: string;
  kWh: number;
  mptAmount: string;
  dueDateRippleTime: number;
  status: 'active' | 'repaid' | 'overdue';
  loanTxHash: string | null;
  simulated: boolean;
}

export interface Room {
  code: string;
  issuerWallet: Wallet;
  mptId: string;
  participants: Map<string, Participant>;
  co2SavedKg: number;
  createdAt: number;
  location: CityOption;
  pendingEscrows: Map<string, PendingEscrow>;
  pendingSettlement: PendingSettlement[];
  activeLoans: ActiveLoan[];
}

const rooms = new Map<string, Room>();

function generateCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export function createRoom(code: string, issuerWallet: Wallet, mptId: string, location: CityOption): Room {
  const room: Room = {
    code,
    issuerWallet,
    mptId,
    participants: new Map(),
    co2SavedKg: 0,
    createdAt: Date.now(),
    location,
    pendingEscrows: new Map(),
    pendingSettlement: [],
    activeLoans: [],
  };
  rooms.set(code, room);
  return room;
}

export function getRoom(code: string): Room | null {
  return rooms.get(code) ?? null;
}

export function joinRoom(
  code: string,
  name: string,
  wallet: Wallet
): { participant: Participant } | { error: string } {
  const room = rooms.get(code);
  if (!room) return { error: 'Room not found' };

  const usedIds = new Set(Array.from(room.participants.values()).map(p => p.houseId));
  let houseId = 1;
  while (usedIds.has(houseId)) houseId++;

  const participant: Participant = {
    id: crypto.randomUUID(),
    name,
    houseId,
    wallet,
    joinedAt: Date.now(),
  };

  room.participants.set(participant.id, participant);
  return { participant };
}

export function getParticipant(code: string, participantId: string): Participant | null {
  const room = rooms.get(code);
  if (!room) return null;
  return room.participants.get(participantId) ?? null;
}

export function incrementRoomCo2(code: string, kg: number): void {
  const room = rooms.get(code);
  if (room) {
    room.co2SavedKg += kg;
  }
}

// ── Escrow helpers ──────────────────────────────────────────────────────────

export function addPendingEscrow(code: string, escrow: PendingEscrow): void {
  const room = rooms.get(code);
  if (room) room.pendingEscrows.set(escrow.id, escrow);
}

export function updateEscrowStatus(
  code: string,
  escrowId: string,
  status: 'verified' | 'failed'
): void {
  const room = rooms.get(code);
  if (!room) return;
  const escrow = room.pendingEscrows.get(escrowId);
  if (escrow) escrow.status = status;
}

// ── Settlement helpers ──────────────────────────────────────────────────────

export function addPendingSettlement(code: string, settlement: PendingSettlement): void {
  const room = rooms.get(code);
  if (room) room.pendingSettlement.push(settlement);
}

export function clearSettlements(code: string, ids: string[]): void {
  const room = rooms.get(code);
  if (room) {
    const idSet = new Set(ids);
    room.pendingSettlement = room.pendingSettlement.filter(s => !idSet.has(s.id));
  }
}

// ── Loan helpers ────────────────────────────────────────────────────────────

export function addActiveLoan(code: string, loan: ActiveLoan): void {
  const room = rooms.get(code);
  if (room) room.activeLoans.push(loan);
}

export function updateLoanStatus(
  code: string,
  loanId: string,
  status: 'repaid' | 'overdue'
): void {
  const room = rooms.get(code);
  if (!room) return;
  const loan = room.activeLoans.find(l => l.id === loanId);
  if (loan) loan.status = status;
}

export { generateCode };

export interface RoomPublicInfo {
  code: string;
  city: string;
  country: string;
  flag: string;
  lat: number;
  lng: number;
  region: string;
  participantCount: number;
  mptId: string;
}

export function getAllRoomsPublic(): RoomPublicInfo[] {
  return Array.from(rooms.values()).map(room => ({
    code: room.code,
    city: room.location.city,
    country: room.location.country,
    flag: room.location.flag,
    lat: room.location.lat,
    lng: room.location.lng,
    region: room.location.region,
    participantCount: room.participants.size,
    mptId: room.mptId,
  }));
}
