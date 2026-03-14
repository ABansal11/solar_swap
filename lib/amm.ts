import { Client, Wallet } from 'xrpl';
import { RLUSD_ISSUER, RLUSD_CURRENCY } from './mpt';

export async function createAmm(
  client: Client,
  issuerWallet: Wallet,
  mptId: string,
  solarAmount: string,
  rlusdAmount: string
): Promise<{ ammAddress: string }> {
  const tx = await client.autofill({
    TransactionType: 'AMMCreate',
    Account: issuerWallet.classicAddress,
    Amount: {
      mpt_issuance_id: mptId,
      value: solarAmount,
    },
    Amount2: {
      currency: RLUSD_CURRENCY,
      issuer: RLUSD_ISSUER,
      value: rlusdAmount,
    },
    TradingFee: 60, // 0.6%
  } as any);

  const signed = issuerWallet.sign(tx as any);
  const result = await client.submitAndWait(signed.tx_blob);

  const ammAddress = (result.result.meta as any)?.AffectedNodes?.find(
    (n: any) => n.CreatedNode?.LedgerEntryType === 'AMM'
  )?.CreatedNode?.NewFields?.Account;

  return { ammAddress: ammAddress || '' };
}

export async function getAmmSpotPrice(
  client: Client,
  mptId: string
): Promise<number> {
  try {
    const result = await client.request({
      command: 'amm_info',
      asset: { mpt_issuance_id: mptId },
      asset2: { currency: RLUSD_CURRENCY, issuer: RLUSD_ISSUER },
    } as any);

    const amm = (result.result as any).amm;
    if (!amm) return 0.10;

    // amount.value is in raw token units (AssetScale:2 → 100 raw = 1 kWh)
    // Multiply by 100 to convert raw-token price to RLUSD/kWh
    const solarRaw = parseFloat(amm.amount?.value || '1');
    const rlusd = parseFloat(amm.amount2?.value || '0.1');
    return (rlusd / solarRaw) * 100;
  } catch {
    return 0.10;
  }
}

export async function ammVote(
  client: Client,
  issuerWallet: Wallet,
  mptId: string,
  tradingFee: number
): Promise<string> {
  const tx = await client.autofill({
    TransactionType: 'AMMVote',
    Account: issuerWallet.classicAddress,
    Asset: { mpt_issuance_id: mptId },
    Asset2: { currency: RLUSD_CURRENCY, issuer: RLUSD_ISSUER },
    TradingFee: tradingFee,
  } as any);

  const signed = issuerWallet.sign(tx as any);
  const result = await client.submitAndWait(signed.tx_blob);
  return result.result.hash;
}

export async function ammSwap(
  client: Client,
  consumerWallet: Wallet,
  mptId: string,
  rlusdAmount: string
): Promise<{ txHash: string; solarReceived: number }> {
  const tx = await client.autofill({
    TransactionType: 'Payment',
    Account: consumerWallet.classicAddress,
    Destination: consumerWallet.classicAddress,
    Amount: {
      mpt_issuance_id: mptId,
      value: '999999999', // max solar we want
    },
    SendMax: {
      currency: RLUSD_CURRENCY,
      issuer: RLUSD_ISSUER,
      value: rlusdAmount,
    },
    Flags: 0x00020000, // tfPartialPayment
  } as any);

  const signed = consumerWallet.sign(tx as any);
  const result = await client.submitAndWait(signed.tx_blob);

  const delivered = (result.result.meta as any)?.delivered_amount;
  const solarReceived = delivered ? parseFloat(delivered.value || '0') : 0;

  return { txHash: result.result.hash, solarReceived };
}
