import { Client, Wallet, convertStringToHex } from 'xrpl';

export const RLUSD_ISSUER = 'rQhWct2fv4Vc4KRjRgMrxa8xPN9Zx9iLKV';
// ripple-binary-codec rejects 'RLUSD' (5 chars); non-standard currency codes
// must be supplied as a 40-char uppercase hex string (20 bytes, ASCII-padded).
export const RLUSD_CURRENCY = '524C555344000000000000000000000000000000';

export async function createMptIssuance(client: Client, issuerWallet: Wallet): Promise<string> {
  const tx = await client.autofill({
    TransactionType: 'MPTokenIssuanceCreate',
    Account: issuerWallet.classicAddress,
    AssetScale: 2,
    TransferFee: 500,
    Flags: 0x00000004 | 0x00000010 | 0x00000020, // tfMPTRequireAuth(4) | tfMPTCanTrade(16) | tfMPTCanTransfer(32)
    MaximumAmount: '9000000000000000',
  } as any);

  const signed = issuerWallet.sign(tx as any);
  const result = await client.submitAndWait(signed.tx_blob);

  const mptId = (result.result.meta as any)?.mpt_issuance_id;
  if (!mptId) throw new Error('MPT issuance ID not found in result');
  return mptId;
}

export async function authorizeMpt(client: Client, wallet: Wallet, mptId: string): Promise<void> {
  const tx = await client.autofill({
    TransactionType: 'MPTokenAuthorize',
    Account: wallet.classicAddress,
    MPTokenIssuanceID: mptId,
  } as any);

  const signed = wallet.sign(tx as any);
  await client.submitAndWait(signed.tx_blob);
}

export async function authorizeMptHolder(client: Client, issuerWallet: Wallet, holderAddress: string, mptId: string): Promise<void> {
  const tx = await client.autofill({
    TransactionType: 'MPTokenAuthorize',
    Account: issuerWallet.classicAddress,
    MPTokenIssuanceID: mptId,
    MPTokenHolder: holderAddress,
  } as any);

  const signed = issuerWallet.sign(tx as any);
  await client.submitAndWait(signed.tx_blob);
}

export async function mintSolar(
  client: Client,
  issuerWallet: Wallet,
  producerAddress: string,
  mptId: string,
  amount: string,
  provenance: { houseId: number; generatedAt: number; solarKw: number; batteryLevel: number }
): Promise<{ txHash: string }> {
  const memoData = convertStringToHex(JSON.stringify(provenance));

  const tx = await client.autofill({
    TransactionType: 'Payment',
    Account: issuerWallet.classicAddress,
    Destination: producerAddress,
    Amount: {
      mpt_issuance_id: mptId,
      value: amount,
    },
    Memos: [{
      Memo: {
        MemoData: memoData,
        MemoType: convertStringToHex('application/json'),
      }
    }],
  } as any);

  const signed = issuerWallet.sign(tx as any);
  const result = await client.submitAndWait(signed.tx_blob);
  return { txHash: result.result.hash };
}

export async function setTrustLine(client: Client, wallet: Wallet): Promise<void> {
  const tx = await client.autofill({
    TransactionType: 'TrustSet',
    Account: wallet.classicAddress,
    LimitAmount: {
      currency: RLUSD_CURRENCY,
      issuer: RLUSD_ISSUER,
      value: '1000000',
    },
  });

  const signed = wallet.sign(tx);
  await client.submitAndWait(signed.tx_blob);
}

export async function seedRlusd(client: Client, funderWallet: Wallet, destAddress: string, amount: string): Promise<void> {
  // Fund via XRP first, then send RLUSD once trustline is set
  const tx = await client.autofill({
    TransactionType: 'Payment',
    Account: funderWallet.classicAddress,
    Destination: destAddress,
    Amount: amount, // XRP in drops
  });
  const signed = funderWallet.sign(tx);
  await client.submitAndWait(signed.tx_blob);
}
