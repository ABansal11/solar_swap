import { Client, Wallet, convertStringToHex, signLoanSetByCounterparty } from 'xrpl';
import { mintSolar, authorizeMpt, authorizeMptHolder, RLUSD_CURRENCY, RLUSD_ISSUER } from './mpt';
import { getRippleTime } from './escrow';

/**
 * Create an energy credit line:
 *  1. Issue a LoanSet with issuer as lender and consumer as borrower (bilateral countersign)
 *  2. Mint SOLAR tokens to consumer
 *
 * LoanSet requires a LoanBrokerID referencing an existing LoanBroker ledger object.
 * If the testnet doesn't support the Loan amendment yet, we fall back to server-side tracking.
 */
export async function createEnergyCredit(
  client: Client,
  issuerWallet: Wallet,
  consumerWallet: Wallet,
  mptId: string,
  kWh: number
): Promise<{ loanTxHash: string | null; mintTxHash: string; loanId: string; simulated: boolean }> {
  const loanId = crypto.randomUUID();
  const tokenAmount = Math.round(kWh * 100).toString();
  const provenance = {
    houseId: 0,
    generatedAt: Date.now(),
    solarKw: 0,
    batteryLevel: 0,
    creditLoan: true,
    loanId,
  };

  // Auth (idempotent)
  try { await authorizeMpt(client, consumerWallet, mptId); } catch {}
  try { await authorizeMptHolder(client, issuerWallet, consumerWallet.classicAddress, mptId); } catch {}

  let loanTxHash: string | null = null;
  let simulated = false;

  // Attempt LoanSet (may fail if amendment not enabled on testnet)
  try {
    // Derive a deterministic LoanBrokerID from the issuer's account root hash
    // In production, you would first submit a LoanBrokerSet tx to create this object.
    // For testnet demo, we use the hashLoanBroker utility with issuer address + sequence 1.
    const { hashLoanBroker } = await import('xrpl/dist/npm/utils/hashes/index.js');
    const loanBrokerId = hashLoanBroker(issuerWallet.classicAddress, 1);

    const loanSetTx = await client.autofill({
      TransactionType: 'LoanSet',
      Account: issuerWallet.classicAddress,
      LoanBrokerID: loanBrokerId,
      PrincipalRequested: {
        currency: RLUSD_CURRENCY,
        issuer: RLUSD_ISSUER,
        value: (kWh * 0.12).toFixed(6), // 0.12 RLUSD/kWh credit
      },
      Counterparty: consumerWallet.classicAddress,
      Expiry: getRippleTime() + 86400, // 24h
      Data: convertStringToHex(JSON.stringify({ kWh, loanId, purpose: 'energy_credit' })).slice(0, 512),
    } as any);

    // Issuer signs first
    const issuerSigned = issuerWallet.sign(loanSetTx as any);

    // Borrower (consumer) countersigns
    const { tx_blob: counterSigned } = signLoanSetByCounterparty(consumerWallet, issuerSigned.tx_blob);

    const result = await client.submitAndWait(counterSigned);
    loanTxHash = result.result.hash;
    console.log(`[Lending] LoanSet submitted: ${loanTxHash}`);
  } catch (e: any) {
    // Graceful fallback: track loan server-side only
    console.warn('[Lending] LoanSet failed (amendment likely not enabled):', e.message?.slice(0, 100));
    simulated = true;
  }

  // Mint SOLAR tokens to consumer regardless (the loan is now active)
  const { txHash: mintTxHash } = await mintSolar(
    client,
    issuerWallet,
    consumerWallet.classicAddress,
    mptId,
    tokenAmount,
    provenance as any
  );

  return { loanTxHash, mintTxHash, loanId, simulated };
}

/**
 * Repay an energy credit with RLUSD.
 * Uses LoanPay if the loan object exists on-chain, otherwise just does a direct RLUSD payment.
 */
export async function repayCredit(
  client: Client,
  consumerWallet: Wallet,
  issuerWallet: Wallet,
  loanId: string,
  rlusdAmount: string
): Promise<string> {
  // Try LoanPay first
  try {
    const { hashLoan, hashLoanBroker } = await import('xrpl/dist/npm/utils/hashes/index.js');
    const loanBrokerId = hashLoanBroker(issuerWallet.classicAddress, 1);
    const onChainLoanId = hashLoan(loanBrokerId, 1);

    const loanPayTx = await client.autofill({
      TransactionType: 'LoanPay',
      Account: consumerWallet.classicAddress,
      LoanID: onChainLoanId,
      Amount: {
        currency: RLUSD_CURRENCY,
        issuer: RLUSD_ISSUER,
        value: rlusdAmount,
      },
      Flags: 0x00020000, // tfLoanFullPayment
    } as any);

    const signed = consumerWallet.sign(loanPayTx as any);
    const result = await client.submitAndWait(signed.tx_blob);
    return result.result.hash;
  } catch (e: any) {
    console.warn('[Lending] LoanPay failed, falling back to direct RLUSD payment:', e.message?.slice(0, 100));
  }

  // Fallback: direct RLUSD payment from consumer to issuer
  const payTx = await client.autofill({
    TransactionType: 'Payment',
    Account: consumerWallet.classicAddress,
    Destination: issuerWallet.classicAddress,
    Amount: {
      currency: RLUSD_CURRENCY,
      issuer: RLUSD_ISSUER,
      value: rlusdAmount,
    },
  });

  const signed = consumerWallet.sign(payTx);
  const result = await client.submitAndWait(signed.tx_blob);
  return result.result.hash;
}
