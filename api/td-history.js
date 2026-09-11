// /api/td-history?season=2026 — every logged board week, scored against what
// actually happened (from /api/week-stats). The calibration loop.
const TABLE = "TD Log";
async function getJson(url, headers = {}) { const r = await fetch(url, { headers: { accept: "application/json", ...headers } }); if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`); return r.json(); }
export default async function handler(req, res) {
  try {
    const token = (process.env.AIRTABLE_TOKEN || "").trim(), base = (process.env.AIRTABLE_BASE_ID || "").trim();
    const now = new Date();
    const season = Number(req.query.season) || (now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1);
    const origin = `${req.headers["x-forwarded-proto"] || "https"}://${req.headers.host}`;
    const rows = []; let offset;
    do {
      const u = `https://api.airtable.com/v0/${base}/${encodeURIComponent(TABLE)}?pageSize=100&filterByFormula=${encodeURIComponent(`{Season}=${season}`)}${offset ? "&offset=" + offset : ""}`;
      const d = await getJson(u, { Authorization: `Bearer ${token}` });
      rows.push(...(d.records || []).map((r) => r.fields)); offset = d.offset;
    } while (offset);
    const weeks = [...new Set(rows.map((r) => r.Week))].sort((a, b) => a - b);
    const out = [];
    for (const w of weeks) {
      const ws = await getJson(`${origin}/api/week-stats?season=${season}&week=${w}`).catch(() => null);
      const picks = rows.filter((r) => r.Week === w).sort((a, b) => (a.Rank || 0) - (b.Rank || 0)).map((r) => {
        const P = ws && ws.players ? ws.players[String(r["ESPN ID"])] : null;
        const g = P && P.games ? P.games[0] : null;
        const tds = g ? (g.rushTd || 0) + (g.recTd || 0) : null;
        return { rank: r.Rank, player: r.Player, team: r.Team, pos: r.Pos, opp: r.Opp, tdPct: r["TD Pct"], xTD: r.xTD, tds, hit: tds == null ? null : tds > 0, played: !!g };
      });
      const scored = picks.filter((p) => p.hit != null);
      out.push({ week: w, final: !!(ws && ws.gamesScheduled && ws.gamesFinal === ws.gamesScheduled), picks,
        n: scored.length, hits: scored.filter((p) => p.hit).length, expected: Number(scored.reduce((a, p) => a + (p.tdPct || 0), 0).toFixed(1)),
        buckets: [[0, 0.3], [0.3, 0.45], [0.45, 0.6], [0.6, 1.01]].map(([lo, hi]) => {
          const b = scored.filter((p) => p.tdPct >= lo && p.tdPct < hi);
          return { range: `${Math.round(lo * 100)}–${Math.min(100, Math.round(hi * 100))}%`, n: b.length, hits: b.filter((p) => p.hit).length };
        }) });
    }
    res.setHeader("Cache-Control", "s-maxage=600, stale-while-revalidate=1800");
    return res.status(200).json({ season, weeks: out });
  } catch (e) {
    return res.status(502).json({ season: null, weeks: [], error: String(e.message || e) });
  }
}
