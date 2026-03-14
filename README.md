# SolarSwap — XRPL-Powered Neighborhood Energy Marketplace

A peer-to-peer solar energy trading platform built on the XRP Ledger, leveraging Multi-Purpose Tokens (MPT), the native DEX, and AMM for decentralized energy trading.

## Overview

SolarSwap enables neighbors with solar panels to tokenize surplus energy as SOLAR MPT credits and sell them directly to other households — at 3x the standard grid export rate — while buyers save ~47% vs peak utility rates.

### Key XRPL Features Used

- **MPTokenIssuanceCreate** — Mint SOLAR energy credits (1 token = 0.01 kWh) with provenance metadata
- **OfferCreate / book_offers** — DEX order book for direct peer-to-peer energy matching
- **AMMCreate / amm_info / AMMVote** — Automated market maker as price oracle and liquidity fallback
- **TrustSet** — RLUSD trustlines for settlement currency
- **Memos** — On-chain provenance: house ID, solar kW output, battery level, generation timestamp

## Architecture

```
src/
  app/
    page.tsx                    # Main dashboard (client-side, polling every 5s)
    layout.tsx
    globals.css
    api/
      setup/route.ts            # One-click: fund wallets, create MPT, configure trustlines
      mint/route.ts             # Mint SOLAR + post DEX ask with provenance
      buy/route.ts              # Match DEX bids or fall back to AMM swap
      battery/route.ts          # Battery state (sin-wave simulation for demo)
      orderbook/route.ts        # Live order book + AMM spot price
      transactions/route.ts     # Recent trade feed from account_tx
  lib/
    xrpl.ts                     # Singleton XRPL client (testnet)
    wallets.ts                  # Wallet helpers + env var management
    mpt.ts                      # MPT issuance, authorization, minting
    amm.ts                      # AMM creation, spot price query, vote, swap
    dex.ts                      # DEX ask/bid, order book parsing, offer cancellation
    battery.ts                  # Battery state simulation + house balances
  components/
    NeighborhoodMap.tsx         # Animated SVG: 6 houses + central battery
    OrderBook.tsx               # Live DEX order book display
    PriceChart.tsx              # Recharts price history (DEX mid + AMM oracle)
    TradeHistory.tsx            # Trade feed with XRPL explorer links
    TradePanels.tsx             # Sell/Buy tabs with form inputs
```

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

### 3. Initialize the marketplace

Click **🚀 Initialize** in the top-right corner. This will:
1. Fund 3 wallets (issuer, producer, consumer) from the testnet faucet
2. Create an MPT issuance for SOLAR credits
3. Set up MPT authorization and RLUSD trustlines for all wallets
4. Mint initial SOLAR tokens to the issuer
5. Save wallet seeds to `.env.local`

Setup takes ~30 seconds due to ledger confirmation times.

### 4. Trade

- **Sell Energy**: Select a house, enter kWh amount, optionally set a minimum price. Mints SOLAR tokens and posts a DEX ask.
- **Buy Energy**: Enter RLUSD amount to spend. Matches against DEX asks first, falls back to AMM if no asks exist.

## Economics

| Scenario | Price |
|----------|-------|
| Grid export rate | $0.04/kWh |
| SolarSwap DEX rate | ~$0.12/kWh (3x grid) |
| PG&E peak rate | $0.35/kWh |
| SolarSwap buyer savings | ~47% vs peak |

## Safety Features

- **Reserve Floor** (battery < 20%): Minting suspended to protect grid stability
- **Demand Response** (battery < 30%): AMM trading fee voted up to 3% to dampen demand
- **24-hour token expiry**: Stale DEX offers are cancelled automatically
- **Provenance tracking**: Every SOLAR token carries on-chain metadata (house, timestamp, solar kW, battery level)

## Environment Variables

After running setup, `.env.local` is auto-populated. For manual configuration, copy `.env.local.example`:

```
ISSUER_SEED=s...
ISSUER_ADDRESS=r...
PRODUCER_SEED=s...
PRODUCER_ADDRESS=r...
CONSUMER_SEED=s...
CONSUMER_ADDRESS=r...
MPT_ID=000...
AMM_ADDRESS=r...
```

## XRPL Testnet

All transactions are on the XRPL testnet (`wss://s.altnet.rippletest.net:51233/`). View transactions at [testnet.xrpl.org](https://testnet.xrpl.org).

## Tech Stack

- **Next.js 14** (App Router, TypeScript)
- **xrpl.js** v4 — XRPL client library
- **Recharts** — price chart
- **Tailwind CSS** — styling
