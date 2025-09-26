Here’s a self-contained design document you can drop into the repo as docs/design/daily-bias-and-profile.md. It codifies only what we need now: a deterministic Daily Bias and a simple Day Profile (P1/P2/P3), with stable command contracts and testable algorithms—no implementation code.

Daily Bias & Day Profile – Design Document (v1)

1) Objective & Non-Goals

Objective. Provide two deterministic, pre-market outputs for a given symbol (e.g., ES1!, NQ1!):
	•	Daily Bias v1 — Long / Short / Neutral, plus “into-EQ” variants to indicate expected rotation toward the current swing’s equilibrium (50%).
	•	Day Profile v1 — P1 / P2 / P3 classification that describes the likely intraday “shape” using structure + premium/discount context and session extremes.

Non-Goals (for this slice).
	•	No confluence scoring, alerts, ML, SMT divergence, FVG/OB execution logic, or risk modules (those exist in later phases of the old plan and are out of scope now).  ￼  ￼
	•	No live websockets required; we only need historical bars up to 09:29:00 ET (the pre-open snapshot for planning).

2) Scope & Inputs

2.1 Timeframes & Cutoff
	•	Cutoff: Compute at 09:25–09:29 ET; pick one fixed snapshot (09:29:00 ET) for reproducibility.
	•	Timeframes:
	•	4H and 1H for structure and active range/EQ.
	•	10m (or 15m if provider-constrained) to derive session highs/lows (Asia and London).
This matches how the transcripts frame “updated daily bias” primarily around premium/discount (EQ) and structure (BoS) at higher TFs, with session extremes as magnets.  ￼  ￼

2.2 Data Providers (MVP)
	•	Historical OHLCV only (4H/1H/10m). The old plan lists TradingView webhooks for real-time and Polygon/Alpha Vantage for historical. For this MVP we can choose any single reliable historical source and keep a thin provider shim.  ￼

2.3 Symbols
	•	Start with index futures tickers you use (e.g., NQ1!, ES1!). Make symbol mapping configurable.

3) Outputs

3.1 JSON: Daily Bias v1

{
  "symbol": "NQ1!",
  "asOf": "2025-09-25T09:29:00-04:00",
  "bias": "long|short|long-into-eq|short-into-eq|neutral",
  "trendTF": "4H|1H",
  "range": { "low": 0.0, "high": 0.0, "eq": 0.0 },
  "structure": { "state": "bullish|bearish|neutral", "lastBoS": "up|down|null" },
  "notes": [
    "in discount of 4H uptrend",
    "expect rotation to EQ before continuation"
  ]
}

3.2 JSON: Day Profile v1

{
  "symbol": "NQ1!",
  "asOf": "2025-09-25T09:29:00-04:00",
  "profile": "P1|P2|P3",
  "sessionMap": {
    "asia":   { "high": 0.0, "low": 0.0, "window": "18:00-01:00 ET" },
    "london": { "high": 0.0, "low": 0.0, "window": "03:00-07:00 ET" }
  },
  "targets": {
    "primary":   "prior session high|low|EQ|prior day high|prior day low",
    "secondary": "opposite session extreme or prior day extreme"
  },
  "rationale": [
    "bullish structure + discounted open → continuation toward prior external liquidity"
  ]
}

3.3 Discord Commands (contracts)
	•	/bias symbol:<ticker> → Render Daily Bias v1 (headline bias, TF used, range/EQ, one-line rationale).
	•	/profile symbol:<ticker> → Render Day Profile v1 (P1/P2/P3, session highs/lows, targets, one-line rationale).
	•	(Optional) /levels symbol:<ticker> → Just the session map table (reuses the same session extraction).
The legacy plan lists !bias and session levels, but without pinned algorithms; this doc makes both deterministic.  ￼

4) Algorithms

4.1 Structure & Active Range Detection

Goal: Decide the operating trend and its active swing range, then compute EQ (50%).

Definitions:
	•	BoS (Break of Structure): A confirmed break above a prior swing high (bullish) or below a prior swing low (bearish).
	•	Active swing range: The swing pair (low→high for uptrends; high→low for downtrends) associated with the last confirmed BoS.

High-level steps (4H → 1H):
	1.	On 4H, detect swings (standard zig-zag with a configurable pivot threshold).
	2.	Detect last confirmed BoS within lookback N bars.
	•	If last BoS = up → provisional trend = bullish.
	•	If last BoS = down → provisional trend = bearish.
	•	If none → neutral.
	3.	Select active range consistent with the provisional trend:
	•	Bullish: [last swing low, last swing high] that produced/confirmed the BoS up.
	•	Bearish: [last swing high, last swing low] that produced/confirmed the BoS down.
	4.	EQ = (high + low)/2.0 of that range.
	5.	On 1H, if there is a very recent BoS (within M bars) that conflicts with the 4H trend, allow the 1H to override for the day (tie-breaker).
This follows the transcripts’ “order flow = trends (HH/HL vs LL/LH) with BoS as the flip,” and “premium/discount around the 50% EQ.”  ￼  ￼  ￼

Pseudo-code (structure):

function detectTrendAndRange(bars4H, bars1H):
  swings4H = detectSwings(bars4H)
  lastBoS4H = findLastBOS(swings4H)
  trend = fromBoS(lastBoS4H)  # bullish|bearish|neutral

  if trend == bullish:
     range = selectRangeForUptrend(swings4H, lastBoS4H)  # [L,H]
  else if trend == bearish:
     range = selectRangeForDowntrend(swings4H, lastBoS4H) # [H,L]
  else:
     range = null

  # Optional H1 override
  lastBoS1H = findRecentBOS(detectSwings(bars1H), maxAge=M)
  trend = maybeOverrideWith1H(trend, lastBoS1H)

  eq = computeEQ(range)
  return trend, range, eq

4.2 Daily Bias v1

Principle (from transcripts): Use premium/discount relative to the active range’s EQ to guide bias; follow the structural trend, or expect a rotation to EQ when price opens against value.  ￼  ￼

Rules at 09:29 ET:
	•	If trend = bullish:
	•	If price < EQ → Bias = long (“in discount of uptrend”).
	•	If price > EQ → Bias = short-into-eq (expect rotation down to EQ first).
	•	If trend = bearish:
	•	If price > EQ → Bias = short (“in premium of downtrend”).
	•	If price < EQ → Bias = long-into-eq (expect rotation up to EQ first).
	•	If trend = neutral → Bias = neutral.

Pseudo-code (bias):

function computeDailyBias(trend, eq, price):
  if trend == bullish:
     return (price < eq) ? "long" : "short-into-eq"
  if trend == bearish:
     return (price > eq) ? "short" : "long-into-eq"
  return "neutral"

4.3 Session Map (Asia/London)

Goal: Provide the Asia and London prior session high/low as reference liquidity magnets (used in profile targets).
Windows (configurable): Asia ~ 18:00–01:00 ET; London ~ 03:00–07:00 ET.
Method: On 10m bars, compute max(high) and min(low) inside each window (previous calendar day into current pre-market). These serve as external liquidity references in the day plan. (Transcripts emphasize session extremes as practical magnets; lightweight derivation suffices for v1.)

Pseudo-code (sessions):

function priorSessionExtremes(bars10m, sessionWindow):
  inWindow = filterByETWindow(bars10m, sessionWindow)
  return { high: max(inWindow.high), low: min(inWindow.low) }

4.4 Day Profile v1 (P1/P2/P3)

Intent: A small taxonomy to describe the day’s “shape” using structure + premium/discount at the open and session extremes for targeting.
	•	P1 – Trend-Continuation Day. Structural trend is clear and price opens on the value side (bullish+discount OR bearish+premium). Expect continuation toward prior external liquidity in trend direction.
	•	P2 – Retrace-to-EQ Day. Structural trend is clear but price opens on the non-value side (bullish+premium OR bearish+discount). Expect initial rotation to EQ, then reassess for continuation/fade.
	•	P3 – Range/Indecision Day. No recent BoS or conflicting TFs → neutral, expect range behavior until structure clarifies.

Pseudo-code (profile):

function classifyProfile(trend, bias, eq, sessions, price):
  if trend == neutral:
     return "P3"
  if (trend == bullish && bias == "long") or
     (trend == bearish && bias == "short"):
     return "P1"
  if (trend == bullish && bias == "short-into-eq") or
     (trend == bearish && bias == "long-into-eq"):
     return "P2"
  return "P3"

Targets (v1 heuristics):
	•	P1: Primary = prior session high (if bullish) or prior session low (if bearish); Secondary = opposite session extreme or prior day extreme.
	•	P2: Primary = EQ (complete the rotation); Secondary = nearest prior session extreme after EQ touch.
	•	P3: Primary = prior session high/low band; trade extremes if/when structure clarifies.

These mirror the transcript’s emphasis: EQ rotation when opening in premium/discount against trend; session extremes as magnets; structure is just HH/HL vs LL/LH with BoS flips.  ￼  ￼

5) Data Model (MVP)

5.1 In-memory/domain objects

type OHLC = { t:number, o:number, h:number, l:number, c:number, v?:number };

type Trend = 'bullish'|'bearish'|'neutral';

type Range = { low:number, high:number, eq:number };

type StructureInfo = { state:Trend, lastBoS:'up'|'down'|null };

type SessionExtremes = { high:number, low:number, window:string };

type DailyBias = {
  symbol:string, asOf:string,
  bias:'long'|'short'|'long-into-eq'|'short-into-eq'|'neutral',
  trendTF:'4H'|'1H',
  range:Range,
  structure:StructureInfo,
  notes:string[]
};

type DayProfile = {
  symbol:string, asOf:string, profile:'P1'|'P2'|'P3',
  sessionMap:{ asia:SessionExtremes, london:SessionExtremes },
  targets:{ primary:string, secondary:string },
  rationale:string[]
};

5.2 Provider shim interface

interface MarketDataProvider {
  getBars(symbol:string, tf:'4H'|'1H'|'10m', endISO:string, lookback:int): Promise<OHLC[]>
}

6) Command & Rendering Contracts

6.1 /bias
	•	Input: symbol (default from config).
	•	Flow: fetch bars → detect trend/range/EQ → compute bias → persist (optional) → render embed:
	•	Title: “Daily Bias — NQ1! (09:29 ET)”
	•	Headline: long | short | (into EQ) | neutral
	•	Fields: TF used, Range (L/H/EQ), Reason (1-line), Last BoS direction, Price vs EQ.

6.2 /profile
	•	Input: symbol.
	•	Flow: fetch 10m → compute Asia/London highs/lows → compute bias (for dependency) → classify P1/P2/P3 → render embed:
	•	Title: “Day Profile — NQ1! (09:29 ET)”
	•	Headline: P1 | P2 | P3
	•	Fields: Session table (Asia H/L, London H/L), Primary Target, Secondary Target, Rationale.

(The legacy plan mentions these kinds of commands but didn’t define the internal rules; this doc does.)  ￼

7) Pseudo-Flow (end-to-end)

/bias(symbol):
  nowET = "today 09:29:00 ET"
  bars4H = provider.getBars(symbol, '4H', nowET, lookback=90)
  bars1H = provider.getBars(symbol, '1H', nowET, lookback=180)
  price  = lastClose(bars1H)

  trend, range, eq = detectTrendAndRange(bars4H, bars1H)
  bias = computeDailyBias(trend, eq, price)

  return DailyBias{...}

/profile(symbol):
  nowET = "today 09:29:00 ET"
  bars10 = provider.getBars(symbol, '10m', nowET, lookback=6*24)  # ~4 days
  asia   = priorSessionExtremes(bars10, "18:00-01:00 ET")
  london = priorSessionExtremes(bars10, "03:00-07:00 ET")

  # dependency: bias/trend/eq for classification and targets
  biasObj = /bias(symbol)  # or call compute steps locally
  profile = classifyProfile(biasObj.structure.state, biasObj.bias, biasObj.range.eq, {asia,london}, lastClose(bars10))

  targets = chooseTargets(profile, biasObj.structure.state, {asia,london}, biasObj.range.eq)
  return DayProfile{ sessionMap:{asia,london}, profile, targets, rationale:[...] }

8) Testing Strategy (MVP)

8.1 Golden-Day Fixtures
	•	Three fixtures: one each for expected P1, P2, P3.
	•	Store raw price series (4H, 1H, 10m) + expected JSON snapshots for /bias and /profile.

8.2 Determinism & Time
	•	Freeze time to 09:29:00 ET for all tests. Validate that the same inputs always produce identical JSON output.

8.3 Edge Cases
	•	No clear BoS in last N bars → neutral.
	•	Mixed TF signals (recent 1H BoS vs stale 4H BoS) → ensure override logic triggers.
	•	Flat sessions (Asia/London windows with identical H/L) → still return valid extremes.

9) Operational Notes
	•	Timezones: Normalize all timestamps to ET for session windows; store raw data in UTC, convert on read.
	•	Caching: If the same symbol is requested multiple times pre-market, cache computed JSON until the next bar prints.
	•	Observability: Log decision steps (trend, range, eq, price, chosen bias) for debugging and future evals.

10) Gaps vs Existing TJR Plan & What We Intentionally Skip

Area	What TJR Plan Emphasizes	What We Need Now	Decision
Liquidity scanner, confluence, pattern libs	Heavy focus (equal highs/lows, weights, FVG, SMT)  ￼	Not needed to emit bias/profile	Defer to later
API/webhooks/queues	TradingView webhooks, Redis/Bull queues, scaling  ￼	Only historical reads pre-market	Use a thin provider shim
Bias algorithm	“Simple bias calc” mentioned but not defined precisely  ￼	Deterministic rules pinned to EQ + BoS	Specified here
Session analytics	Broad “session analytics” goal  ￼	Just Asia/London extremes	Specified here
Commands	Mentions !bias, !levels broadly  ￼	Slash commands with fixed JSON shapes	Specified here

11) Acceptance Criteria

/bias
	•	Given valid 4H/1H bars and a pre-market timestamp, the service returns a JSON object matching the Daily Bias v1 schema with:
	•	bias in the allowed set.
	•	structure.state derived from last BoS (4H, with 1H override as defined).
	•	range.eq equals (H+L)/2 of the active swing.
	•	notes contains at least one human-readable reason (e.g., “in discount of 4H uptrend”).

/profile
	•	Given valid 10m bars and the same pre-market timestamp, the service returns a JSON object matching Day Profile v1 schema with:
	•	sessionMap.asia.high/low and sessionMap.london.high/low computed from configured ET windows.
	•	profile ∈ {P1,P2,P3} using Section 4.4 rules.
	•	targets.primary and targets.secondary chosen per profile heuristics.

Tests
	•	Three golden fixtures produce exactly the expected snapshots.
	•	Edge cases (no BoS, conflicting TFs) behave as defined.

12) Implementation Checklist (no code, just tasks)
	1.	Provider shim: src/data/provider.ts interface + one concrete implementation for historical OHLC. (Configure timeframes 4H/1H/10m.)  ￼
	2.	Structure module: src/analysis/structure/structure.ts
	•	detectSwings(bars); findLastBOS(swings); selectRangeForUptrend/Downtrend(swings, lastBoS); computeEQ(range); maybeOverrideWith1H(...).
	3.	Bias engine: src/analysis/bias/bias-v1.ts
	•	computeDailyBias(trend, eq, price); payload assembler for DailyBias JSON.
	4.	Session map: src/analysis/session/sessions.ts
	•	priorSessionExtremes(bars10m, windowET); Asia+London windows; payload for session map.
	5.	Profile engine: src/analysis/profile/day-profile-v1.ts
	•	classifyProfile(trend, bias, eq, sessionMap, price); chooseTargets(...); payload for DayProfile JSON.
	6.	Commands: src/bot/commands/bias.ts, src/bot/commands/profile.ts
	•	Parse symbol → call engines → render embeds (use JSON fields above).
	7.	Fixtures & tests: tests/fixtures/{p1,p2,p3}/..., tests/bias.profile.spec.ts
	•	Freeze time to 09:29 ET; assert snapshots match.

⸻

Appendix A — Source Alignment (why these rules)
	•	The transcripts’ “updated daily bias” approach is premium/discount around EQ (50%) with structure coming from order flow (HH/HL vs LL/LH) and BoS flips; open above/below EQ drives whether we follow trend or expect a rotation to EQ first.  ￼  ￼  ￼
	•	The TJR plan has a broad roadmap (liquidity scanner, confluence, session analytics, SMT, etc.) but lacks a precise, deterministic spec for bias and no explicit day profile taxonomy; this doc supplies both, keeping only what we need to ship /bias and /profile.  ￼  ￼
