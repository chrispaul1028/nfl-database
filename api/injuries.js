// /api/injuries — ESPN's league-wide injury report: every team's injured
// players with type / location / side / detail, the team's status, and the
// estimated return date when one has been published. Keyed by ESPN athlete id.
export default async function handler(req, res) {
  // /api/injuries?espn=<id> — the deep, single-player record (was its own
  // endpoint; folded in here to stay under Vercel's 12-function Hobby cap).
  if (req.query?.espn) return playerInjuryHandler(req, res);

  try {
    // Two hosts serve this report; try both, keep whichever returns more.
    const SOURCES = [
      "https://site.api.espn.com/apis/site/v2/sports/football/nfl/injuries",
      "https://site.web.api.espn.com/apis/site/v2/sports/football/nfl/injuries",
    ];
    let out = {}, used = null, topKeys = null, tried = [];
    for (const url of SOURCES) {
      try {
        const r = await fetch(url, { headers: { accept: "application/json", "user-agent": "Mozilla/5.0" } });
        tried.push(url + " → " + r.status);
        if (!r.ok) continue;
        const d = await r.json();
        // ESPN has shuffled this payload's nesting before. Rather than trust one
        // shape, walk the whole document and collect anything that looks like
        // an injury entry: an object with an athlete and a status or details.
        const found = {};
        const walk = (node, teamAbbr) => {
          if (!node || typeof node !== "object") return;
          if (Array.isArray(node)) { for (const x of node) walk(x, teamAbbr); return; }
          const abbr = node.team && node.team.abbreviation ? String(node.team.abbreviation).toUpperCase() : teamAbbr;
          if (node.athlete && (node.status || node.details || node.type)) {
            const a = node.athlete || {}; const det = node.details || {};
            if (a.id) found[String(a.id)] = {
              name: a.displayName || a.fullName || null, team: (a.team && a.team.abbreviation ? String(a.team.abbreviation).toUpperCase() : abbr) || null,
              status: node.status || null, date: node.date || null,
              type: det.type || (typeof node.type === "object" ? node.type?.description : node.type) || null,
              location: det.location || null, side: det.side || null, detail: det.detail || null,
              returnDate: det.returnDate || null, comment: node.longComment || node.shortComment || null,
            };
          }
          for (const v of Object.values(node)) if (v && typeof v === "object") walk(v, abbr);
        };
        walk(d, null);
        if (Object.keys(found).length > Object.keys(out).length) { out = found; used = url; topKeys = Object.keys(d); }
        if (Object.keys(out).length >= 40) break;
      } catch (e) { tried.push(url + " → " + String(e.message || e)); }
    }
    // /api/injuries?debug=1 shows how many records actually carry a return date,
    // and ?find=<name> dumps one player's raw ESPN record.
    if (req.query?.debug || req.query?.find) {
      const all = Object.entries(out);
      const find = String(req.query.find || "").toLowerCase();
      return res.status(200).json({
        source: used, tried, topKeys,
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

// /api/player-injury?espn=<athleteId> — ESPN's current injury entry for a
// player: type/location/detail and, when the team has one, an estimated
// return date. Sleeper doesn't publish return dates; ESPN often does.
async function playerInjuryHandler(req, res) {
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
    let cur = items.filter(Boolean).sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))[0];
    if (!cur || !cur.details?.returnDate) {
      // Second source: the athlete overview often carries the current injury with a return date
      try {
        const o = await (await fetch(`https://site.web.api.espn.com/apis/common/v3/sports/football/nfl/athletes/${id}`, { headers: { accept: "application/json" } })).json();
        const oi = (o.injuries || [])[0];
        if (oi && (oi.details?.returnDate || !cur)) cur = { ...(cur || {}), ...oi, details: { ...(cur?.details || {}), ...(oi.details || {}) } };
      } catch {}
    }
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
