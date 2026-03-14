import { Client, Wallet, decode, encode, BatchFlags, signMultiBatch, combineBatchSigners } from 'xrpl';
import { RLUSD_CURRENCY, RLUSD_ISSUER } from './mpt';

export interface PendingSettlementItem {
  buyerWallet: Wallet;
  producerAddress: string;
  rlusdAmount: string;
}

/**
 * Build and submit a Batch tx (tfAllOrNothing) settling multiple RLUSD payments atomically.
 *
 * Flow:
 *  1. Fetch each buyer's current sequence number
 *  2. Build inner Payment txns (unsigned, tfInnerBatchTxn flag, Fee='0')
 *  3. Build outer Batch tx (issuerWallet as outer Account, tfAllOrNothing)
 *  4. For each unique buyer wallet, call signMultiBatch on a copy of the outer Batch
 *  5. combineBatchSigners → merged tx_blob with all BatchSigners
 *  6. Decode, sign with issuer, submit
 */
export async function buildAndSubmitBatch(
  client: Client,
  issuerWallet: Wallet,
  settlements: PendingSettlementItem[]
): Promise<{ txHash: string; settledCount: number; totalRlusd: string; atomic: boolean }> {
  if (settlements.length === 0) {
    throw new Error('No settlements to process');
  }

  // Fetch sequence numbers for all unique buyer accounts
  const seqMap = new Map<string, number>();
  for (const s of settlements) {
    if (!seqMap.has(s.buyerWallet.classicAddress)) {
      const info = await client.request({
        command: 'account_info',
        account: s.buyerWallet.classicAddress,
        ledger_index: 'current',
      });
      seqMap.set(s.buyerWallet.classicAddress, info.result.account_data.Sequence);
    }
  }

  // Build inner Payment txns (NOT individually signed; Batch handles authorization via BatchSigners)
  const innerTxns = settlements.map((s, i) => {
    const buyerAddr = s.buyerWallet.classicAddress;
    const seq = seqMap.get(buyerAddr)! + i; // increment for duplicate buyers in same batch
    return {
      TransactionType: 'Payment' as const,
      Account: buyerAddr,
      Destination: s.producerAddress,
      Amount: {
        currency: RLUSD_CURRENCY,
        issuer: RLUSD_ISSUER,
        value: s.rlusdAmount,
      },
      Fee: '0',
      Flags: 1073741824, // tfInnerBatchTxn
      Sequence: seq,
      SigningPubKey: '',
    };
  });

  // Build outer Batch tx (auto-filled by issuer)
  const outerBatch = await client.autofill({
    TransactionType: 'Batch',
    Account: issuerWallet.classicAddress,
    Flags: BatchFlags.tfAllOrNothing,
    RawTransactions: innerTxns.map(tx => ({ RawTransaction: tx })),
    BatchSigners: [],
  } as any) as any;

  // Remove BatchSigners placeholder before hashing
  delete outerBatch.BatchSigners;

  // Get unique buyer wallets
  const uniqueWallets = Array.from(
    new Map(settlements.map(s => [s.buyerWallet.classicAddress, s.buyerWallet])).values()
  );

  // Each buyer wallet signs a copy of the outer Batch
  const signedCopies = uniqueWallets.map(wallet => {
    const copy = JSON.parse(JSON.stringify(outerBatch));
    signMultiBatch(wallet, copy);
    return copy;
  });

  // Combine all BatchSigners
  const combinedBlob = combineBatchSigners(signedCopies);

  // Decode, sign with issuer (adds TxnSignature), submit
  const decodedTx = decode(combinedBlob) as any;
  const issuerSigned = issuerWallet.sign(decodedTx as any);

  const result = await client.submitAndWait(issuerSigned.tx_blob);

  const totalRlusd = settlements
    .reduce((sum, s) => sum + parseFloat(s.rlusdAmount), 0)
    .toFixed(6);

  return {
    txHash: result.result.hash,
    settledCount: settlements.length,
    totalRlusd,
    atomic: true,
  };
}
