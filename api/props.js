// /api/props — player prop lines from The Odds API.
//
//   /api/props            → this week's events (id, teams, kickoff)
//   /api/props?event=<id> → that game's player props, grouped by market
//
// Credits: the events list is free; each ?event= call costs 1 credit per market
// per region, which is why props are fetched per game on demand instead of for
// the whole slate up front. Set ODDS_API_KEY in Vercel → Settings → Environment
// Variables. Without it this returns { configured: false } and the app shows
// setup instructions instead of an error.
const BASE = "https://api.the-odds-api.com/v4/sports/americanfootball_nfl";
const MARKETS = [
  ["player_pass_yds", "Pass Yds"],
  ["player_pass_tds", "Pass TD"],
  ["player_rush_yds", "Rush Yds"],
  ["player_reception_yds", "Rec Yds"],
  ["player_receptions", "Receptions"],
  ["player_anytime_td", "Anytime TD"],
];

export default async function handler(req, res) {
  const key = process.env.ODDS_API_KEY;
  if (!key) return res.status(200).json({ configured: false });
  try {
    if (!req.query.event) {
      const r = await fetch(`${BASE}/events?apiKey=${key}`, { headers: { accept: "application/json" } });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const d = await r.json();
      res.setHeader("Cache-Control", "s-maxage=900, stale-while-revalidate=1800");
      return res.status(200).json({
        configured: true,
        remaining: r.headers.get("x-requests-remaining") || null,
        events: (d || []).map((e) => ({ id: e.id, home: e.home_team, away: e.away_team, start: e.commence_time })),
      });
    }

    const id = String(req.query.event).replace(/[^a-zA-Z0-9]/g, "");
    const url = `${BASE}/events/${id}/odds?apiKey=${key}&regions=us&oddsFormat=american&markets=${MARKETS.map((m) => m[0]).join(",")}`;
    const r = await fetch(url, { headers: { accept: "application/json" } });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const d = await r.json();

    // Books each publish their own line. Keep the first book that offers a
    // market (usually DraftKings/FanDuel) so lines don't jump between players.
    const out = {};
    for (const [mkey, label] of MARKETS) {
      const byPlayer = {};
      for (const bk of d.bookmakers || []) {
        const m = (bk.markets || []).find((x) => x.key === mkey);
        if (!m) continue;
        for (const o of m.outcomes || []) {
          const who = o.description || o.name;
          if (!who) continue;
          const slot = (byPlayer[who] ??= { player: who, line: o.point ?? null, book: bk.title });
          if (mkey === "player_anytime_td") { if (slot.price == null) slot.price = o.price; }
          else if (/over/i.test(o.name)) { if (slot.over == null) { slot.over = o.price; slot.line = o.point ?? slot.line; } }
          else if (/under/i.test(o.name)) { if (slot.under == null) slot.under = o.price; }
        }
        if (Object.keys(byPlayer).length) break; // one book per market
      }
      const rows = Object.values(byPlayer);
      if (rows.length) {
        rows.sort((a, b) => (mkey === "player_anytime_td" ? (a.price ?? 999) - (b.price ?? 999) : (b.line ?? 0) - (a.line ?? 0)));
        out[mkey] = { label, rows };
      }
    }
    res.setHeader("Cache-Control", "s-maxage=600, stale-while-revalidate=1200");
    return res.status(200).json({
      configured: true, id, home: d.home_team || null, away: d.away_team || null, start: d.commence_time || null,
      remaining: r.headers.get("x-requests-remaining") || null, markets: out,
    });
  } catch (e) {
    return res.status(200).json({ configured: true, error: String(e.message || e), markets: {} });
  }
}
