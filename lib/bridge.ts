import { Wallet } from 'xrpl';
import { getClient } from './xrpl';
import { authorizeMpt, authorizeMptHolder, mintSolar, RLUSD_CURRENCY, RLUSD_ISSUER } from './mpt';
import { getAmmSpotPrice } from './amm';
import { transmissionBreakdown } from './geo';
import { Room, Participant } from './rooms';

// Singleton bridge wallet — funded once, reused across all rooms
let bridgeWallet: Wallet | null = null;
const authorizedRooms = new Set<string>();

export async function getBridgeWallet(): Promise<Wallet> {
  if (bridgeWallet) return bridgeWallet;
  const client = await getClient();
  const { wallet } = await client.fundWallet();
  bridgeWallet = wallet;
  console.log('[bridge] Bridge wallet funded:', wallet.classicAddress);
  return wallet;
}

export async function ensureBridgeAuthorizedInRoom(room: Room): Promise<void> {
  if (authorizedRooms.has(room.code)) return;
  const client = await getClient();
  const bridge = await getBridgeWallet();
  try {
    await authorizeMpt(client, bridge, room.mptId);
  } catch { console.log('[bridge] Bridge already opted in for room', room.code); }
  try {
    await authorizeMptHolder(client, room.issuerWallet, bridge.classicAddress, room.mptId);
  } catch { console.log('[bridge] Bridge already authorized for room', room.code); }
  authorizedRooms.add(room.code);
}

export interface CrossTradeResult {
  paymentTxHash: string;
  mintTxHash: string;
  kWhDelivered: number;
  transmissionFeeRlusd: string;
  lineLossKwh: number;
  distanceKm: number;
  feeRate: number;
  lossRate: number;
  basePrice: number;
  totalPrice: number;
}

export async function executeCrossNeighborhoodTrade(params: {
  buyerRoom: Room;
  buyerParticipant: Participant;
  sourceRoom: Room;
  rlusdBudget: string;
}): Promise<CrossTradeResult> {
  const { buyerRoom, buyerParticipant, sourceRoom, rlusdBudget } = params;
  const client = await getClient();
  const bridge = await getBridgeWallet();

  const breakdown = transmissionBreakdown(sourceRoom.location, buyerRoom.location);
  const budget = parseFloat(rlusdBudget);

  // How much RLUSD actually pays for energy (rest is transmission fee)
  const feeAmount = budget * breakdown.feeRate / (1 + breakdown.feeRate);
  const energyRlusd = budget - feeAmount;

  const basePrice = await getAmmSpotPrice(client, sourceRoom.mptId);
  const kWhSentEquivalent = energyRlusd / (basePrice || 0.10);
  const kWhDelivered = kWhSentEquivalent * breakdown.kWhDeliveredPerSent;
  const tokenAmount = Math.max(1, Math.round(kWhDelivered * 100)).toString();

  // tx1: Buyer pays RLUSD to bridge (transmission fee goes here)
  const paymentTx = await client.autofill({
    TransactionType: 'Payment',
    Account: buyerParticipant.wallet.classicAddress,
    Destination: bridge.classicAddress,
    Amount: {
      currency: RLUSD_CURRENCY,
      issuer: RLUSD_ISSUER,
      value: rlusdBudget,
    },
  } as any);
  const signedPayment = buyerParticipant.wallet.sign(paymentTx as any);
  const paymentResult = await client.submitAndWait(signedPayment.tx_blob);

  // tx2: Buyer's room issuer mints SOLAR to buyer (with cross-neighborhood provenance)
  const provenance = {
    sourceRoom: sourceRoom.code,
    sourceCity: sourceRoom.location.city,
    sourceCountry: sourceRoom.location.country,
    distanceKm: breakdown.distanceKm,
    feeRate: breakdown.feeRate,
    lossRate: breakdown.lossRate,
    crossNeighborhood: true,
    generatedAt: Date.now(),
    batteryLevel: 100,
    houseId: 0,
    solarKw: 0,
  };

  const { txHash: mintTxHash } = await mintSolar(
    client,
    buyerRoom.issuerWallet,
    buyerParticipant.wallet.classicAddress,
    buyerRoom.mptId,
    tokenAmount,
    provenance as any,
  );

  return {
    paymentTxHash: paymentResult.result.hash,
    mintTxHash,
    kWhDelivered,
    transmissionFeeRlusd: feeAmount.toFixed(6),
    lineLossKwh: kWhSentEquivalent - kWhDelivered,
    distanceKm: breakdown.distanceKm,
    feeRate: breakdown.feeRate,
    lossRate: breakdown.lossRate,
    basePrice,
    totalPrice: basePrice * breakdown.totalPriceMultiplier,
  };
}
