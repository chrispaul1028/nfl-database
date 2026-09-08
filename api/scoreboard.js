// /api/scoreboard — this week's NFL games with live scores, kickoff times,
// records, and betting lines, from ESPN's public scoreboard. Cached 60s so
// live games tick along without hammering ESPN.
//
// Optional: /api/scoreboard?week=3 for a specific week of the current season.

async function getJson(url) {
  const r = await fetch(url, { headers: { accept: "application/json" } });
  if (!r.ok) throw new Error(`HTTP ${r.status} from ${url}`);
  return r.json();
}

function side(comp, homeAway) {
  const c = (comp.competitors || []).find((x) => x.homeAway === homeAway) || {};
  const t = c.team || {};
  const rec = (c.records || []).find((r) => r.type === "total" || r.name === "overall") || (c.records || [])[0];
  return {
    id: t.id,
    abbr: String(t.abbreviation || "").toUpperCase(),
    name: t.displayName || t.name || "",
    short: t.shortDisplayName || t.name || "",
    logo: t.logo || null,
    color: t.color ? "#" + t.color : null,
    score: c.score != null && c.score !== "" ? Number(c.score) : null,
    record: rec ? rec.summary : null,
    winner: !!c.winner,
  };
}

export default async function handler(req, res) {
  try {
    const week = req.query && req.query.week ? `&week=${encodeURIComponent(req.query.week)}` : "";
    const d = await getJson(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?seasontype=2${week}`);

    const games = (d.events || []).map((ev) => {
      const comp = (ev.competitions || [])[0] || {};
      const st = comp.status || ev.status || {};
      const type = st.type || {};
      const odds = (comp.odds || [])[0] || null;
      const sit = comp.situation || {};
      return {
        id: ev.id,
        date: ev.date,                              // ISO kickoff
        state: type.state || "pre",                 // pre | in | post
        detail: type.shortDetail || type.detail || "", // "Sun 1:00 PM" / "Final" / "Q3 7:42"
        completed: !!type.completed,
        period: st.period ?? null,
        clock: st.displayClock ?? null,
        home: side(comp, "home"),
        away: side(comp, "away"),
        venue: comp.venue?.fullName || null,
        broadcast: ((comp.broadcasts || [])[0]?.names || [])[0] || null,
        odds: odds ? { details: odds.details || null, overUnder: odds.overUnder ?? null } : null,
        possession: sit.possession || null,         // team id with the ball (live)
        downDistance: sit.shortDownDistanceText || null,
        redZone: !!sit.isRedZone,
      };
    }).sort((a, b) => new Date(a.date) - new Date(b.date));

    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=120");
    return res.status(200).json({
      week: d.week?.number ?? null,
      season: d.season?.year ?? null,
      games,
      updatedAt: new Date().toISOString(),
    });
  } catch (e) {
    return res.status(502).json({ error: String(e.message || e) });
  }
}
