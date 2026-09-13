// /api/injuries — ESPN's league-wide injury report: every team's injured
// players with type / location / side / detail, the team's status, and the
// estimated return date when one has been published. Keyed by ESPN athlete id.
export default async function handler(req, res) {
  try {
    const r = await fetch("https://site.api.espn.com/apis/site/v2/sports/football/nfl/injuries", { headers: { accept: "application/json" } });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const d = await r.json();
    const out = {};
    for (const team of d.injuries || []) {
      const abbr = String(team.team?.abbreviation || "").toUpperCase();
      for (const it of team.injuries || []) {
        const a = it.athlete || {}; const det = it.details || {};
        out[String(a.id)] = {
          name: a.displayName, team: abbr, status: it.status || null, date: it.date || null,
          type: det.type || null, location: det.location || null, side: det.side || null, detail: det.detail || null,
          returnDate: det.returnDate || null, comment: it.shortComment || it.longComment || null,
        };
      }
    }
    res.setHeader("Cache-Control", "s-maxage=600, stale-while-revalidate=1200");
    return res.status(200).json({ updatedAt: new Date().toISOString(), count: Object.keys(out).length, injuries: out });
  } catch (e) {
    return res.status(200).json({ injuries: {}, error: String(e.message || e) });
  }
}
