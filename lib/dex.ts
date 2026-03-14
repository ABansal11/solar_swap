import { Client, Wallet, convertStringToHex, convertHexToString } from 'xrpl';
import { RLUSD_ISSUER, RLUSD_CURRENCY } from './mpt';

export interface EnrichedOffer {
  sequence: number;
  account: string;
  solarAmount: string;
  rlusdAmount: string;
  pricePerKwh: number;
  provenance?: {
    houseId: number;
    generatedAt: number;
    solarKw: number;
    batteryLevel: number;
  };
  ageHours: number;
  expired: boolean;
  offerId?: string;
}

export async function createDexAsk(
  client: Client,
  producerWallet: Wallet,
  mptId: string,
  solarAmount: string,
  rlusdAmount: string,
  provenance: { houseId: number; generatedAt: number; solarKw: number; batteryLevel: number }
): Promise<{ txHash: string; sequence: number }> {
  const memoData = convertStringToHex(JSON.stringify(provenance));

  const tx = await client.autofill({
    TransactionType: 'OfferCreate',
    Account: producerWallet.classicAddress,
    // Producer sells SOLAR, wants RLUSD
    TakerPays: {
      currency: RLUSD_CURRENCY,
      issuer: RLUSD_ISSUER,
      value: rlusdAmount,
    },
    TakerGets: {
      mpt_issuance_id: mptId,
      value: solarAmount,
    },
    Memos: [{
      Memo: {
        MemoData: memoData,
        MemoType: convertStringToHex('application/json'),
      }
    }],
    Flags: 0x00080000, // tfSell
  } as any);

  const signed = producerWallet.sign(tx as any);
  const result = await client.submitAndWait(signed.tx_blob);
  const sequence = (tx as any).Sequence;

  return { txHash: result.result.hash, sequence };
}

export async function createDexBid(
  client: Client,
  consumerWallet: Wallet,
  mptId: string,
  rlusdAmount: string
): Promise<{ txHash: string; solarReceived: number; provenance?: EnrichedOffer['provenance'] }> {
  const tx = await client.autofill({
    TransactionType: 'OfferCreate',
    Account: consumerWallet.classicAddress,
    // Consumer pays RLUSD, wants SOLAR
    TakerPays: {
      mpt_issuance_id: mptId,
      value: '999999999', // max solar wanted
    },
    TakerGets: {
      currency: RLUSD_CURRENCY,
      issuer: RLUSD_ISSUER,
      value: rlusdAmount,
    },
  } as any);

  const signed = consumerWallet.sign(tx as any);
  const result = await client.submitAndWait(signed.tx_blob);

  const delivered = (result.result.meta as any)?.delivered_amount;
  const solarReceived = delivered ? parseFloat(delivered.value || '0') : 0;

  return { txHash: result.result.hash, solarReceived };
}

export async function getOrderBook(
  client: Client,
  mptId: string
): Promise<{ asks: EnrichedOffer[]; bids: EnrichedOffer[] }> {
  const now = Date.now();

  try {
    // Get asks: people selling SOLAR for RLUSD
    const asksResult = await client.request({
      command: 'book_offers',
      taker_pays: { currency: RLUSD_CURRENCY, issuer: RLUSD_ISSUER },
      taker_gets: { mpt_issuance_id: mptId },
      limit: 10,
    } as any);

    // Get bids: people selling RLUSD for SOLAR
    const bidsResult = await client.request({
      command: 'book_offers',
      taker_pays: { mpt_issuance_id: mptId },
      taker_gets: { currency: RLUSD_CURRENCY, issuer: RLUSD_ISSUER },
      limit: 10,
    } as any);

    // For asks (taker_pays=RLUSD, taker_gets=SOLAR):
    //   TakerGets = SOLAR raw tokens,  TakerPays = RLUSD
    // For bids (taker_pays=SOLAR, taker_gets=RLUSD):
    //   TakerPays = SOLAR raw tokens,  TakerGets = RLUSD
    // pricePerKwh = (RLUSD / solarRaw) * 100  — because 100 raw tokens = 1 kWh (AssetScale:2)
    const parseOffer = (offer: any, isBid: boolean): EnrichedOffer => {
      const solarRaw = parseFloat(
        (isBid ? offer.TakerPays?.value : offer.TakerGets?.value) || '1'
      );
      const rlusd = parseFloat(
        (isBid ? offer.TakerGets?.value : offer.TakerPays?.value) || '0.1'
      );
      const pricePerKwh = (rlusd / solarRaw) * 100;

      let provenance: EnrichedOffer['provenance'] | undefined;
      let ageHours = 0;

      if (offer.Memos?.[0]?.Memo?.MemoData) {
        try {
          const decoded = convertHexToString(offer.Memos[0].Memo.MemoData);
          const parsed = JSON.parse(decoded);
          provenance = parsed;
          ageHours = (now - parsed.generatedAt) / (1000 * 60 * 60);
        } catch {}
      }

      return {
        sequence: offer.Sequence,
        account: offer.Account,
        solarAmount: String(solarRaw),
        rlusdAmount: String(rlusd),
        pricePerKwh,
        provenance,
        ageHours,
        expired: ageHours > 24,
      };
    };

    const asks = ((asksResult.result as any).offers || []).map((o: any) => parseOffer(o, false));
    const bids = ((bidsResult.result as any).offers || []).map((o: any) => parseOffer(o, true));

    return { asks, bids };
  } catch {
    return { asks: [], bids: [] };
  }
}

export async function cancelOffer(
  client: Client,
  wallet: Wallet,
  offerSequence: number
): Promise<void> {
  const tx = await client.autofill({
    TransactionType: 'OfferCancel',
    Account: wallet.classicAddress,
    OfferSequence: offerSequence,
  });
  const signed = wallet.sign(tx);
  await client.submitAndWait(signed.tx_blob);
}
