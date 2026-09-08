// /api/td-board — Weekly anytime-touchdown board (v1 scaffold).
//
// Returns { ready: false } until Week 1 data exists. Once wired, the app
// renders each card straight from this contract — no UI changes needed:
//
// {
//   ready: true, season: 2026, week: 1, version: "v1", updatedAt: ISO,
//   cards: [{
//     name: "Bijan Robinson", team: "ATL", pos: "RB", role: "RB1",
//     opp: "TB", home: true, spread: -3.5, implTotal: 26.5,
//     rzShare: 0.31,        // share of team red-zone opportunities (trailing, weighted)
//     oppShare: 0.24,       // share of team touches/targets
//     oppTdAllowedPg: 1.4,  // TDs/game opponent allows to this position
//     oppTdRank: 27,        // 1 = stingiest vs this position, 32 = most generous
//     expTd: 0.78,          // expected touchdowns (lambda)
//     tdPct: 0.54,          // 1 - e^(-expTd)
//     venue: "Mercedes-Benz Stadium", dome: true, weather: null,
//     injury: null,         // "Questionable" etc. from Sleeper
//   }]
// }
//
// Inputs (all automated, nothing added to Airtable):
//   nflverse weekly player stats + play-by-play  -> rzShare, oppShare, opp TD-allowed by position
//   ESPN scoreboard (odds)                        -> spread, implied totals, venue
//   Sleeper                                       -> injury gate
//   Airtable Sort Priority                        -> starters only (RB1, WR1-3, TE1)

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "s-maxage=600, stale-while-revalidate=3600");
  return res.status(200).json({
    ready: false,
    season: 2026,
    week: 1,
    version: "v1",
    note: "Board activates once Week 1 nflverse data is published.",
    cards: [],
  });
}
