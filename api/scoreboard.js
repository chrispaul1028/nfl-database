// /api/scoreboard — today's MLB slate from the MLB Stats API: live scores,
// inning / outs / count / runners, probable pitchers, records, venue.
// The MLB twin of the NFL app's /api/scoreboard.
//
//   /api/scoreboard                  today (Eastern time)
//   /api/scoreboard?date=2026-09-18  a specific day
//   /api/scoreboard?raw=1            MLB's untouched schedule JSON (same shape
//                                    the app reads today — used for the Step 2
//                                    swap so screens stay identical)
//
// Cached 20s while any game is live, 5 min otherwise.

const API = "https://statsapi.mlb.com/api/v1";

// MLB team id -> the abbreviations the app already uses (ARI not AZ, CWS, ATH…)
const TEAM_ABBR = {
  108: "LAA", 109: "ARI", 110: "BAL", 111: "BOS", 112: "CHC", 113: "CIN", 114: "CLE", 115: "COL",
  116: "DET", 117: "HOU", 118: "KC", 119: "LAD", 120: "WSH", 121: "NYM", 133: "ATH", 134: "PIT",
  135: "SD", 136: "SEA", 137: "SF", 138: "STL", 139: "TB", 140: "TEX", 141: "TOR", 142: "MIN",
  143: "PHI", 144: "ATL", 145: "CWS", 146: "MIA", 147: "NYY", 158: "MIL",
};

async function getJson(url) {
  const r = await fetch(url, { headers: { accept: "application/json" } });
  if (!r.ok) throw new Error(`HTTP ${r.status} from ${url}`);
  return r.json();
}

const todayET = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
const STATE = { Preview: "pre", Live: "in", Final: "post" };

function side(g, ha) {
  const s = (g.teams || {})[ha] || {};
  const t = s.team || {};
  const line = ((g.linescore || {}).teams || {})[ha] || {};
  const pp = s.probablePitcher || null;
  return {
    id: t.id ?? null,
    abbr: TEAM_ABBR[t.id] || String(t.abbreviation || "").toUpperCase(),
    name: t.name || "",
    short: t.teamName || t.clubName || t.name || "",
    logo: t.id ? `https://www.mlbstatic.com/team-logos/${t.id}.svg` : null,
    score: s.score ?? line.runs ?? null,
    hits: line.hits ?? null,
    errors: line.errors ?? null,
    record: s.leagueRecord ? `${s.leagueRecord.wins}-${s.leagueRecord.losses}` : null,
    winner: !!s.isWinner,
    probable: pp ? { id: pp.id, name: pp.fullName || "" } : null,
  };
}

const runner = (p) => (p ? { id: p.id, name: p.fullName || "" } : null);

export default async function handler(req, res) {
  try {
    const q = req.query || {};
    const date = /^\d{4}-\d{2}-\d{2}$/.test(String(q.date || "")) ? String(q.date) : todayET();
    const d = await getJson(`${API}/schedule?sportId=1&date=${date}&hydrate=team,linescore,probablePitcher,venue`);

    const rawGames = (d.dates || []).flatMap((x) => x.games || []);
    const anyLive = rawGames.some((g) => (g.status || {}).abstractGameState === "Live");
    res.setHeader("Cache-Control", anyLive ? "s-maxage=20, stale-while-revalidate=40" : "s-maxage=300, stale-while-revalidate=600");

    if (q.raw) return res.status(200).json(d);

    const games = rawGames.map((g) => {
      const st = g.status || {};
      const ls = g.linescore || {};
      const off = ls.offense || {};
      const state = STATE[st.abstractGameState] || "pre";
      const det = st.detailedState || "";
      return {
        id: g.gamePk,
        date: g.gameDate,                         // ISO first pitch
        state,                                    // pre | in | post
        detail: det,                              // "Scheduled" / "In Progress" / "Final" / "Postponed"
        completed: state === "post",
        postponed: /postponed|cancel|suspended/i.test(det),
        delayed: /delay/i.test(det),
        gameNumber: g.gameNumber ?? 1,            // 2 = second game of a doubleheader
        doubleHeader: g.doubleHeader && g.doubleHeader !== "N",
        inning: ls.currentInning ?? null,
        inningOrdinal: ls.currentInningOrdinal || null,   // "7th"
        inningHalf: ls.inningHalf || null,                // "Top" | "Bottom"
        scheduledInnings: ls.scheduledInnings ?? 9,
        balls: ls.balls ?? null,
        strikes: ls.strikes ?? null,
        outs: ls.outs ?? null,
        runners: { first: runner(off.first), second: runner(off.second), third: runner(off.third) },
        batter: runner(off.batter),
        pitcher: runner((ls.defense || {}).pitcher),
        home: side(g, "home"),
        away: side(g, "away"),
        venue: g.venue ? { id: g.venue.id, name: g.venue.name } : null,
      };
    }).sort((a, b) => new Date(a.date) - new Date(b.date) || a.gameNumber - b.gameNumber);

    return res.status(200).json({ date, count: games.length, live: anyLive, games, updatedAt: new Date().toISOString() });
  } catch (e) {
    return res.status(502).json({ error: String(e.message || e) });
  }
}
