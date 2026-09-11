// /api/td-log — snapshot this week's TD board (top 25) into Airtable "TD Log".
// Runs Saturday morning via cron (before Sunday kickoffs) and can be triggered
// by visiting the URL. Idempotent: a week is only written once.
//
// Airtable table "TD Log" (create it once) with fields:
//   Key (single line text, primary) · Season (number) · Week (number) · Rank (number)
//   Player · Team · Pos · Opp (single line text) · ESPN ID (single line text)
//   TD Pct (number, 3 decimals) · xTD (number, 3 decimals)

const TABLE = "TD Log";
export default async function handler(req, res) {
  try {
    const token = (process.env.AIRTABLE_TOKEN || "").trim(), base = (process.env.AIRTABLE_BASE_ID || "").trim();
    if (!token || !base) return res.status(500).json({ error: "Missing AIRTABLE_TOKEN / AIRTABLE_BASE_ID" });
    const origin = `${req.headers["x-forwarded-proto"] || "https"}://${req.headers.host}`;
    const board = await (await fetch(`${origin}/api/td-board`)).json();
    if (!board.ready) return res.status(200).json({ ok: false, reason: board.reason || "board not ready" });

    const at = (path, opts = {}) => fetch(`https://api.airtable.com/v0/${base}/${encodeURIComponent(TABLE)}${path}`, {
      ...opts, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(opts.headers || {}) } });
    // Already logged this week?
    const q = `?filterByFormula=${encodeURIComponent(`AND({Season}=${board.season},{Week}=${board.week})`)}&maxRecords=1`;
    const existing = await (await at(q)).json();
    if (existing.error) throw new Error(existing.error.message || JSON.stringify(existing.error));
    if ((existing.records || []).length && !req.query.force) return res.status(200).json({ ok: true, skipped: true, note: `Week ${board.week} already logged` });

    const records = board.cards.slice(0, 25).map((c, i) => ({ fields: {
      Key: `${board.season}-W${board.week}-${c.espnId || c.sleeperId || i}`, Season: board.season, Week: board.week, Rank: i + 1,
      Player: c.name, Team: c.team, Pos: c.pos, Opp: c.opp, "ESPN ID": String(c.espnId || ""), "TD Pct": c.tdPct, xTD: c.expTd } }));
    for (let i = 0; i < records.length; i += 10) {
      const r = await at("", { method: "POST", body: JSON.stringify({ records: records.slice(i, i + 10) }) });
      if (!r.ok) throw new Error(`Airtable ${r.status}: ${await r.text()}`);
    }
    return res.status(200).json({ ok: true, season: board.season, week: board.week, logged: records.length });
  } catch (e) {
    return res.status(502).json({ ok: false, error: String(e.message || e) });
  }
}
