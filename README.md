# SolarSwap — XRPL-Powered Neighborhood Energy Marketplace

A peer-to-peer solar energy trading platform built on the XRP Ledger. Neighbors with rooftop solar panels tokenize surplus energy as SOLAR MPT credits and trade them directly with each other — cutting out the utility middleman, earning sellers 3× the standard grid export rate, and saving buyers ~47% vs peak utility pricing.

---

## The Energy Problem SolarSwap Solves

Most residential solar installations are connected to a utility grid under a "net metering" agreement: when panels produce more than the house consumes, surplus electricity flows back to the grid and the homeowner earns a credit — typically $0.04–0.06/kWh. At the same time, neighbors who don't have panels buy that same electricity back from the utility at peak rates of $0.28–0.35/kWh. The utility captures the entire spread.

SolarSwap short-circuits this by letting a solar producer sell directly to a neighbor at $0.12/kWh — triple what the grid would pay the producer, and still 47% cheaper than what the neighbor pays the utility. Settlement happens in RLUSD on the XRP Ledger: fast, low-cost, and tamper-proof.

### Key Energy Concepts

**Solar output and battery state** are simulated per-house using sinusoidal oscillation over a fast demo cycle (~3 minutes peak/off-peak). Each house's generation rate (`solarOutput` in kW) fluctuates independently. The shared neighborhood battery (40–80% range, cycling every ~30 seconds) acts as a grid-stability proxy:

- **Reserve Floor** (battery < 20%): Selling is suspended entirely to protect grid stability. No new SOLAR tokens can be minted.
- **Demand Response** (battery < 30%): The AMM trading fee is voted up to 3% to dampen buy-side demand and allow the battery to recover.
- **Peak Hours** (last 60s of each 3-minute demo cycle): Prices are elevated; the UI reflects the time-of-use tariff context.

**CO₂ savings** are calculated at 0.386 kg CO₂ per kWh (average US grid emissions factor). Every successfully IoT-verified sale increments the room's cumulative CO₂ saved counter on-chain.

**SOLAR token denomination**: 1 raw SOLAR token = 0.01 kWh (AssetScale: 2, so 100 raw tokens = 1 kWh). All prices shown in the UI are in RLUSD per kWh.

---

## XRPL Integrations

SolarSwap uses seven distinct XRPL primitives, each mapped to a real energy-market function:

### 1. Multi-Purpose Tokens (MPT) — Energy Tokenization

`MPTokenIssuanceCreate` mints a new SOLAR issuance for each neighborhood room. The issuer wallet controls the supply and authorizes participants via `MPTokenAuthorize`. Every sell transaction calls `MPTokenIssuanceCreate`-style minting with on-chain provenance encoded in Memos:

```
house_id | generated_at | solar_kw | battery_level
```

This gives every kWh of tokenized energy a verifiable origin — when it was generated, by which house, at what solar output and battery state.

### 2. Escrow — IoT Delivery Verification Bond

When a homeowner initiates a sell, before any tokens are minted the system locks **1 XRP** in an `EscrowCreate` as a delivery bond:

- `FinishAfter`: Ripple epoch + 35 seconds (IoT meter has this window to confirm actual energy delivery)
- `CancelAfter`: Ripple epoch + 125 seconds (maximum lock period before bond auto-returns)

At t+40s an IoT verification fires (simulated 90% success rate). On success:
1. `EscrowFinish` releases the 1 XRP bond back to the seller
2. SOLAR tokens are minted to the seller
3. A DEX ask is posted at the seller's chosen price

On failure: the escrow is left to expire and `EscrowCancel` is called after `CancelAfter` elapses, returning the bond. Each step is isolated — a DEX ask failure does not cancel an already-finished escrow.

### 3. DEX (OfferCreate / book_offers) — Peer-to-Peer Order Book

Every verified sell posts an `OfferCreate` on the native XRPL DEX: SOLAR MPT offered, RLUSD requested. Buyers match against the order book via a `Payment` that routes through existing DEX offers. The live order book is fetched via `book_offers` and displayed with bid/ask spread, mid price, and XRPL Explorer links per trade.

The seller can specify a minimum price per kWh; the system uses `max(minPrice, ammSpotPrice)` to set the ask, so sellers never undercut themselves below the AMM oracle.

### 4. AMM (AMMCreate / amm_info / AMMVote / AMMSwap) — Price Oracle and Liquidity Backstop

A shared AMM pool (SOLAR/RLUSD) is seeded at room creation with `AMMCreate` (0.6% base fee). The AMM serves two roles:

- **Price oracle**: `amm_info` returns the current pool ratio, converted to RLUSD/kWh accounting for the AssetScale. This is used as the floor price for new DEX asks and displayed as the AMM Spot Price in the UI.
- **Demand Response fee adjustment**: When the battery drops below 30%, `AMMVote` pushes the trading fee to 3% to throttle demand.
- **Fallback liquidity**: If no DEX asks exist when a buyer submits a bid, the system falls back to an AMM swap (`Payment` with `tfPartialPayment` and `SendMax` in RLUSD, receiving SOLAR).

### 5. Batch Transactions (tfAllOrNothing) — Atomic Multi-Party Settlement

When multiple buyers in a room have queued pending settlements, the `/batch-settle` endpoint bundles them into a single `Batch` transaction using `tfAllOrNothing`:

1. Fetches current sequence numbers for each unique buyer wallet
2. Builds inner `Payment` txns (Fee: 0, `tfInnerBatchTxn` flag) — one per settlement
3. Builds the outer `Batch` tx signed by the issuer wallet
4. Each buyer wallet calls `signMultiBatch` on a copy of the outer tx
5. `combineBatchSigners` merges all BatchSigners into a single blob
6. Issuer adds the final `TxnSignature` and submits

Result: all RLUSD payments to producers settle atomically — if any inner payment fails, all are rolled back. Falls back to individual `createDexBid` calls on any error.

### 6. Lending (LoanSet / LoanPay) — Energy Credit Lines

Buyers who need energy now but don't have RLUSD can request an energy credit line. The system attempts a `LoanSet` transaction (bilateral countersign):

- Issuer signs first as lender
- Consumer countersigns via `signLoanSetByCounterparty`
- Loan is denominated at 0.12 RLUSD/kWh, 24-hour expiry
- Repayment uses `LoanPay`; falls back to a direct RLUSD Payment if the amendment isn't enabled on the current testnet

SOLAR tokens are minted to the borrower immediately regardless — the loan is tracked server-side with full status (active / repaid / overdue) if the on-chain LoanSet fails.

### 7. TrustSet and RLUSD

All participants establish a `TrustSet` for RLUSD (the Ripple USD stablecoin) during room setup. RLUSD is the settlement currency for all energy trades, AMM swaps, and loan repayments — providing USD-denominated pricing without fiat settlement delay.

---

## Architecture

```
app/
  page.tsx                          # Landing page: create or join a room
  layout.tsx                        # Typekit font, global metadata
  globals.css                       # Warm espresso/cream design system (CSS variables + Tailwind @theme remapping)
  room/[code]/
    page.tsx                        # Main trading room (polls state every 5s)
  api/
    rooms/
      route.ts                      # POST: create room (fund wallets, create MPT, seed AMM)
      [code]/
        join/route.ts               # POST: join room (fund participant wallet, set trustline)
        state/route.ts              # GET: room state (participants, escrows, settlements, loans)
        mint/route.ts               # POST: sell flow (EscrowCreate → schedule IoT verification)
        buy/route.ts                # POST: buy flow (DEX match → AMM fallback)
        batch-settle/route.ts       # POST: Batch settlement → individual fallback
        borrow/route.ts             # POST: LoanSet + SOLAR mint
        repay/route.ts              # POST: LoanPay or direct RLUSD payment
        iot-status/route.ts         # GET: escrow status polling
        transactions/route.ts       # GET: trade feed (account_tx, decoded)
    orderbook/route.ts              # GET: DEX book_offers + AMM spot price
    global/
      neighborhoods/route.ts        # GET: all active rooms (global map data)
      offers/route.ts               # GET: cross-room DEX offers
      buy/route.ts                  # POST: cross-room buy
lib/
  xrpl.ts                           # Singleton XRPL client (testnet WebSocket)
  wallets.ts                        # Wallet helpers, env var management
  mpt.ts                            # MPT issuance, authorization, minting, RLUSD constants
  amm.ts                            # AMMCreate, amm_info spot price, AMMVote, AMMSwap
  dex.ts                            # OfferCreate (ask/bid), book_offers parsing, offer cancellation
  escrow.ts                         # EscrowCreate/Finish/Cancel, IoT verification scheduler
  batch.ts                          # Batch tx builder: signMultiBatch, combineBatchSigners
  lending.ts                        # LoanSet (bilateral countersign), LoanPay, RLUSD fallback
  battery.ts                        # Battery state simulation, solar output, house positions
  rooms.ts                          # In-memory room store: participants, escrows, settlements, loans
  geo.ts                            # City/region lookup for room location
  bridge.ts                         # Cross-room bridge utilities
components/
  NeighborhoodMap.tsx               # Animated SVG: houses arranged in circle + central battery
  OrderBook.tsx                     # Live DEX order book (bids/asks, mid price)
  PriceChart.tsx                    # Recharts: DEX mid price + AMM spot price (10s interval)
  TradeHistory.tsx                  # Trade feed: mint, trade, borrow events with explorer links
  TradePanels.tsx                   # Sell/Buy/Credit tabs, IoT status card, loan card
  GlobalMap.tsx                     # World map: active neighborhoods as animated arcs
```

---

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 3. Create a room

Click **Create Room**, choose a city, and click **Initialize**. This will:

1. Fund a room issuer wallet from the XRPL testnet faucet
2. Create an MPT issuance for SOLAR credits (AssetScale: 2)
3. Set up RLUSD trustlines for the issuer
4. Seed the AMM pool (SOLAR/RLUSD, 0.6% fee)
5. Save credentials to the room's server-side state

Room creation takes ~30 seconds due to ledger confirmation times.

### 4. Join and trade

Share the 6-character room code with neighbors. Each participant joins with a name, receives a funded testnet wallet, and is assigned a house on the neighborhood map.

- **Sell Energy**: Select your house, enter kWh, optionally set a minimum price per kWh. Posts a 1 XRP delivery bond escrow. IoT verification fires at t+40s (90% success). On success: EscrowFinish, SOLAR mint, DEX ask posted.
- **Buy Energy**: Enter RLUSD to spend. Matches DEX asks first; falls back to AMM swap if no asks exist.
- **Batch Settle**: Settles all queued buyer-to-producer RLUSD payments atomically in one Batch tx.
- **Credit Line**: Borrow SOLAR tokens now, repay in RLUSD later (LoanSet / LoanPay).

---

## Economics

| Scenario | Price |
|---|---|
| Grid export rate (net metering) | ~$0.05/kWh |
| SolarSwap seller rate | ~$0.12/kWh (2.4× grid export) |
| Utility peak rate | ~$0.32/kWh |
| SolarSwap buyer savings vs peak | ~63% |
| Delivery bond | 1 XRP (~$2) |
| AMM base fee | 0.6% |
| AMM demand response fee | 3.0% (battery < 30%) |
| CO₂ savings factor | 0.386 kg CO₂/kWh |

---

## Grid Safety Mechanisms

| Mechanism | Trigger | Effect |
|---|---|---|
| Reserve Floor | Battery < 20% | Minting suspended — no new sells |
| Demand Response | Battery < 30% | AMM fee voted to 3% |
| Delivery Bond | Every sell | 1 XRP locked in escrow until IoT confirms delivery |
| Escrow CancelAfter | t+125s | Bond auto-returns if IoT never verifies |
| IoT Failure (10%) | Simulated meter rejection | Escrow cancelled, bond returned, no tokens minted |
| On-chain Memos | Every mint | House ID, timestamp, solar kW, battery level recorded permanently |

---

## Environment Variables

After room creation, credentials are held in server memory for the session. For manual configuration or persistence across restarts:

```
ISSUER_SEED=s...
ISSUER_ADDRESS=r...
PRODUCER_SEED=s...
PRODUCER_ADDRESS=r...
CONSUMER_SEED=s...
CONSUMER_ADDRESS=r...
MPT_ID=000...
```

Note: `AMM_ADDRESS` is not required — the AMM is identified by its asset pair (`MPT_ID` + RLUSD) in all `amm_info` and `AMMVote` calls.

---

## XRPL Testnet

All transactions run on the XRPL testnet (`wss://s.altnet.rippletest.net:51233/`). View any transaction at [testnet.xrpl.org](https://testnet.xrpl.org). Trade history in the UI links directly to each XRPL Explorer transaction.

---

## Tech Stack

- **Next.js 15** (App Router, TypeScript)
- **xrpl.js** v4 — XRPL client: MPT, AMM, DEX, Escrow, Batch, Lending
- **Recharts** — price history chart
- **Tailwind CSS v4** with `@theme` remapping (warm espresso/cream design system)
- **CSS custom properties** — `--bg`, `--surface`, `--gold`, `--border`, `--mono`, etc.
- **Adobe Typekit** — "the-seasons" serif display font
