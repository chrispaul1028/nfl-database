// /api/game?event=<espnEventId> — live/final game detail from ESPN's summary:
// score + status, current situation & last play, scoring plays, leaders,
// team stat comparison, win probability. Cached 30s so live views tick.
async function getJson(url) { const r = await fetch(url, { headers: { accept: "application/json" } }); if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }
const num = (v) => { const n = Number(String(v ?? "").split("/")[0]); return Number.isFinite(n) ? n : null; };
export default async function handler(req, res) {
  const id = String(req.query.event || "").replace(/\D/g, "");
  if (!id) return res.status(400).json({ error: "event id required" });
  try {
    const d = await getJson(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${id}`);
    const comp = d.header?.competitions?.[0] || {};
    const side = (ha) => {
      const c = (comp.competitors || []).find((x) => x.homeAway === ha) || {};
      return { id: c.id, abbr: String(c.team?.abbreviation || "").toUpperCase(), name: c.team?.displayName || "", logo: c.team?.logos?.[0]?.href || c.team?.logo || null,
        color: c.team?.color ? "#" + c.team.color : null, score: num(c.score), record: (c.record || [])[0]?.summary || null, winner: !!c.winner,
        linescores: (c.linescores || []).map((l) => num(l.displayValue ?? l.value)) };
    };
    const st = comp.status || d.header?.status || {}; const type = st.type || {};
    const scoring = (d.scoringPlays || []).map((p) => ({ text: p.text, type: p.type?.text || null, team: String(p.team?.abbreviation || "").toUpperCase(), q: p.period?.number, clock: p.clock?.displayValue, away: p.awayScore, home: p.homeScore }));
    const cur = d.drives?.current || null;
    const lastPlay = cur && cur.plays && cur.plays.length ? cur.plays[cur.plays.length - 1] : null;
    const leaders = (d.leaders || []).map((t) => ({ team: String(t.team?.abbreviation || "").toUpperCase(),
      items: (t.leaders || []).map((l) => ({ cat: l.name, label: l.displayName, name: l.leaders?.[0]?.athlete?.displayName, headshot: l.leaders?.[0]?.athlete?.headshot?.href, value: l.leaders?.[0]?.displayValue })).filter((x) => x.name) }));
    const teamStats = (d.boxscore?.teams || []).map((t) => ({ team: String(t.team?.abbreviation || "").toUpperCase(),
      stats: Object.fromEntries((t.statistics || []).map((s) => [s.name, s.displayValue])) }));
    const wp = d.winprobability && d.winprobability.length ? d.winprobability[d.winprobability.length - 1] : null;
    const sit = d.situation || (comp.situation) || {};
    res.setHeader("Cache-Control", type.state === "in" ? "s-maxage=30, stale-while-revalidate=60" : "s-maxage=600, stale-while-revalidate=1800");
    return res.status(200).json({
      id, state: type.state || "pre", detail: type.shortDetail || type.detail || "", completed: !!type.completed, period: st.period ?? null, clock: st.displayClock ?? null,
      home: side("home"), away: side("away"), venue: d.gameInfo?.venue?.fullName || null, weather: d.gameInfo?.weather ? `${d.gameInfo.weather.temperature ?? ""}° ${d.gameInfo.weather.displayValue ?? ""}`.trim() : null,
      situation: { possession: sit.possession ?? null, downDistance: sit.shortDownDistanceText || sit.downDistanceText || null, yardLine: sit.possessionText || null, redZone: !!sit.isRedZone,
        lastPlay: (sit.lastPlay && sit.lastPlay.text) || (lastPlay && lastPlay.text) || null, drive: cur ? cur.description : null },
      scoring, leaders, teamStats, homeWinPct: wp && wp.homeWinPercentage != null ? Math.round(wp.homeWinPercentage * 100) : null,
      updatedAt: new Date().toISOString(),
    });
  } catch (e) {
    return res.status(502).json({ error: String(e.message || e) });
  }
}
