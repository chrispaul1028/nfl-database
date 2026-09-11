// /api/week-stats?season=2026&week=3 — one NFL week, from ESPN box scores.
//
// For every completed game that week: each player's line (targets, catches,
// carries, yards, TDs, passing, tackles, sacks, INTs) plus the opponent, and
// each team's offense produced / defense allowed (pass & rush yds and TDs).
// A finished week never changes, so it's cached for 30 days at the edge.
//
// Debug: &debug=1 shows the stat categories/keys ESPN returned for one game.

const CANON = { LA: "LAR", WSH: "WAS", JAC: "JAX", HST: "HOU", BLT: "BAL", CLV: "CLE", ARZ: "ARI", SD: "LAC", OAK: "LV", STL: "LAR" };
const canon = (t) => { const u = String(t || "").toUpperCase(); return CANON[u] || u; };
const num = (v) => { if (v == null) return 0; const s = String(v).split("/")[0]; const n = Number(s); return Number.isFinite(n) ? n : 0; };

async function getJson(url) {
  const r = await fetch(url, { headers: { accept: "application/json" } });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
  return r.json();
}

// Find a stat by key (preferred) or label within one ESPN box-score category
function statIdx(cat, ...names) {
  const keys = (cat.keys || []).map((k) => String(k).toLowerCase());
  const labels = (cat.labels || []).map((k) => String(k).toLowerCase());
  for (const n of names) {
    const ln = n.toLowerCase();
    let i = keys.indexOf(ln); if (i !== -1) return i;
    i = labels.indexOf(ln); if (i !== -1) return i;
  }
  return -1;
}

function blankTeam() {
  return { games: 0, pf: 0, pa: 0,
    off: { passYds: 0, passTd: 0, rushYds: 0, rushTd: 0 },
    def: { passYds: 0, passTd: 0, rushYds: 0, rushTd: 0 },
    allowed: { RB: { td: 0, yds: 0 }, WR: { td: 0, yds: 0 }, TE: { td: 0, yds: 0 } } };
}

export default async function handler(req, res) {
  const season = Number(req.query.season) || new Date().getFullYear();
  const week = Number(req.query.week) || 1;
  const debug = !!req.query.debug;
  try {
    const sb = await getJson(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${season}&seasontype=2&week=${week}`);
    const events = (sb.events || []).filter((e) => (e.competitions?.[0]?.status?.type?.state || e.status?.type?.state) === "post");

    const players = {}, teams = {};
    let sampleCats = null;

    await Promise.all(events.map(async (ev) => {
      let sum;
      try { sum = await getJson(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${ev.id}`); }
      catch { return; }
      const comp = ev.competitions?.[0] || {};
      const comps = comp.competitors || [];
      const abbrOf = {}; const oppOf = {}; const scoreOf = {};
      for (const c of comps) { abbrOf[c.team?.id] = canon(c.team?.abbreviation); scoreOf[c.team?.id] = num(c.score); }
      const ids = Object.keys(abbrOf);
      if (ids.length === 2) { oppOf[ids[0]] = abbrOf[ids[1]]; oppOf[ids[1]] = abbrOf[ids[0]]; }
      for (const id of ids) {
        const t = (teams[abbrOf[id]] ??= blankTeam());
        t.games++; t.pf += scoreOf[id]; t.pa += scoreOf[ids.find((x) => x !== id)] || 0;
      }

      for (const side of sum.boxscore?.players || []) {
        const tid = side.team?.id, team = abbrOf[tid] || canon(side.team?.abbreviation), opp = oppOf[tid];
        if (!team || !opp) continue;
        const T = (teams[team] ??= blankTeam()), O = (teams[opp] ??= blankTeam());
        if (debug && !sampleCats) sampleCats = (side.statistics || []).map((c) => ({ name: c.name, keys: c.keys, labels: c.labels }));
        for (const cat of side.statistics || []) {
          const cname = String(cat.name || "").toLowerCase();
          for (const a of cat.athletes || []) {
            const ath = a.athlete || {}; const st = a.stats || [];
            const key = String(ath.id);
            const p = (players[key] ??= { id: key, name: ath.displayName || ath.shortName || "", pos: String(ath.position?.abbreviation || "").toUpperCase(), team, games: {} });
            const g = (p.games[ev.id] ??= { week, opp, team, date: ev.date });
            const v = (...n) => { const i = statIdx(cat, ...n); return i === -1 ? 0 : num(st[i]); };
            if (cname === "passing") {
              const ca = String(st[statIdx(cat, "completions/passingAttempts", "c/att")] || "").split("/");
              g.cmp = num(ca[0]); g.att = num(ca[1]); g.passYds = v("passingYards", "yds"); g.passTd = v("passingTouchdowns", "td"); g.int = v("interceptions", "int");
              T.off.passYds += g.passYds; T.off.passTd += g.passTd; O.def.passYds += g.passYds; O.def.passTd += g.passTd;
            } else if (cname === "rushing") {
              g.car = v("rushingAttempts", "car"); g.rushYds = v("rushingYards", "yds"); g.rushTd = v("rushingTouchdowns", "td");
              T.off.rushYds += g.rushYds; T.off.rushTd += g.rushTd; O.def.rushYds += g.rushYds; O.def.rushTd += g.rushTd;
              if (O.allowed[p.pos]) { O.allowed[p.pos].td += g.rushTd; O.allowed[p.pos].yds += g.rushYds; }
            } else if (cname === "receiving") {
              g.rec = v("receptions", "rec"); g.tgt = v("receivingTargets", "tgts"); g.recYds = v("receivingYards", "yds"); g.recTd = v("receivingTouchdowns", "td");
              if (O.allowed[p.pos]) { O.allowed[p.pos].td += g.recTd; O.allowed[p.pos].yds += g.recYds; }
            } else if (cname === "defensive") {
              g.tkl = v("totalTackles", "tot"); g.solo = v("soloTackles", "solo"); g.sacks = v("sacks"); g.tfl = v("tacklesForLoss", "tfl"); g.pd = v("passesDefended", "pd"); g.defTd = v("defensiveTouchdowns", "td");
            } else if (cname === "interceptions") {
              g.defInt = v("interceptions", "int");
            }
          }
        }
      }
    }));

    // Flatten games to arrays
    for (const p of Object.values(players)) p.games = Object.values(p.games);

    res.setHeader("Cache-Control", events.length === (sb.events || []).length && events.length > 0
      ? "s-maxage=2592000, stale-while-revalidate=86400" // fully final week: cache a month
      : "s-maxage=900, stale-while-revalidate=1800");     // in-progress week: 15 min
    return res.status(200).json({ season, week, gamesFinal: events.length, gamesScheduled: (sb.events || []).length, players, teams, ...(debug ? { sampleCats } : {}) });
  } catch (e) {
    return res.status(502).json({ season, week, error: String(e.message || e), players: {}, teams: {} });
  }
}
