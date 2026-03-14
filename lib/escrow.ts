import { Client, Wallet } from 'xrpl';
import { getClient } from './xrpl';
import { getRoom, updateEscrowStatus, incrementRoomCo2 } from './rooms';
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
  provenance: { houseId: number; generatedAt: number; solarKw: number; batteryLevel: number },
  minPricePerKwh?: number
): void {
  const IOT_DELAY_MS = 40_000;
  const CANCEL_DELAY_MS = 130_000;

  // Helper: cancel the escrow on-chain and mark failed
  async function doCancel(reason: string) {
    try {
      const client = await getClient();
      await cancelEscrow(client, participantWallet, escrowSequence);
      console.log(`[IoT] Escrow ${escrowId} cancelled: ${reason}`);
    } catch (e) {
      console.error('[IoT] EscrowCancel failed:', e);
    }
    updateEscrowStatus(roomCode, escrowId, 'failed');
  }

  // IoT verification window
  setTimeout(async () => {
    const room = getRoom(roomCode);
    if (!room) return;
    const escrow = room.pendingEscrows.get(escrowId);
    if (!escrow || escrow.status !== 'pending_iot') return;

    const iotSuccess = Math.random() < 0.9;

    if (iotSuccess) {
      const client = await getClient();

      // Step 1: Finish escrow (release delivery bond)
      try {
        await finishEscrow(client, participantWallet, escrowSequence);
      } catch (e) {
        console.error('[IoT] EscrowFinish failed:', e);
        // Bond still locked — schedule cancel after CancelAfter elapses
        const remainingMs = CANCEL_DELAY_MS - IOT_DELAY_MS + 2_000;
        setTimeout(() => doCancel('EscrowFinish failed'), remainingMs);
        updateEscrowStatus(roomCode, escrowId, 'failed');
        return;
      }

      // Step 2: Mint SOLAR tokens
      try {
        // Auth (idempotent)
        try { await authorizeMpt(client, participantWallet, mptId); } catch {}
        try { await authorizeMptHolder(client, issuerWallet, participantWallet.classicAddress, mptId); } catch {}

        // Respect the seller's min price; fall back to AMM spot
        const spotPrice = await getAmmSpotPrice(client, mptId);
        const pricePerKwh = (minPricePerKwh && minPricePerKwh > spotPrice) ? minPricePerKwh : spotPrice;
        const tokenAmount = Math.round(kWh * 100).toString();
        const rlusdAmount = (kWh * pricePerKwh).toFixed(6);

        await mintSolar(client, issuerWallet, participantWallet.classicAddress, mptId, tokenAmount, provenance);

        // Step 3: Post DEX ask (best-effort — mint already succeeded)
        try {
          await createDexAsk(client, participantWallet, mptId, tokenAmount, rlusdAmount, provenance);
        } catch (e) {
          console.warn('[IoT] DEX ask failed (tokens minted, ask skipped):', e);
        }

        updateEscrowStatus(roomCode, escrowId, 'verified');
        incrementRoomCo2(roomCode, kWh * 0.386);
        console.log(`[IoT] Escrow ${escrowId} verified: ${kWh} kWh @ ${pricePerKwh} RLUSD/kWh for house ${provenance.houseId}`);
      } catch (e) {
        console.error('[IoT] Mint failed after EscrowFinish:', e);
        // EscrowFinish already fired — bond returned. Mark failed (no tokens minted).
        updateEscrowStatus(roomCode, escrowId, 'failed');
      }
    } else {
      console.log(`[IoT] Escrow ${escrowId} rejected by meter (simulated failure)`);
      // CancelAfter hasn't elapsed yet — schedule the actual on-chain cancel
      // for just after CancelAfter (t+125s). We mark UI as failed immediately.
      updateEscrowStatus(roomCode, escrowId, 'failed');
      const remainingMs = CANCEL_DELAY_MS - IOT_DELAY_MS + 2_000; // wait until after CancelAfter
      setTimeout(() => doCancel('IoT meter rejection'), remainingMs);
    }
  }, IOT_DELAY_MS);

  // Safety fallback: if somehow still pending after CancelAfter, cancel on-chain
  setTimeout(async () => {
    const room = getRoom(roomCode);
    if (!room) return;
    const escrow = room.pendingEscrows.get(escrowId);
    if (!escrow || escrow.status !== 'pending_iot') return; // already handled
    await doCancel('safety timeout');
  }, CANCEL_DELAY_MS);
}
