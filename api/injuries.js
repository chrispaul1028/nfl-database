// /api/injuries — ESPN's league-wide injury report: every team's injured
// players with type / location / side / detail, the team's status, and the
// estimated return date when one has been published. Keyed by ESPN athlete id.
import playerInjury from "../lib/player-injury.js";

export default async function handler(req, res) {
  // /api/injuries?espn=<id> — the deep, single-player record (was its own
  // endpoint; folded in here to stay under Vercel's 12-function Hobby cap).
  if (req.query?.espn) return playerInjury(req, res);

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
    // /api/injuries?debug=1 shows how many records actually carry a return date,
    // and ?find=<name> dumps one player's raw ESPN record.
    if (req.query?.debug || req.query?.find) {
      const all = Object.entries(out);
      const find = String(req.query.find || "").toLowerCase();
      return res.status(200).json({
        total: all.length,
        withReturnDate: all.filter(([, v]) => v.returnDate).length,
        sampleWithDate: all.filter(([, v]) => v.returnDate).slice(0, 10).map(([id, v]) => ({ id, name: v.name, status: v.status, returnDate: v.returnDate })),
        match: find ? all.filter(([, v]) => String(v.name).toLowerCase().includes(find)).map(([id, v]) => ({ id, ...v })) : undefined,
      });
    }
    res.setHeader("Cache-Control", "s-maxage=600, stale-while-revalidate=1200");
    return res.status(200).json({ updatedAt: new Date().toISOString(), count: Object.keys(out).length, injuries: out });
  } catch (e) {
    return res.status(200).json({ injuries: {}, error: String(e.message || e) });
  }
}
