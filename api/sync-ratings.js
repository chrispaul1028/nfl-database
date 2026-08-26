// Vercel serverless function: syncs Madden OVRs from EA's ratings-site feed
// into the Airtable "Madden Rating" field. Runs weekly via vercel.json cron
// (EA pushes in-season rating updates Thursdays/Fridays).
//
// Uses the SAME env vars as /api/contracts: AIRTABLE_TOKEN, AIRTABLE_BASE_ID.
// Nothing new to configure. Test manually in a browser:
//   https://<your-app>.vercel.app/api/sync-ratings
//
// Caveat: drop-api.ea.com is the unofficial endpoint behind
// ea.com/games/madden-nfl/ratings. If a new title year changes its shape,
// this fails loudly (502 + error message) and writes NOTHING, rather than
// silently zeroing your ratings.

const CONFIG = {
  table: "Players",
  nameField: ["Name", "Player Name", "Full Name"],
  teamField: ["Team Name", "Team", "Current Team"],
  ratingField: ["Madden Rating", "Madden", "Madden Overall", "OVR", "Overall"],
  eaUrl: "https://drop-api.ea.com/rating/madden-nfl",
  pageSize: 100,
  maxPages: 40,
  minPlayers: 500, // a real pull is ~2500+; fewer means the feed shape changed
};

// Common roster nickname drift (your "Pat Surtain" vs EA's "Patrick Surtain")
const NICKNAMES = { pat: "patrick", kenny: "kenneth", ken: "kenneth", mike: "michael", rob: "robert", bob: "robert", josh: "joshua", alex: "alexander", cam: "cameron", matt: "matthew", dan: "daniel", danny: "daniel", chris: "christopher", zach: "zachary", nick: "nicholas", jake: "jacob", will: "william", tony: "anthony", drew: "andrew", jeff: "jeffrey", greg: "gregory", sam: "samuel", ben: "benjamin", joe: "joseph", jim: "james", tom: "thomas", steve: "stephen", dave: "david" };
const nrm = (x) => {
  const s = String(x || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[.'’`]/g, "")
    .replace(/\s+(jr|sr|ii|iii|iv|v)$/i, "")
    .replace(/\s+/g, " ").trim().toLowerCase();
  const parts = s.split(" ");
  if (parts.length > 1 && NICKNAMES[parts[0]]) parts[0] = NICKNAMES[parts[0]];
  return parts.join(" ");
};

const ABBR_ALIASES = [["WAS", "WSH"], ["JAX", "JAC"], ["LAR", "LA"], ["ARI", "ARZ"], ["BAL", "BLT"], ["CLE", "CLV"], ["HOU", "HST"]];
const teamEq = (a, b) => {
  const n = (t) => String(t || "").toUpperCase();
  if (!n(a) || !n(b)) return false;
  if (n(a) === n(b)) return true;
  return ABBR_ALIASES.some(([x, y]) => (n(a) === x && n(b) === y) || (n(a) === y && n(b) === x));
};

const TEAM_NAME_TO_ABBR = {
  cardinals: "ARI", falcons: "ATL", ravens: "BAL", bills: "BUF", panthers: "CAR",
  bears: "CHI", bengals: "CIN", browns: "CLE", cowboys: "DAL", broncos: "DEN",
  lions: "DET", packers: "GB", texans: "HOU", colts: "IND", jaguars: "JAX",
  chiefs: "KC", raiders: "LV", chargers: "LAC", rams: "LAR", dolphins: "MIA",
  vikings: "MIN", patriots: "NE", saints: "NO", giants: "NYG", jets: "NYJ",
  eagles: "PHI", steelers: "PIT", "49ers": "SF", seahawks: "SEA",
  buccaneers: "TB", titans: "TEN", commanders: "WAS",
};
function eaTeamAbbr(raw) {
  if (!raw) return null;
  const v = typeof raw === "object" ? (raw.abbr || raw.label || raw.name || "") : raw;
  const s = String(v).trim();
  if (/^[A-Z]{2,3}$/.test(s)) return s.toUpperCase();
  return TEAM_NAME_TO_ABBR[s.toLowerCase().split(" ").pop()] || null;
}

// Tolerate the field-name drift EA has shown between title years
function eaPlayer(item) {
  const name = item.fullNameForSearch || item.fullName ||
    [item.firstName, item.lastName].filter(Boolean).join(" ");
  let ovr = item.overallRating ?? item.overall_rating ?? item.ovr ?? null;
  if (ovr && typeof ovr === "object") ovr = ovr.value;
  return { name, ovr, team: eaTeamAbbr(item.team) };
}

async function fetchEaRatings() {
  const players = [];
  for (let page = 0; page < CONFIG.maxPages; page++) {
    const url = `${CONFIG.eaUrl}?locale=en&limit=${CONFIG.pageSize}&offset=${page * CONFIG.pageSize}`;
    const r = await fetch(url, { headers: { accept: "application/json" } });
    if (!r.ok) throw new Error(`EA endpoint HTTP ${r.status} at offset ${page * CONFIG.pageSize}`);
    const d = await r.json();
    const items = d.items || d.docs || d.players || [];
    if (!items.length) break;
    for (const it of items) {
      const p = eaPlayer(it);
      if (p.name && p.ovr != null && isFinite(Number(p.ovr))) players.push(p);
    }
    const total = d.totalItems ?? d.total ?? null;
    if (total != null && (page + 1) * CONFIG.pageSize >= total) break;
  }
  if (players.length < CONFIG.minPlayers) {
    throw new Error(`EA feed returned only ${players.length} usable players — endpoint shape likely changed, nothing written`);
  }
  const byName = {};
  for (const p of players) (byName[nrm(p.name)] = byName[nrm(p.name)] || []).push(p);
  return byName;
}

// ── Airtable (same fuzzy field matching philosophy as /api/contracts) ──
const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");
function getField(fields, candidates) {
  const keys = Object.keys(fields);
  for (const cand of candidates) {
    for (const k of keys) if (norm(k) === norm(cand)) return { key: k, val: fields[k] };
  }
  return null;
}

async function listAllRecords(base, token) {
  const records = [];
  let offset;
  do {
    const url = new URL(`https://api.airtable.com/v0/${base}/${encodeURIComponent(CONFIG.table)}`);
    url.searchParams.set("pageSize", "100");
    if (offset) url.searchParams.set("offset", offset);
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) throw new Error(`Airtable list HTTP ${r.status}: ${await r.text()}`);
    const d = await r.json();
    records.push(...(d.records || []));
    offset = d.offset;
  } while (offset);
  return records;
}

async function patchBatch(base, token, updates) {
  for (let i = 0; i < updates.length; i += 10) {  // Airtable cap: 10/request
    const r = await fetch(`https://api.airtable.com/v0/${base}/${encodeURIComponent(CONFIG.table)}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ records: updates.slice(i, i + 10) }),
    });
    if (!r.ok) throw new Error(`Airtable PATCH HTTP ${r.status}: ${await r.text()}`);
    if (i + 10 < updates.length) await new Promise((res) => setTimeout(res, 250));
  }
}

export default async function handler(req, res) {
  try {
    const token = (process.env.AIRTABLE_TOKEN || "").trim();
    const base = (process.env.AIRTABLE_BASE_ID || "").trim();
    if (!token || !base) return res.status(500).json({ error: "Missing AIRTABLE_TOKEN or AIRTABLE_BASE_ID env var" });

    const [byName, records] = await Promise.all([fetchEaRatings(), listAllRecords(base, token)]);

    const updates = [], unmatched = [], ambiguous = [];
    let matched = 0, ratingKey = null;

    for (const rec of records) {
      const f = rec.fields || {};
      const nameF = getField(f, CONFIG.nameField);
      if (!nameF || !nameF.val) continue;
      const name = Array.isArray(nameF.val) ? nameF.val[0] : nameF.val;
      const teamF = getField(f, CONFIG.teamField);
      const team = teamF ? (Array.isArray(teamF.val) ? teamF.val[0] : teamF.val) : null;
      const ratingF = getField(f, CONFIG.ratingField);
      if (ratingF && !ratingKey) ratingKey = ratingF.key;

      const cands = byName[nrm(name)];
      if (!cands || !cands.length) { unmatched.push(name); continue; }
      let hit = cands[0];
      if (cands.length > 1) {
        hit = cands.find((c) => teamEq(c.team, team));
        if (!hit) { ambiguous.push(name); continue; } // duplicate name, no team match — never guess
      }
      matched++;

      const newOvr = Math.round(Number(hit.ovr));
      const oldOvr = ratingF && ratingF.val != null ? Math.round(Number(ratingF.val)) : null;
      if (newOvr !== oldOvr && ratingKey) {
        updates.push({ id: rec.id, fields: { [ratingKey]: newOvr } });
      }
    }

    if (!ratingKey) throw new Error(`No rating field found on Players — expected one of: ${CONFIG.ratingField.join(", ")}`);

    await patchBatch(base, token, updates);

    return res.status(200).json({
      ok: true,
      airtableRecords: records.length,
      matched,
      updated: updates.length,
      ratingField: ratingKey,
      unmatchedSample: unmatched.slice(0, 15),  // audit: retired players / spelling drift
      ambiguousSample: ambiguous.slice(0, 15),  // audit: duplicate names needing a team value
      syncedAt: new Date().toISOString(),
    });
  } catch (e) {
    return res.status(502).json({ ok: false, error: String(e.message || e) });
  }
}
