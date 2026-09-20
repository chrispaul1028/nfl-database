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
      "https://site.web.api.espn.com/apis/site/v2/sports/football/nfl/injuries?region=us&lang=en",
      "https://site.api.espn.com/apis/site/v2/sports/football/nfl/injuries?region=us&lang=en&contentorigin=espn",
    ];
    // ESPN's report nests as injuries[team].injuries[entry]. The team level has
    // an id and displayName but no abbreviation, and the athlete carries NO id
    // field — it's only in his player-card link (".../id/4428633/name"). Both
    // are why a naive read finds nothing.
    const TEAM_ID = { 1: "ATL", 2: "BUF", 3: "CHI", 4: "CIN", 5: "CLE", 6: "DAL", 7: "DEN", 8: "DET", 9: "GB", 10: "TEN", 11: "IND", 12: "KC", 13: "LV", 14: "LAR", 15: "MIA", 16: "MIN", 17: "NE", 18: "NO", 19: "NYG", 20: "NYJ", 21: "PHI", 22: "ARI", 23: "PIT", 24: "LAC", 25: "SF", 26: "SEA", 27: "TB", 28: "WSH", 29: "CAR", 30: "JAX", 33: "BAL", 34: "HOU" };
    const athleteId = (a) => {
      if (!a) return null;
      if (a.id) return String(a.id);
      for (const l of a.links || []) { const m = String(l.href || "").match(/\/id\/(\d+)/); if (m) return m[1]; }
      return null;
    };
    let out = {}, used = null, topKeys = null, tried = [], raw = null;
    for (const url of SOURCES) {
      try {
        const r = await fetch(url, { headers: { accept: "application/json", "user-agent": "Mozilla/5.0" } });
        tried.push(url + " → " + r.status);
        if (!r.ok) continue;
        const text = await r.text();
        tried[tried.length - 1] += ` (${text.length} bytes)`;
        if (!raw) raw = text.slice(0, 900);          // for ?debug=1 — shows the actual shape
        let d; try { d = JSON.parse(text); } catch { tried[tried.length - 1] += " not JSON"; continue; }
        if (!topKeys) topKeys = Object.keys(d || {});
        // ESPN has shuffled this payload's nesting before. Rather than trust one
        // shape, walk the whole document and collect anything that looks like
        // an injury entry: an object with an athlete and a status or details.
        const found = {};
        const walk = (node, teamAbbr) => {
          if (!node || typeof node !== "object") return;
          if (Array.isArray(node)) { for (const x of node) walk(x, teamAbbr); return; }
          const abbr = node.team && node.team.abbreviation ? String(node.team.abbreviation).toUpperCase()
            : (Array.isArray(node.injuries) && node.id && TEAM_ID[node.id]) ? TEAM_ID[node.id] : teamAbbr;
          // An injury entry: something with a status (or details) attached to a
          // person, whether the person sits under "athlete", "player", or inline.
          const person = node.athlete || node.player || null;
          const hasStatus = typeof node.status === "string" || node.details || node.returnDate;
          if (hasStatus && (person || node.displayName || node.athleteId)) {
            const a = person || { id: node.athleteId || node.id, displayName: node.displayName, team: node.team };
            const det = node.details || {};
            const aid = athleteId(a);
            if (aid) found[aid] = {
              name: a.displayName || a.fullName || null, team: (a.team && a.team.abbreviation ? String(a.team.abbreviation).toUpperCase() : abbr) || null,
              status: node.status || null, date: node.date || null,
              type: det.type || (typeof node.type === "object" ? node.type?.description : node.type) || null,
              location: det.location || null, side: det.side || null, detail: det.detail || null,
              returnDate: det.returnDate || node.returnDate || null, comment: node.longComment || node.shortComment || null,
            };
          }
          for (const [k, v] of Object.entries(node)) if (v && typeof v === "object" && k !== "links" && k !== "headshot" && k !== "logos") walk(v, abbr);
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
        source: used, tried, topKeys, raw,
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
