// /api/td-board — Weekly anytime-touchdown board (v1, live).
//
// Sources (all automated, nothing added to Airtable):
//   nflverse  player weekly stats  -> TD share, opportunity share, opponent TDs allowed by position
//   ESPN      scoreboard           -> this week's games, spreads, over/unders -> implied totals
//   Sleeper   players              -> current team, injury status, headshots (via gsis_id join)
//
// Model: expTD = teamExpTD × playerShare × matchup; teamExpTD ≈ impliedTotal × 0.105
//        playerShare = 0.65·tdShare + 0.35·oppShare (regressed toward position average)
//        tdPct = 1 − e^(−expTD)
// Season blend: baseline season (last completed) carries the prior; current-season
// weeks blend in as they arrive (weight = min(0.65, currentWeeks × 0.12)).
//
// Debug: /api/td-board?debug=1 returns source columns and match counts.

const CANON = { LA: "LAR", STL: "LAR", SD: "LAC", OAK: "LV", WSH: "WAS", JAC: "JAX", HST: "HOU", BLT: "BAL", CLV: "CLE", ARZ: "ARI" };
const canon = (t) => { const u = String(t || "").toUpperCase(); return CANON[u] || u; };

async function getText(url) {
  const r = await fetch(url, { headers: { accept: "text/csv,*/*" } });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
  return r.text();
}
async function getJson(url) {
  const r = await fetch(url, { headers: { accept: "application/json" } });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
  return r.json();
}

// Minimal CSV parser (handles quoted fields with commas)
function parseCsv(text) {
  const rows = []; let row = [], cur = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cur); cur = ""; }
    else if (ch === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
    else if (ch !== "\r") cur += ch;
  }
  if (cur.length || row.length) { row.push(cur); rows.push(row); }
  const header = rows.shift() || [];
  return rows.filter((r) => r.length > 1).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])));
}

// nflverse renames these files between years, so instead of guessing we ask
// GitHub for the release's asset list and pick the weekly player-stats CSV
// for the season. Falls back to the known naming patterns if the API is
// rate-limited.
let _assetCache = null;
async function listPlayerStatAssets() {
  if (_assetCache) return _assetCache;
  try {
    const rel = await getJson("https://api.github.com/repos/nflverse/nflverse-data/releases/tags/player_stats");
    _assetCache = (rel.assets || []).map((a) => ({ name: a.name, url: a.browser_download_url }));
  } catch { _assetCache = []; }
  return _assetCache;
}
async function loadSeasonStats(season) {
  const assets = await listPlayerStatAssets();
  const isCsv = (n) => /\.csv$/i.test(n);
  const hasYear = (n) => n.includes(String(season));
  // Prefer week-level offense files; avoid def/kicking/reg-summary files
  const pick = assets.filter((a) => isCsv(a.name) && hasYear(a.name))
    .filter((a) => !/def|kick|_reg|_post|regpost|season/i.test(a.name))
    .sort((a, b) => (/week/i.test(b.name) ? 1 : 0) - (/week/i.test(a.name) ? 1 : 0))[0];
  const urls = [
    ...(pick ? [pick.url] : []),
    `https://github.com/nflverse/nflverse-data/releases/download/player_stats/stats_player_week_${season}.csv`,
    `https://github.com/nflverse/nflverse-data/releases/download/player_stats/player_stats_${season}.csv`,
  ];
  let lastErr;
  for (const u of urls) {
    try { const t = await getText(u); if (t.length > 1000) return { rows: parseCsv(t), url: u }; }
    catch (e) { lastErr = e; }
  }
  return { rows: [], url: null, error: String(lastErr && lastErr.message), assetsSeen: assets.map((a) => a.name) };
}

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const col = (r, ...names) => { for (const n of names) if (r[n] != null && r[n] !== "") return r[n]; return null; };

// Aggregate one season's weekly rows into per-player and per-team/per-opponent totals
function aggregate(rows) {
  const players = {}, teams = {}, allowed = {};
  for (const r of rows) {
    const st = String(col(r, "season_type") || "REG").toUpperCase();
    if (st !== "REG") continue;
    const pos = String(col(r, "position") || "").toUpperCase();
    if (!["RB", "WR", "TE", "QB"].includes(pos)) continue;
    const id = col(r, "player_id", "gsis_id");
    const team = canon(col(r, "team", "recent_team"));
    const opp = canon(col(r, "opponent_team"));
    const name = col(r, "player_display_name", "player_name") || "";
    const carries = num(col(r, "carries", "rushing_attempts"));
    const targets = num(col(r, "targets"));
    const rushTd = num(col(r, "rushing_tds"));
    const recTd = num(col(r, "receiving_tds"));
    const tds = rushTd + recTd;
    const p = (players[id] ??= { id, name, pos, team, games: 0, carries: 0, targets: 0, tds: 0 });
    p.games++; p.carries += carries; p.targets += targets; p.tds += tds; p.team = team; p.name = name || p.name;
    const t = (teams[team] ??= { games: new Set(), carries: 0, targets: 0, tds: 0 });
    t.games.add(col(r, "week")); t.carries += carries; t.targets += targets; t.tds += tds;
    if (opp && pos !== "QB") {
      const a = (allowed[opp] ??= { games: new Set(), RB: 0, WR: 0, TE: 0 });
      a.games.add(col(r, "week")); a[pos] += tds;
    }
  }
  for (const t of Object.values(teams)) t.games = t.games.size || 1;
  for (const a of Object.values(allowed)) a.games = a.games.size || 1;
  return { players, teams, allowed };
}

// "CIN -3.5" + O/U 50.5 -> implied totals for both teams
function impliedTotals(game) {
  const ou = game.odds?.overUnder; const det = game.odds?.details || "";
  if (ou == null) return { home: null, away: null };
  const m = det.match(/([A-Z]{2,4})\s*([-+]?\d+(\.\d+)?)/);
  if (!m) return { home: ou / 2, away: ou / 2 };
  const fav = canon(m[1]), spread = Math.abs(Number(m[2]));
  const favTotal = (ou + spread) / 2, dogTotal = (ou - spread) / 2;
  const homeIsFav = canon(game.home.abbr) === fav;
  return { home: homeIsFav ? favTotal : dogTotal, away: homeIsFav ? dogTotal : favTotal, favorite: fav, spread };
}

export default async function handler(req, res) {
  const debug = req.query && req.query.debug;
  try {
    const now = new Date();
    const curSeason = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
    const baseSeason = curSeason - 1;

    const [sb, base, cur, sleeper] = await Promise.all([
      getJson(`${req.headers["x-forwarded-proto"] || "https"}://${req.headers.host}/api/scoreboard`),
      loadSeasonStats(baseSeason),
      loadSeasonStats(curSeason),
      getJson("https://api.sleeper.app/v1/players/nfl"),
    ]);

    // Sleeper index by gsis_id -> current team / injury / headshot
    const byGsis = {};
    for (const [sid, sp] of Object.entries(sleeper || {})) if (sp && sp.gsis_id) byGsis[sp.gsis_id] = { ...sp, sleeper_id: sid };

    const B = aggregate(base.rows), C = aggregate(cur.rows);
    const curWeeks = Math.max(0, ...Object.values(C.teams).map((t) => t.games), 0);
    const wCur = Math.min(0.65, curWeeks * 0.12); // 0 in Week 1, ~0.36 by Week 3, caps at 0.65

    // Position averages for regression
    const posAvg = { RB: { td: 0.14, opp: 0.12 }, WR: { td: 0.12, opp: 0.12 }, TE: { td: 0.09, opp: 0.09 } };

    // This week's games -> per-team context; skip teams whose game already finished
    const ctx = {};
    for (const g of sb.games || []) {
      const it = impliedTotals(g);
      const done = g.state === "post";
      ctx[canon(g.home.abbr)] = { opp: canon(g.away.abbr), home: true, implTotal: it.home, spread: it.favorite === canon(g.home.abbr) ? -it.spread : it.spread, venue: g.venue, done, state: g.state };
      ctx[canon(g.away.abbr)] = { opp: canon(g.home.abbr), home: false, implTotal: it.away, spread: it.favorite === canon(g.away.abbr) ? -it.spread : it.spread, venue: g.venue, done, state: g.state };
    }

    // League-average TDs allowed per game by position (for matchup multiplier)
    const allowedRate = (A, opp, pos) => (A.allowed[opp] ? A.allowed[opp][pos] / A.allowed[opp].games : null);
    const leagueAvg = {};
    for (const pos of ["RB", "WR", "TE"]) {
      const vals = Object.keys(B.allowed).map((o) => allowedRate(B, o, pos)).filter((v) => v != null);
      leagueAvg[pos] = vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 1;
    }
    const oppRanks = {};
    for (const pos of ["RB", "WR", "TE"]) {
      const list = Object.keys(B.allowed).map((o) => [o, allowedRate(B, o, pos)]).filter(([, v]) => v != null).sort((a, b) => a[1] - b[1]);
      list.forEach(([o], i) => { (oppRanks[o] ??= {})[pos] = i + 1; }); // 1 = stingiest
    }

    const cards = [];
    let matched = 0, noTeam = 0, noGame = 0;
    for (const [id, bp] of Object.entries(B.players)) {
      if (bp.pos === "QB") continue;
      const sp = byGsis[id];
      const team = canon(sp && sp.team ? sp.team : bp.team);
      if (!sp || !sp.team) { noTeam++; continue; }             // not on an NFL roster now
      const g = ctx[team];
      if (!g || g.done) { noGame++; continue; }                // bye, or already played this week
      const injSt = String(sp.injury_status || "").toUpperCase();
      if (["OUT", "IR", "PUP", "NA", "SUS", "COV", "DNR"].includes(injSt)) continue;
      if (/injured reserve|pup|suspend/i.test(String(sp.status || ""))) continue;
      if (bp.games < 4) continue;

      const bt = B.teams[bp.team] || { tds: 1, carries: 1, targets: 1, games: 1 };
      const tdShareB = bt.tds ? bp.tds / bt.tds : 0;
      const oppShareB = (bp.carries + bp.targets) / Math.max(1, bt.carries + bt.targets);
      const cp = C.players[id], ct = cp ? C.teams[cp.team] : null;
      const tdShareC = cp && ct && ct.tds ? cp.tds / ct.tds : null;
      const oppShareC = cp && ct ? (cp.carries + cp.targets) / Math.max(1, ct.carries + ct.targets) : null;
      const blend = (b, c) => (c == null ? b : (1 - wCur) * b + wCur * c);
      // Regress thin baselines toward the position average
      const reg = Math.min(1, bp.games / 12);
      const tdShare = blend(reg * tdShareB + (1 - reg) * posAvg[bp.pos].td, tdShareC);
      const oppShare = blend(reg * oppShareB + (1 - reg) * posAvg[bp.pos].opp, oppShareC);
      const share = 0.65 * tdShare + 0.35 * oppShare;

      const implTotal = g.implTotal;
      const teamExpTd = (implTotal != null ? implTotal : 22) * 0.105;
      const oppRate = allowedRate(B, g.opp, bp.pos);
      const matchup = oppRate != null ? Math.max(0.8, Math.min(1.2, oppRate / leagueAvg[bp.pos])) : 1;
      const expTd = teamExpTd * share * matchup;
      const tdPct = 1 - Math.exp(-expTd);
      matched++;
      cards.push({
        name: bp.name, team, pos: bp.pos, role: (sp.depth_chart_position || bp.pos) + (sp.depth_chart_order || ""),
        opp: g.opp, home: g.home, spread: g.spread ?? null, implTotal: implTotal != null ? Number(implTotal.toFixed(1)) : null,
        rzShare: Number(tdShare.toFixed(3)), oppShare: Number(oppShare.toFixed(3)),
        oppTdAllowedPg: oppRate != null ? Number(oppRate.toFixed(2)) : null, oppTdRank: oppRanks[g.opp]?.[bp.pos] ?? null,
        expTd: Number(expTd.toFixed(3)), tdPct: Number(tdPct.toFixed(3)),
        venue: g.venue || null, dome: false, weather: null,
        injury: injSt === "QUESTIONABLE" || injSt === "DOUBTFUL" ? injSt[0] + injSt.slice(1).toLowerCase() : null,
        headshot: `https://sleepercdn.com/content/nfl/players/${sp.sleeper_id}.jpg`,
        sleeperId: sp.sleeper_id, gsis: id,
      });
    }
    cards.sort((a, b) => b.tdPct - a.tdPct);

    res.setHeader("Cache-Control", "s-maxage=1800, stale-while-revalidate=3600");
    const out = {
      ready: cards.length > 0, season: curSeason, baseSeason, week: sb.week, version: "v1",
      updatedAt: new Date().toISOString(), currentWeeksBlended: curWeeks, currentWeight: wCur,
      cards: cards.slice(0, 40),
    };
    if (debug) out.debug = {
      baseUrl: base.url, baseRows: base.rows.length, baseError: base.error || null, assetsSeen: base.assetsSeen || null,
      curUrl: cur.url, curRows: cur.rows.length, curError: cur.error || null,
      baseColumns: base.rows[0] ? Object.keys(base.rows[0]) : [],
      games: (sb.games || []).length, matched, noTeam, noGame,
      sampleTeamCtx: Object.entries(ctx).slice(0, 4),
    };
    return res.status(200).json(out);
  } catch (e) {
    return res.status(502).json({ ready: false, cards: [], error: String(e.message || e) });
  }
}
