// /api/td-board — Weekly anytime-touchdown board (v1).
//
// The question each card answers: "how good is this player at scoring, and
// how bad is this week's opponent at stopping his position?"
//
// Sources (all automated):
//   nflverse  weekly player stats  -> player TD share & touches; opponent TDs/yards allowed by position
//   Sleeper   season stats         -> fallback player baseline if nflverse is unreachable
//   ESPN      scoreboard           -> this week's games, spreads, over/unders -> implied team totals
//   Sleeper   players              -> current team, injury status, headshot
//
// Score: xTD = (implied total × 0.105) × playerShare × matchup
//        playerShare = 65% TD share + 35% opportunity share (regressed toward position avg)
//        matchup     = opponent TDs allowed to this position ÷ league average (capped 0.8–1.2)
//        TD%         = 1 − e^(−xTD)   (chance of at least one touchdown)
// Debug: /api/td-board?debug=1

const CANON = { LA: "LAR", STL: "LAR", SD: "LAC", OAK: "LV", WSH: "WAS", JAC: "JAX", HST: "HOU", BLT: "BAL", CLV: "CLE", ARZ: "ARI" };
const canon = (t) => { const u = String(t || "").toUpperCase(); return CANON[u] || u; };
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const col = (r, ...names) => { for (const n of names) if (r[n] != null && r[n] !== "") return r[n]; return null; };

async function getJson(url) {
  const r = await fetch(url, { headers: { accept: "application/json" } });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
  return r.json();
}

function parseCsv(text) {
  const rows = []; let row = [], cur = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cur); cur = ""; }
    else if (ch === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
    else if (ch !== "\r") cur += ch;
  }
  if (cur.length || row.length) { row.push(cur); rows.push(row); }
  const header = rows.shift() || [];
  return rows.filter((r) => r.length > 1).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])));
}

// ── nflverse weekly player stats (direct URL first; listing is capped so it's last resort)
async function listAssetsPaginated() {
  const rel = await getJson("https://api.github.com/repos/nflverse/nflverse-data/releases/tags/player_stats");
  const out = [];
  for (let page = 1; page <= 25; page++) {
    const chunk = await getJson(`https://api.github.com/repos/nflverse/nflverse-data/releases/${rel.id}/assets?per_page=100&page=${page}`);
    out.push(...chunk.map((a) => ({ name: a.name, url: a.browser_download_url })));
    if (chunk.length < 100) break;
  }
  return out;
}
async function loadNflverse(season) {
  const base = "https://github.com/nflverse/nflverse-data/releases/download/player_stats/";
  const attempts = [];
  const tryUrl = async (u) => {
    try {
      const r = await fetch(u, { headers: { accept: "text/csv,*/*" }, redirect: "follow" });
      if (!r.ok) { attempts.push({ url: u, status: r.status }); return null; }
      const t = await r.text();
      if (t.length < 1000) { attempts.push({ url: u, status: r.status, note: "tiny body" }); return null; }
      return t;
    } catch (e) { attempts.push({ url: u, error: String(e.message || e) }); return null; }
  };
  for (const u of [`${base}stats_player_week_${season}.csv`, `${base}player_stats_${season}.csv`]) {
    const t = await tryUrl(u);
    if (t) return { rows: parseCsv(t), url: u, attempts };
  }
  try {
    const assets = await listAssetsPaginated();
    const hit = assets.find((a) => a.name === `stats_player_week_${season}.csv`);
    if (hit) { const t = await tryUrl(hit.url); if (t) return { rows: parseCsv(t), url: hit.url, attempts }; }
    attempts.push({ note: "listing had no weekly file for " + season, seasonFilesSeen: assets.filter((a) => a.name.includes(String(season))).map((a) => a.name).slice(0, 40) });
  } catch (e) { attempts.push({ note: "listing failed", error: String(e.message || e) }); }
  return { rows: [], url: null, attempts };
}

// One season of weekly rows -> per-player totals, per-team totals, per-opponent allowed-by-position
function aggregate(rows) {
  const players = {}, teams = {}, allowed = {};
  for (const r of rows) {
    if (String(col(r, "season_type") || "REG").toUpperCase() !== "REG") continue;
    const pos = String(col(r, "position") || "").toUpperCase();
    if (!["RB", "WR", "TE", "QB"].includes(pos)) continue;
    const id = col(r, "player_id", "gsis_id");
    const team = canon(col(r, "team", "recent_team"));
    const opp = canon(col(r, "opponent_team"));
    const carries = num(col(r, "carries", "rushing_attempts")), targets = num(col(r, "targets"));
    const tds = num(col(r, "rushing_tds")) + num(col(r, "receiving_tds"));
    const yds = num(col(r, "rushing_yards")) + num(col(r, "receiving_yards"));
    const p = (players[id] ??= { id, name: col(r, "player_display_name", "player_name") || "", pos, team, games: 0, carries: 0, targets: 0, tds: 0, yds: 0 });
    p.games++; p.carries += carries; p.targets += targets; p.tds += tds; p.yds += yds; p.team = team;
    const t = (teams[team] ??= { weeks: new Set(), carries: 0, targets: 0, tds: 0 });
    t.weeks.add(col(r, "week")); t.carries += carries; t.targets += targets; t.tds += tds;
    if (opp && pos !== "QB") {
      const a = (allowed[opp] ??= { weeks: new Set(), RB: { td: 0, yds: 0 }, WR: { td: 0, yds: 0 }, TE: { td: 0, yds: 0 } });
      a.weeks.add(col(r, "week")); a[pos].td += tds; a[pos].yds += yds;
    }
  }
  for (const t of Object.values(teams)) t.games = t.weeks.size || 1;
  for (const a of Object.values(allowed)) a.games = a.weeks.size || 1;
  return { players, teams, allowed };
}

// ── Sleeper season stats: fallback player baseline (no opponent splits)
async function loadSleeperSeason(season, sleeperPlayers) {
  try {
    const st = await getJson(`https://api.sleeper.app/v1/stats/nfl/regular/${season}`);
    const players = {}, teams = {};
    for (const [sid, s] of Object.entries(st || {})) {
      const sp = sleeperPlayers[sid]; if (!sp || !sp.gsis_id) continue;
      const pos = String(sp.position || "").toUpperCase(); if (!["RB", "WR", "TE"].includes(pos)) continue;
      const g = num(s.gp || s.gms_active), carries = num(s.rush_att), targets = num(s.rec_tgt);
      const tds = num(s.rush_td) + num(s.rec_td), yds = num(s.rush_yd) + num(s.rec_yd);
      if (!g) continue;
      const team = canon(sp.team);
      players[sp.gsis_id] = { id: sp.gsis_id, name: sp.full_name || `${sp.first_name} ${sp.last_name}`, pos, team, games: g, carries, targets, tds, yds };
      const t = (teams[team] ??= { games: 17, carries: 0, targets: 0, tds: 0 });
      t.carries += carries; t.targets += targets; t.tds += tds;
    }
    return { players, teams, allowed: {} };
  } catch (e) { return { players: {}, teams: {}, allowed: {}, error: String(e.message || e) }; }
}

// "CIN -3.5" + O/U 50.5 -> implied totals
function impliedTotals(game) {
  const ou = game.odds?.overUnder, det = game.odds?.details || "";
  if (ou == null) return {};
  const m = det.match(/([A-Z]{2,4})\s*([-+]?\d+(\.\d+)?)/);
  if (!m) return { home: ou / 2, away: ou / 2 };
  const fav = canon(m[1]), spread = Math.abs(Number(m[2]));
  const homeFav = canon(game.home.abbr) === fav;
  return { home: homeFav ? (ou + spread) / 2 : (ou - spread) / 2, away: homeFav ? (ou - spread) / 2 : (ou + spread) / 2, favorite: fav, spread };
}

export default async function handler(req, res) {
  const debug = req.query && req.query.debug;
  try {
    const now = new Date();
    const curSeason = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
    const baseSeason = curSeason - 1;
    const proto = req.headers["x-forwarded-proto"] || "https";

    const [sb, sleeper, nvBase, nvCur] = await Promise.all([
      getJson(`${proto}://${req.headers.host}/api/scoreboard`),
      getJson("https://api.sleeper.app/v1/players/nfl"),
      loadNflverse(baseSeason),
      loadNflverse(curSeason),
    ]);
    const byGsis = {};
    for (const [sid, sp] of Object.entries(sleeper || {})) if (sp && sp.gsis_id) byGsis[sp.gsis_id] = { ...sp, sleeper_id: sid };

    // Baseline: nflverse if it loaded, else Sleeper season stats
    let B, baseSource;
    if (nvBase.rows.length) { B = aggregate(nvBase.rows); baseSource = "nflverse"; }
    else { B = await loadSleeperSeason(baseSeason, sleeper); baseSource = "sleeper"; }
    const C = nvCur.rows.length ? aggregate(nvCur.rows) : { players: {}, teams: {}, allowed: {} };
    const curWeeks = Math.max(0, ...Object.values(C.teams).map((t) => t.games || 0), 0);
    const wCur = Math.min(0.65, curWeeks * 0.12);
    const posAvg = { RB: { td: 0.14, opp: 0.12 }, WR: { td: 0.12, opp: 0.12 }, TE: { td: 0.09, opp: 0.09 } };

    // This week's games -> per-team context
    const ctx = {};
    for (const g of sb.games || []) {
      const it = impliedTotals(g);
      const done = g.state === "post";
      const h = canon(g.home.abbr), a = canon(g.away.abbr);
      ctx[h] = { opp: a, home: true, implTotal: it.home ?? null, spread: it.favorite == null ? null : (it.favorite === h ? -it.spread : it.spread), done, kickoff: g.date };
      ctx[a] = { opp: h, home: false, implTotal: it.away ?? null, spread: it.favorite == null ? null : (it.favorite === a ? -it.spread : it.spread), done, kickoff: g.date };
    }

    // Opponent defense vs position: per-game TDs & yards allowed, ranked 1 (stingiest) .. 32
    const A = B.allowed;
    const rate = (opp, pos, k) => (A[opp] ? A[opp][pos][k] / A[opp].games : null);
    const league = {}, ranks = {};
    for (const pos of ["RB", "WR", "TE"]) {
      for (const k of ["td", "yds"]) {
        const list = Object.keys(A).map((o) => [o, rate(o, pos, k)]).filter(([, v]) => v != null).sort((x, y) => x[1] - y[1]);
        league[pos + k] = list.length ? list.reduce((s, [, v]) => s + v, 0) / list.length : null;
        list.forEach(([o], i) => { ((ranks[o] ??= {})[pos] ??= {})[k] = i + 1; });
      }
    }

    const cards = [];
    let noTeam = 0, noGame = 0, excluded = 0;
    for (const [id, bp] of Object.entries(B.players)) {
      if (!["RB", "WR", "TE"].includes(bp.pos)) continue;
      const sp = byGsis[id];
      if (!sp || !sp.team) { noTeam++; continue; }
      const team = canon(sp.team);
      const g = ctx[team];
      if (!g || g.done) { noGame++; continue; }
      const injSt = String(sp.injury_status || "").toUpperCase();
      if (["OUT", "IR", "PUP", "NA", "SUS", "COV", "DNR"].includes(injSt) || /injured reserve|pup|suspend/i.test(String(sp.status || ""))) { excluded++; continue; }
      if (bp.games < 4) continue;

      // Team denominators. nflverse gives real per-team totals; Sleeper season
      // stats carry no team splits, so fall back to league-average team volume
      // (≈38 skill-position TDs and ≈1000 carries+targets per team-season).
      // Without this, a player with 7 TDs reads as "100% of his team's TDs".
      const bt = (baseSource === "nflverse" && B.teams[bp.team] && B.teams[bp.team].tds >= 15)
        ? B.teams[bp.team] : { tds: 38, carries: 450, targets: 550 };
      const reg = Math.min(1, bp.games / 12);
      const tdShareB = Math.min(0.45, reg * (bp.tds / bt.tds) + (1 - reg) * posAvg[bp.pos].td);
      const oppShareB = Math.min(0.40, reg * ((bp.carries + bp.targets) / Math.max(1, bt.carries + bt.targets)) + (1 - reg) * posAvg[bp.pos].opp);
      const cp = C.players[id], ct = cp ? C.teams[cp.team] : null;
      const blend = (b, c) => (c == null ? b : (1 - wCur) * b + wCur * c);
      const tdShare = blend(tdShareB, cp && ct && ct.tds ? cp.tds / ct.tds : null);
      const oppShare = blend(oppShareB, cp && ct ? (cp.carries + cp.targets) / Math.max(1, ct.carries + ct.targets) : null);
      const share = 0.65 * tdShare + 0.35 * oppShare;

      const implTotal = g.implTotal;
      const teamExpTd = (implTotal != null ? implTotal : 22) * 0.105;
      const oppTd = rate(g.opp, bp.pos, "td"), oppYds = rate(g.opp, bp.pos, "yds");
      const matchup = oppTd != null && league[bp.pos + "td"] ? Math.max(0.8, Math.min(1.2, oppTd / league[bp.pos + "td"])) : 1;
      const expTd = teamExpTd * share * matchup;

      cards.push({
        name: bp.name, team, pos: bp.pos, role: (sp.depth_chart_position || bp.pos) + (sp.depth_chart_order || ""),
        opp: g.opp, home: g.home, spread: g.spread, implTotal: implTotal != null ? Number(implTotal.toFixed(1)) : null, kickoff: g.kickoff,
        tdShare: Number(tdShare.toFixed(3)), touchesPg: Number(((bp.carries + bp.targets) / bp.games).toFixed(1)), tdsLastSeason: bp.tds, gamesLastSeason: bp.games,
        oppTdAllowedPg: oppTd != null ? Number(oppTd.toFixed(2)) : null, oppTdRank: ranks[g.opp]?.[bp.pos]?.td ?? null,
        oppYdsAllowedPg: oppYds != null ? Math.round(oppYds) : null, oppYdsRank: ranks[g.opp]?.[bp.pos]?.yds ?? null,
        matchup: Number(matchup.toFixed(2)), teamExpTd: Number(teamExpTd.toFixed(2)), share: Number(share.toFixed(3)),
        expTd: Number(expTd.toFixed(3)), tdPct: Number((1 - Math.exp(-expTd)).toFixed(3)),
        injury: injSt === "QUESTIONABLE" ? "Questionable" : injSt === "DOUBTFUL" ? "Doubtful" : null,
        headshot: `https://sleepercdn.com/content/nfl/players/${sp.sleeper_id}.jpg`, sleeperId: sp.sleeper_id,
      });
    }
    cards.sort((a, b) => b.tdPct - a.tdPct);

    res.setHeader("Cache-Control", "s-maxage=1800, stale-while-revalidate=3600");
    const out = {
      ready: cards.length > 0, season: curSeason, baseSeason, baseSource, week: sb.week, version: "v1",
      updatedAt: new Date().toISOString(), currentWeeksBlended: curWeeks, currentWeight: wCur,
      hasMatchupData: Object.keys(A).length > 0,
      reason: cards.length ? null : (Object.keys(B.players).length ? "No upcoming games matched this week's schedule." : "Neither nflverse nor Sleeper returned last season's player stats."),
      cards: cards.slice(0, 25),
    };
    if (debug) out.debug = {
      baseSource, basePlayers: Object.keys(B.players).length, baseError: B.error || null,
      nflverseBase: { url: nvBase.url, rows: nvBase.rows.length, attempts: nvBase.attempts },
      nflverseCur: { url: nvCur.url, rows: nvCur.rows.length, attempts: nvCur.attempts },
      games: (sb.games || []).length, noTeam, noGame, excluded,
    };
    return res.status(200).json(out);
  } catch (e) {
    return res.status(502).json({ ready: false, cards: [], reason: String(e.message || e) });
  }
}
