# TJR Trading Bot (Daily Plan Edition)

A lightweight Discord bot that delivers a deterministic daily market plan for index futures via slash commands. The bot calculates bias, day profile, and session levels at the 09:29 ET snapshot using historical data pulled from Alpha Vantage, Polygon, and Yahoo Finance fallbacks.

## ✨ Features

- `/bias [date]` – Daily bias (long / short / into-EQ / neutral) for **ES=F** and **NQ=F** (optional `date` in YYYY-MM-DD)
- `/profile symbol:ES` – Day profile classification (P1/P2/P3) plus primary/secondary targets and rationale
- `/levels symbol:ES` – Asia & London session extremes for quick reference
- `/ping` & `/help` – Basic utilities

Under the hood:
- Typed provider layer with automatic fallback (Alpha Vantage → Polygon → Yahoo Finance)
- Deterministic structure engine using 4H/1H swings and session maps pulled from 10-minute bars
- Snapshot-driven analysis (09:29 ET) aligned with the `docs/design/daily-bias-and-profile.md` spec

## 🚀 Quick Start

```bash
npm install
cp trading-bot/.env.example trading-bot/.env
# populate DISCORD_TOKEN, DISCORD_CLIENT_ID, ALPHAVANTAGE_API_KEY, DATABENTO_API_KEY, POLYGON_API_KEY (optional)
cd trading-bot
npm run build
npm run dev # or npm start after registering slash commands
```

Slash commands are registered automatically on startup (guild-only if `DISCORD_GUILD_ID` is set).

## 🧪 Tests

```bash
cd trading-bot
npm test -- --runInBand   # deterministic fixtures covering bias/profile providers and command payloads
```

## 📚 Further Reading

- `docs/design/daily-bias-and-profile.md` – canonical methodology/spec
- `docs/CONFIGURATION.md` – environment variable reference
- `docs/DEPLOYMENT.md` – updated deployment notes for the slim daily-plan runtime
