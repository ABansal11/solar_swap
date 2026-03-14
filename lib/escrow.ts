import { Client, Wallet } from 'xrpl';
import { getClient } from './xrpl';
import { getRoom, updateEscrowStatus } from './rooms';
import { mintSolar, authorizeMpt, authorizeMptHolder } from './mpt';
import { createDexAsk } from './dex';
import { getAmmSpotPrice } from './amm';

export function getRippleTime(): number {
  return Math.floor(Date.now() / 1000) - 946684800;
}

export async function createDeliveryEscrow(
  client: Client,
  wallet: Wallet,
  _kWh: number
): Promise<{ escrowSequence: number; finishAfter: number; cancelAfter: number; txHash: string }> {
  const rippleTime = getRippleTime();
  const finishAfter = rippleTime + 35;
  const cancelAfter = rippleTime + 125;

  const tx = await client.autofill({
    TransactionType: 'EscrowCreate',
    Account: wallet.classicAddress,
    Destination: wallet.classicAddress,
    Amount: '1000000', // 1 XRP delivery bond
    FinishAfter: finishAfter,
    CancelAfter: cancelAfter,
  } as any);

  const escrowSequence = (tx as any).Sequence as number;
  const signed = wallet.sign(tx as any);
  const result = await client.submitAndWait(signed.tx_blob);

  return { escrowSequence, finishAfter, cancelAfter, txHash: result.result.hash };
}

export async function finishEscrow(
  client: Client,
  wallet: Wallet,
  escrowSequence: number
): Promise<string> {
  const tx = await client.autofill({
    TransactionType: 'EscrowFinish',
    Account: wallet.classicAddress,
    Owner: wallet.classicAddress,
    OfferSequence: escrowSequence,
  } as any);

  const signed = wallet.sign(tx as any);
  const result = await client.submitAndWait(signed.tx_blob);
  return result.result.hash;
}

export async function cancelEscrow(
  client: Client,
  wallet: Wallet,
  escrowSequence: number
): Promise<string> {
  const tx = await client.autofill({
    TransactionType: 'EscrowCancel',
    Account: wallet.classicAddress,
    Owner: wallet.classicAddress,
    OfferSequence: escrowSequence,
  } as any);

  const signed = wallet.sign(tx as any);
  const result = await client.submitAndWait(signed.tx_blob);
  return result.result.hash;
}

/**
 * Schedule IoT verification:
 *  - Fires at t+40s (after FinishAfter=35s): 90% success → EscrowFinish + mint + DEX ask
 *  - Fires at t+130s (after CancelAfter=125s): fallback cancel for any still-pending escrow
 */
export function scheduleIoTVerification(
  roomCode: string,
  escrowId: string,
  escrowSequence: number,
  participantWallet: Wallet,
  issuerWallet: Wallet,
  mptId: string,
  kWh: number,
  provenance: { houseId: number; generatedAt: number; solarKw: number; batteryLevel: number }
): void {
  const IOT_DELAY_MS = 40_000;
  const CANCEL_DELAY_MS = 130_000;

  // IoT verification window
  setTimeout(async () => {
    const room = getRoom(roomCode);
    if (!room) return;
    const escrow = room.pendingEscrows.get(escrowId);
    if (!escrow || escrow.status !== 'pending_iot') return;

    const iotSuccess = Math.random() < 0.9;

    if (iotSuccess) {
      try {
        const client = await getClient();

        await finishEscrow(client, participantWallet, escrowSequence);

        // Auth (idempotent)
        try { await authorizeMpt(client, participantWallet, mptId); } catch {}
        try { await authorizeMptHolder(client, issuerWallet, participantWallet.classicAddress, mptId); } catch {}

        const spotPrice = await getAmmSpotPrice(client, mptId);
        const tokenAmount = Math.round(kWh * 100).toString();
        const rlusdAmount = (kWh * spotPrice).toFixed(6);

        await mintSolar(client, issuerWallet, participantWallet.classicAddress, mptId, tokenAmount, provenance);
        await createDexAsk(client, participantWallet, mptId, tokenAmount, rlusdAmount, provenance);

        updateEscrowStatus(roomCode, escrowId, 'verified');
        console.log(`[IoT] Escrow ${escrowId} verified: ${kWh} kWh minted for house ${provenance.houseId}`);
      } catch (e) {
        console.error('[IoT] EscrowFinish/mint failed:', e);
        updateEscrowStatus(roomCode, escrowId, 'failed');
      }
    } else {
      console.log(`[IoT] Escrow ${escrowId} rejected by meter (simulated failure)`);
      updateEscrowStatus(roomCode, escrowId, 'failed');
    }
  }, IOT_DELAY_MS);

  // Cancel fallback: fires after CancelAfter has elapsed
  setTimeout(async () => {
    const room = getRoom(roomCode);
    if (!room) return;
    const escrow = room.pendingEscrows.get(escrowId);
    if (!escrow || escrow.status !== 'pending_iot') return; // already resolved

    try {
      const client = await getClient();
      await cancelEscrow(client, participantWallet, escrowSequence);
      console.log(`[IoT] Escrow ${escrowId} cancelled (timed out)`);
    } catch (e) {
      console.error('[IoT] EscrowCancel failed:', e);
    }
    updateEscrowStatus(roomCode, escrowId, 'failed');
  }, CANCEL_DELAY_MS);
}
