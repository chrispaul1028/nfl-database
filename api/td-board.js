// /api/td-board — Weekly anytime-touchdown board (v2: ESPN box scores).
//
//   /api/season-stats (last season)  -> player TD share & touch share, opponent TDs/yds allowed by position
//   /api/season-stats (this season)  -> blends in 12%/week once games are played
//   /api/scoreboard                  -> this week's games, spreads, O/U -> implied totals
//   Sleeper players                  -> current team, depth chart, injuries, headshots (joined via espn_id)
//
// xTD = (implied total × 0.105) × (65% TD share + 35% opportunity share) × matchup(0.8–1.2)
// TD% = 1 − e^(−xTD)

const CANON = { LA: "LAR", WSH: "WAS", JAC: "JAX", HST: "HOU", BLT: "BAL", CLV: "CLE", ARZ: "ARI", SD: "LAC", OAK: "LV", STL: "LAR" };
const canon = (t) => { const u = String(t || "").toUpperCase(); return CANON[u] || u; };
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
async function getJson(url) { const r = await fetch(url, { headers: { accept: "application/json" } }); if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`); return r.json(); }

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
    const base = `${req.headers["x-forwarded-proto"] || "https"}://${req.headers.host}`;

    const [sb, B, C, sleeper] = await Promise.all([
      getJson(`${base}/api/scoreboard`),
      getJson(`${base}/api/season-stats?season=${baseSeason}`),
      getJson(`${base}/api/season-stats?season=${curSeason}`).catch(() => ({ players: {}, teams: {}, allowed: {}, weeksWithGames: 0 })),
      getJson("https://api.sleeper.app/v1/players/nfl"),
    ]);
    // Sleeper by ESPN athlete id (Sleeper carries espn_id for nearly everyone)
    const byEspn = {}, byName = {};
    const nrm = (x) => String(x || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[.'’\-]/g, "").replace(/\s+(jr|sr|ii|iii|iv|v)$/i, "").replace(/\s+/g, " ").trim().toLowerCase();
    for (const [sid, sp] of Object.entries(sleeper || {})) {
      if (!sp) continue;
      const rec = { ...sp, sleeper_id: sid };
      if (sp.espn_id) byEspn[String(sp.espn_id)] = rec;
      const k = nrm(sp.full_name || `${sp.first_name} ${sp.last_name}`);
      if (k) (byName[k] ??= []).push(rec);
    }
    // ESPN id first; fall back to name (+ position when several share it)
    const findSleeper = (id, name, pos) => {
      if (byEspn[id]) return byEspn[id];
      const c = byName[nrm(name)] || [];
      if (c.length === 1) return c[0];
      return c.find((x) => String(x.position || "").toUpperCase() === pos && x.team) || null;
    };

    const wCur = Math.min(0.65, (C.weeksWithGames || 0) * 0.12);
    const posAvg = { RB: { td: 0.14, opp: 0.12 }, WR: { td: 0.12, opp: 0.12 }, TE: { td: 0.09, opp: 0.09 } };

    const ctx = {};
    for (const g of sb.games || []) {
      const it = impliedTotals(g), done = g.state === "post";
      const h = canon(g.home.abbr), a = canon(g.away.abbr);
      ctx[h] = { opp: a, home: true, implTotal: it.home ?? null, spread: it.favorite == null ? null : (it.favorite === h ? -it.spread : it.spread), done, kickoff: g.date };
      ctx[a] = { opp: h, home: false, implTotal: it.away ?? null, spread: it.favorite == null ? null : (it.favorite === a ? -it.spread : it.spread), done, kickoff: g.date };
    }
    // League-average TDs allowed per game by position (matchup baseline)
    const league = {};
    for (const pos of ["RB", "WR", "TE"]) {
      const v = Object.values(B.allowed || {}).map((a) => a[pos]?.tdPg).filter((x) => x != null);
      league[pos] = v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
    }
    // Team totals for share denominators (skill-position TDs & touches)
    const teamTot = {};
    for (const P of Object.values(B.players || {})) {
      if (!["RB", "WR", "TE"].includes(P.pos)) continue;
      const t = (teamTot[P.team] ??= { tds: 0, touches: 0 });
      t.tds += P.totals.td || 0; t.touches += (P.totals.car || 0) + (P.totals.tgt || 0);
    }
    const teamTotC = {};
    for (const P of Object.values(C.players || {})) {
      if (!["RB", "WR", "TE"].includes(P.pos)) continue;
      const t = (teamTotC[P.team] ??= { tds: 0, touches: 0 });
      t.tds += P.totals.td || 0; t.touches += (P.totals.car || 0) + (P.totals.tgt || 0);
    }

    const cards = []; let noSleeper = 0, noGame = 0, excluded = 0;
    for (const [id, P] of Object.entries(B.players || {})) {
      if (!["RB", "WR", "TE"].includes(P.pos)) continue;
      const sp = findSleeper(id, P.name, P.pos); if (!sp || !sp.team) { noSleeper++; continue; }
      const team = canon(sp.team), g = ctx[team];
      if (!g || g.done) { noGame++; continue; }
      const injSt = String(sp.injury_status || "").toUpperCase();
      if (["OUT", "IR", "PUP", "NA", "SUS", "COV", "DNR"].includes(injSt) || /injured reserve|pup|suspend/i.test(String(sp.status || ""))) { excluded++; continue; }
      const depth = num(sp.depth_chart_order), maxDepth = { RB: 2, WR: 3, TE: 1 }[P.pos];
      if (depth && depth > maxDepth) { excluded++; continue; }
      if ((P.totals.gp || 0) < 4) continue;

      const tt = teamTot[P.team] || { tds: 38, touches: 1000 };
      const reg = Math.min(1, P.totals.gp / 12);
      const tdShareB = Math.min(0.45, reg * (P.totals.td / Math.max(15, tt.tds)) + (1 - reg) * posAvg[P.pos].td);
      const oppShareB = Math.min(0.40, reg * (((P.totals.car || 0) + (P.totals.tgt || 0)) / Math.max(400, tt.touches)) + (1 - reg) * posAvg[P.pos].opp);
      const CP = C.players?.[id], ct = CP ? teamTotC[CP.team] : null;
      const blend = (b, c) => (c == null ? b : (1 - wCur) * b + wCur * c);
      const tdShare = blend(tdShareB, CP && ct && ct.tds ? CP.totals.td / ct.tds : null);
      const oppShare = blend(oppShareB, CP && ct && ct.touches ? ((CP.totals.car || 0) + (CP.totals.tgt || 0)) / ct.touches : null);
      const share = 0.65 * tdShare + 0.35 * oppShare;

      const teamExpTd = (g.implTotal != null ? g.implTotal : 22) * 0.105;
      const al = B.allowed?.[g.opp]?.[P.pos] || {};
      const matchup = al.tdPg != null && league[P.pos] ? Math.max(0.8, Math.min(1.2, al.tdPg / league[P.pos])) : 1;
      const expTd = teamExpTd * share * matchup;

      cards.push({
        name: P.name, team, pos: P.pos, role: (sp.depth_chart_position || P.pos) + (sp.depth_chart_order || ""),
        opp: g.opp, home: g.home, spread: g.spread, implTotal: g.implTotal != null ? Number(g.implTotal.toFixed(1)) : null, kickoff: g.kickoff,
        tdShare: Number(tdShare.toFixed(3)), touchesPg: P.totals.gp ? Number((((P.totals.car || 0) + (P.totals.tgt || 0)) / P.totals.gp).toFixed(1)) : null,
        tdsLastSeason: P.totals.td, gamesLastSeason: P.totals.gp,
        oppTdAllowedPg: al.tdPg ?? null, oppTdRank: al.tdRank ?? null, oppYdsAllowedPg: al.ydsPg ?? null, oppYdsRank: al.ydsRank ?? null,
        matchup: Number(matchup.toFixed(2)), teamExpTd: Number(teamExpTd.toFixed(2)), share: Number(share.toFixed(3)),
        expTd: Number(expTd.toFixed(3)), tdPct: Number((1 - Math.exp(-expTd)).toFixed(3)),
        injury: injSt === "QUESTIONABLE" ? "Questionable" : injSt === "DOUBTFUL" ? "Doubtful" : null,
        headshot: `https://sleepercdn.com/content/nfl/players/${sp.sleeper_id}.jpg`, sleeperId: sp.sleeper_id, espnId: id,
      });
    }
    cards.sort((a, b) => b.tdPct - a.tdPct);

    res.setHeader("Cache-Control", "s-maxage=1800, stale-while-revalidate=3600");
    const out = { ready: cards.length > 0, season: curSeason, baseSeason, week: sb.week, version: "v2", updatedAt: new Date().toISOString(),
      currentWeeksBlended: C.weeksWithGames || 0, currentWeight: wCur, hasMatchupData: Object.keys(B.allowed || {}).length > 0,
      reason: cards.length ? null : (Object.keys(B.players || {}).length
        ? `0 of ${Object.keys(B.players).length} players made the board — no Sleeper match: ${noSleeper}, no upcoming game: ${noGame}, injured/backup: ${excluded}, games this week: ${(sb.games || []).length}.`
        : `Last season's box scores (${baseSeason}) didn't load${B.error ? " — " + B.error : ""}.`),
      cards: cards.slice(0, 25) };
    if (debug) {
      out.debug = { basePlayers: Object.keys(B.players || {}).length, baseError: B.error || null, baseWeeks: B.weeksWithGames, curWeeks: C.weeksWithGames, games: (sb.games || []).length, noSleeper, noGame, excluded, leagueTdAllowed: league };
      if (req.query.find) {
        const q = String(req.query.find).toLowerCase();
        out.find = Object.values(B.players || {}).filter((P) => String(P.name).toLowerCase().includes(q)).map((P) => {
          const sp = findSleeper(P.id, P.name, P.pos);
          return { name: P.name, espnId: P.id, pos: P.pos, lastSeasonTeam: P.team, totals: P.totals, sleeperTeam: sp?.team ?? "no sleeper match", depth: sp?.depth_chart_order, injury: sp?.injury_status, game: sp?.team ? ctx[canon(sp.team)] : null };
        });
      }
    }
    return res.status(200).json(out);
  } catch (e) {
    return res.status(502).json({ ready: false, cards: [], reason: String(e.message || e) });
  }
}
