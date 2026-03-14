import { Wallet } from 'xrpl';
import { CityOption } from './geo';

export interface Participant {
  id: string;       // UUID, stored in client's localStorage
  name: string;
  houseId: number;  // 1–6, assigned on join
  wallet: Wallet;
  joinedAt: number;
}

export interface Room {
  code: string;       // 6-char uppercase alphanumeric
  issuerWallet: Wallet;
  mptId: string;
  participants: Map<string, Participant>;
  co2SavedKg: number;
  createdAt: number;
  location: CityOption;
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
  if (room.participants.size >= 6) return { error: 'Room is full (max 6 participants)' };

  // Find next available houseId
  const usedIds = new Set(Array.from(room.participants.values()).map(p => p.houseId));
  let houseId = 1;
  while (usedIds.has(houseId) && houseId <= 6) houseId++;
  if (houseId > 6) return { error: 'No available house slots' };

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
