// /api/player-injury?espn=<athleteId> — ESPN's current injury entry for a
// player: type/location/detail and, when the team has one, an estimated
// return date. Sleeper doesn't publish return dates; ESPN often does.
export default async function handler(req, res) {
  const id = String(req.query.espn || "").replace(/\D/g, "");
  if (!id) return res.status(400).json({ error: "espn id required" });
  try {
    const r = await fetch(`https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/athletes/${id}/injuries?limit=5`, { headers: { accept: "application/json" } });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const d = await r.json();
    const items = await Promise.all((d.items || []).slice(0, 3).map(async (it) => {
      if (it.$ref && !it.status) { try { const rr = await fetch(it.$ref); return rr.ok ? await rr.json() : null; } catch { return null; } }
      return it;
    }));
    const cur = items.filter(Boolean).sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))[0];
    res.setHeader("Cache-Control", "s-maxage=1800, stale-while-revalidate=3600");
    if (!cur) return res.status(200).json({ injury: null });
    const det = cur.details || {};
    return res.status(200).json({ injury: {
      status: cur.status || null, date: cur.date || null,
      type: det.type || null, location: det.location || null, detail: det.detail || null, side: det.side || null,
      returnDate: det.returnDate || null, comment: cur.shortComment || cur.longComment || null,
    } });
  } catch (e) {
    return res.status(200).json({ injury: null, error: String(e.message || e) });
  }
}
