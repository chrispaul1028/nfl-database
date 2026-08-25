// Vercel serverless function: pulls NFL records + team offense/defense stats
// from ESPN's public APIs, computes league ranks, and returns one compact
// payload the app merges into its teams list. No env vars needed.
//
// Season logic: Sept–Dec uses the current year; Jan–Aug falls back to last
// season (so the header can show "Record ('25)" until Week 1).
//
// Debug: /api/standings?debug=1 also returns every stat name ESPN exposed
// for the first team — used to map any stat whose name shifts between years.

const CANDIDATES = {
  passYpg: ["netPassingYardsPerGame", "passingYardsPerGame"],
  rushYpg: ["rushingYardsPerGame"],
  offTd: ["totalTouchdowns", "offensiveTouchdowns"],
  // Defense-allowed names are the least stable across ESPN seasons; if these
  // all miss, the fields come back null and ?debug=1 shows what to add here.
  passYpgAllowed: ["netPassingYardsAllowedPerGame", "passingYardsAllowedPerGame", "opponentNetPassingYardsPerGame", "oppPassingYardsPerGame", "netPassingYardsAllowed"],
  rushYpgAllowed: ["rushingYardsAllowedPerGame", "opponentRushingYardsPerGame", "oppRushingYardsPerGame", "rushingYardsAllowed"],
};

function seasonYear() {
  const now = new Date();
  return now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1; // month 8 = September
}

async function getJson(url) {
  const r = await fetch(url, { headers: { accept: "application/json" } });
  if (!r.ok) throw new Error(`HTTP ${r.status} from ${url}`);
  return r.json();
}

// Flatten every category/stat into name -> value (perGameValue preferred for *PerGame names)
function flattenStats(statJson) {
  const flat = {};
  const cats = statJson?.splits?.categories || [];
  for (const c of cats) {
    for (const s of c.stats || []) {
      if (s.name != null && s.value != null) flat[s.name] = s.value;
      if (s.name != null && s.perGameValue != null) flat[s.name + "PerGame"] = s.perGameValue;
    }
  }
  return flat;
}

const pickStat = (flat, names) => {
  for (const n of names) if (flat[n] != null && isFinite(flat[n])) return Number(flat[n]);
  return null;
};

function addRanks(teams, key, dir) {
  const ranked = teams.filter((t) => t[key] != null)
    .sort((a, b) => (dir === "asc" ? a[key] - b[key] : b[key] - a[key]));
  ranked.forEach((t, i) => { t[key + "Rank"] = i + 1; });
}

export default async function handler(req, res) {
  try {
    const yr = seasonYear();
    const isCurrent = yr === new Date().getFullYear();

    // 1. Records + PF/PA from standings
    const standings = await getJson(`https://site.api.espn.com/apis/v2/sports/football/nfl/standings?season=${yr}`);
    const entries = (standings.children || []).flatMap((c) => c?.standings?.entries || []);
    if (entries.length < 30) throw new Error(`Standings returned only ${entries.length} teams — season ${yr} shape changed`);

    const teams = entries.map((e) => {
      const statOf = (n) => {
        const s = (e.stats || []).find((x) => x.name === n || x.type === n);
        return s && s.value != null ? Number(s.value) : null;
      };
      return {
        espnId: e.team?.id,
        abbr: String(e.team?.abbreviation || "").toUpperCase(),
        name: e.team?.displayName || "",
        wins: statOf("wins"),
        losses: statOf("losses"),
        ties: statOf("ties"),
        pf: statOf("pointsFor"),
        pa: statOf("pointsAgainst"),
      };
    });

    // 2. Per-team offense/defense stats from the core API (parallel, ~32 calls, cached 1h)
    let debugStatNames = null;
    await Promise.all(teams.map(async (t, idx) => {
      try {
        const st = await getJson(`https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/seasons/${yr}/types/2/teams/${t.espnId}/statistics`);
        const flat = flattenStats(st);
        if (idx === 0 && req.query && req.query.debug) debugStatNames = Object.keys(flat).sort();
        for (const [key, names] of Object.entries(CANDIDATES)) t[key] = pickStat(flat, names);
      } catch {
        // one team failing shouldn't sink the payload; its stats stay null
      }
    }));

    // 3. League ranks (higher = better for offense, lower = better for allowed)
    addRanks(teams, "passYpg", "desc");
    addRanks(teams, "rushYpg", "desc");
    addRanks(teams, "offTd", "desc");
    addRanks(teams, "passYpgAllowed", "asc");
    addRanks(teams, "rushYpgAllowed", "asc");
    addRanks(teams, "pa", "asc");

    res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=7200");
    return res.status(200).json({ season: yr, isCurrent, teams, ...(debugStatNames ? { debugStatNames } : {}) });
  } catch (e) {
    return res.status(502).json({ error: String(e.message || e) });
  }
}
