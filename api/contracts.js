// Vercel serverless function: fetches your Airtable base server-side and
// returns ALL players (for the Player Hub) with bio, photo, and contract
// history (for the Contracts tab).
//
// Robustness:
//  1. Link fields between tables are AUTO-DETECTED by record ids.
//  2. Field names are matched fuzzily (case/space/punctuation-insensitive)
//     against candidate lists below.
//  3. Linked "Team Name" values (record ids) are resolved via the Teams table.
//
// Env vars required: AIRTABLE_TOKEN, AIRTABLE_BASE_ID

const TABLES = {
  players: "Players",
  contracts: "Contracts",
  years: "Contract Years",
  teams: "Teams", // optional - used to resolve linked team names
  stats: "Stats", // optional - season averages, one row per player per season
};

const FIELDS = {
  playerName: ["Name", "Player Name", "Full Name"],
  playerPos: ["Position", "Pos"],
  playerNo: ["No.", "No", "Number", "Jersey", "Jersey Number"],
  playerTeamName: ["Team Name", "Team", "Current Team"],
  playerStatus: ["Status", "Player Status", "Availability"],
  player2K: ["Madden Rating", "Madden", "Madden Overall", "OVR", "Madden 26 Rating", "Overall"],
  playerInjury: ["Injury Notes", "Injury Note", "Injury", "Injury Status", "Injury Report"],
  playerPhoto: ["Photo", "Headshot", "Headshots", "Player Photo", "Image", "Img", "Pic", "Picture", "Attachment", "Attachments"],
  playerHeight: ["Height"],
  playerWeight: ["Weight"],
  playerAge: ["Age"],
  playerStatus: ["Status"],
  playerArchetype: ["Archetype", "Player Type", "Play Style"],
  playerRole: ["Role", "Depth Chart", "Depth", "Lineup Role", "Rotation"],
  playerSort: ["Sort Priority", "Sort", "Priority", "Depth Order", "Order"],
  playerDraft: ["Draft", "Draft Info", "Drafted"],
  playerDraftYear: ["Draft Year"],
  playerDraftRound: ["Draft Round", "Round", "Rd"],
  playerDraftPick: ["Draft Pick", "Pick", "Pick No", "Pick Number"],
  playerBirthplace: ["Birthplace", "Birth Place", "Born", "Hometown"],
  playerCollege: ["College", "School", "College/Country"],
  playerAwards: ["Awards", "Accolades", "Honors"],
  teamConference: ["Conference", "Conf"],
  teamDivision: ["Division", "Div"],
  teamWins: ["W", "Wins"],
  teamPPG: ["PPG", "Points Per Game", "Team PPG", "Offense PPG", "PTS/G"],
  teamOppPPG: ["OPP PPG", "Opp PPG", "PPG Allowed", "Points Allowed", "OPPG", "Defense PPG", "Opp PTS/G"],
  teamLosses: ["L", "Losses"],
  teamTies: ["T", "Ties", "Tie"],
  teamPF: ["PF", "Points Scored", "Points For", "Total Points", "Pts Scored"],
  teamPA: ["PA", "Points Allowed Total", "Points Against", "Total Points Allowed", "Pts Allowed"],
  teamWinsPrev: ["Last Season Wins", "Prev Wins", "2025 Wins", "LY Wins", "Last Year Wins"],
  teamLossesPrev: ["Last Season Losses", "Prev Losses", "2025 Losses", "LY Losses", "Last Year Losses"],
  teamTiesPrev: ["Last Season Ties", "Prev Ties", "2025 Ties", "LY Ties", "Last Year Ties"],
  teamPFPrev: ["Last Season PF", "Prev PF", "2025 PF", "LY PF"],
  teamPAPrev: ["Last Season PA", "Prev PA", "2025 PA", "LY PA"],
  teamName: ["Name", "Team Name", "Team"],
  teamAbbr: ["TM", "Abbreviation", "Abbr", "Short Name", "Code"],
  cKind: ["Contract Type", "Kind", "Type", "Deal Type"],
  cStatus: ["Status", "Contract Status"],
  cTeam: ["Team", "Signing Team"],
  cSigned: ["Signed Date", "Signed", "Date Signed", "Signed Year"],
  ySeason: ["Season", "Year"],
  sSeason: ["Season", "Year"],
  sGP: ["GP", "G", "Games", "Games Played", "Gms", "# Games", "Game Count", "GP (Games Played)"],
  sPassYds: ["Pass Yds", "Passing Yards", "Pass Yards", "PassYds", "Pass YDS"],
  sPassTD: ["Pass TD", "Passing TD", "Pass TDs", "PassTD"],
  sINT: ["INT", "INTs", "Interceptions", "Int"],
  sRushYds: ["Rush Yds", "Rushing Yards", "Rush Yards", "RushYds", "Rush YDS"],
  sRushTD: ["Rush TD", "Rushing TD", "Rush TDs", "RushTD"],
  sRec: ["Rec", "Receptions", "Catches"],
  sRecYds: ["Rec Yds", "Receiving Yards", "Rec Yards", "RecYds", "Rec YDS"],
  sRecTD: ["Rec TD", "Receiving TD", "Rec TDs", "RecTD"],
  sTkl: ["Tackles", "TKL", "Total Tackles", "Tck"],
  sSck: ["Sacks", "SCK", "Sack"],
  ySalary: ["Salary", "Amount", "Cap Hit"],
  yType: ["Type", "Year Type", "Guarantee"],
  yDecision: ["Decision", "Option Decision"],
  yGuaranteed: ["Guaranteed $", "Guaranteed", "Guaranteed Amount", "Gtd"],
};

// Keys are normalized (lowercase, no spaces/punctuation) to match norm()
const TYPE_MAP = {
  "guaranteed": "G",
  "playeroption": "PO",
  "teamoption": "TO",
  "nonguaranteed": "NG",
  "partiallyguaranteed": "PG",
  "ufa": "UFA",
  "rfa": "RFA",
};


// Accepts a number, a numeric string ("4"), or an array holding either
// (single selects and lookups often arrive as strings/arrays).
function coerceNum(v) {
  if (Array.isArray(v)) v = v[0];
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = parseFloat(v.replace(/[^0-9.\-]/g, ""));
    return isNaN(n) ? null : n;
  }
  return null;
}

const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");
const isRecId = (v) => typeof v === "string" && /^rec[a-zA-Z0-9]{14}$/.test(v);

function getField(fields, candidates) {
  const keys = Object.keys(fields);
  for (const cand of candidates) {
    const target = norm(cand);
    for (const k of keys) {
      if (norm(k) === target) return fields[k];
    }
  }
  return undefined;
}

// Returns a clean string; resolves linked record ids via resolver map;
// never lets a raw rec id through.
function asText(val, resolver) {
  if (val == null) return "";
  if (Array.isArray(val)) {
    const parts = val
      .map((v) => asText(v, resolver))
      .filter(Boolean);
    return parts.join(", ");
  }
  if (isRecId(val)) return (resolver && resolver[val]) || "";
  return String(val);
}

function photoUrl(val) {
  if (Array.isArray(val) && val[0] && typeof val[0] === "object" && val[0].url) {
    const att = val[0];
    return (att.thumbnails && att.thumbnails.large && att.thumbnails.large.url) || att.url;
  }
  return null;
}

// Fallback: scan every field for an attachment-shaped value (array of
// objects with a url). Finds the headshot no matter what the field is named.
function findAnyPhoto(fields) {
  for (const val of Object.values(fields)) {
    const url = photoUrl(val);
    if (url) return url;
  }
  return null;
}

async function fetchAll(base, table, token) {
  const records = [];
  let offset;
  do {
    const url = new URL(`https://api.airtable.com/v0/${base}/${encodeURIComponent(table)}`);
    url.searchParams.set("pageSize", "100");
    if (offset) url.searchParams.set("offset", offset);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Airtable table "${table}": ${res.status} ${await res.text()} · server used base "${base}" (${base.length} chars)`);
    const data = await res.json();
    records.push(...data.records);
    offset = data.offset;
  } while (offset);
  return records;
}

function findLink(fields, targetIds) {
  for (const val of Object.values(fields)) {
    if (Array.isArray(val)) {
      for (const item of val) {
        if (isRecId(item) && targetIds.has(item)) return item;
      }
    }
  }
  return null;
}

function seasonLabel(s) {
  if (!s) return "";
  const parts = String(s).split("-");
  const end = parts[1] || parts[0];
  return "'" + String(end).slice(-2);
}

// ESPN-style position sequence used to rank "QB1"/"RB2"-style sort labels.
const POS_SEQ = ["QB", "RB", "FB", "WR", "TE", "LT", "LG", "C", "RG", "RT", "OT", "OG", "G", "OL",
  "DE", "EDGE", "DT", "NT", "DL", "LB", "ILB", "MLB", "OLB", "CB", "S", "FS", "SS", "DB",
  "K", "P", "LS", "KR", "PR"];
function sortRank(raw) {
  if (raw == null) return null;
  const s = String(Array.isArray(raw) ? raw[0] : raw).trim().toUpperCase();
  if (/^\d+(\.\d+)?$/.test(s)) return Number(s); // plain numbers still work
  const m = s.match(/^([A-Z]+)\s*(\d*)$/);
  if (!m) return null;
  const i = POS_SEQ.indexOf(m[1]);
  if (i === -1) return null;
  return i * 100 + (m[2] ? Number(m[2]) : 0); // "QB1" -> 1, "RB2" -> 102, "WR2" -> 302
}

export default async function handler(req, res) {
  try {
    const token = (process.env.AIRTABLE_TOKEN || "").trim();
    const base = (process.env.AIRTABLE_BASE_ID || "").trim();
    if (!token || !base) {
      return res.status(500).json({ error: "Missing AIRTABLE_TOKEN or AIRTABLE_BASE_ID env var" });
    }

    // Resolve real table IDs via the metadata API so that invisible name
    // mismatches (trailing spaces, casing) can never cause a 404. Falls back
    // to the literal names if the token lacks schema.bases:read.
    const T = { ...TABLES };
    try {
      const metaRes = await fetch(`https://api.airtable.com/v0/meta/bases/${base}/tables`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (metaRes.ok) {
        const meta = await metaRes.json();
        const norm = (s) => String(s).toLowerCase().replace(/\s+/g, " ").trim();
        const byName = {};
        for (const t of meta.tables || []) byName[norm(t.name)] = t.id;
        for (const [key, name] of Object.entries(TABLES)) {
          if (byName[norm(name)]) T[key] = byName[norm(name)];
        }
      }
    } catch {}

    const [players, contracts, years] = await Promise.all([
      fetchAll(base, T.players, token),
      fetchAll(base, T.contracts, token),
      fetchAll(base, T.years, token),
    ]);

    // Stats are optional: prefer a single "Stats" table; fall back to the
    // legacy per-season table name if it exists.
    let statRecords = [];
    let impliedSeason = null;
    try {
      statRecords = await fetchAll(base, T.stats, token);
    } catch {
      try {
        statRecords = await fetchAll(base, "2025-2026 Stats", token);
        impliedSeason = "2025-2026";
      } catch {
        statRecords = [];
      }
    }

    // Teams table is optional - used only to translate linked ids to names.
    let teamNameById = {};
    let teamsOut = [];
    try {
      const teams = await fetchAll(base, T.teams, token);
      for (const t of teams) {
        const abbr = asText(getField(t.fields, FIELDS.teamAbbr));
        const name = asText(getField(t.fields, FIELDS.teamName));
        teamNameById[t.id] = abbr || name || "";
        teamsOut.push({
          id: t.id,
          name: name || abbr,
          abbr,
          conference: asText(getField(t.fields, FIELDS.teamConference)),
          division: asText(getField(t.fields, FIELDS.teamDivision)),
          wins: coerceNum(getField(t.fields, FIELDS.teamWins)),
          ppg: coerceNum(getField(t.fields, FIELDS.teamPPG)),
          oppPpg: coerceNum(getField(t.fields, FIELDS.teamOppPPG)),
          losses: coerceNum(getField(t.fields, FIELDS.teamLosses)),
          ties: coerceNum(getField(t.fields, FIELDS.teamTies)),
          pf: coerceNum(getField(t.fields, FIELDS.teamPF)),
          pa: coerceNum(getField(t.fields, FIELDS.teamPA)),
          winsPrev: coerceNum(getField(t.fields, FIELDS.teamWinsPrev)),
          lossesPrev: coerceNum(getField(t.fields, FIELDS.teamLossesPrev)),
          tiesPrev: coerceNum(getField(t.fields, FIELDS.teamTiesPrev)),
          pfPrev: coerceNum(getField(t.fields, FIELDS.teamPFPrev)),
          paPrev: coerceNum(getField(t.fields, FIELDS.teamPAPrev)),
          logo: findAnyPhoto(t.fields),
        });
      }
      teamsOut.sort((a, b) => String(a.name).localeCompare(String(b.name)));
    } catch {
      teamNameById = {};
      teamsOut = [];
    }

    const playerIds = new Set(players.map((p) => p.id));
    const contractIds = new Set(contracts.map((c) => c.id));

    const statsByPlayer = {};
    for (const r of statRecords) {
      const pid = findLink(r.fields, playerIds);
      if (!pid) continue;
      (statsByPlayer[pid] ??= []).push({
        season: asText(getField(r.fields, FIELDS.sSeason)) || impliedSeason || "",
        gp: coerceNum(getField(r.fields, FIELDS.sGP)),
        passYds: coerceNum(getField(r.fields, FIELDS.sPassYds)),
        passTd: coerceNum(getField(r.fields, FIELDS.sPassTD)),
        ints: coerceNum(getField(r.fields, FIELDS.sINT)),
        rushYds: coerceNum(getField(r.fields, FIELDS.sRushYds)),
        rushTd: coerceNum(getField(r.fields, FIELDS.sRushTD)),
        rec: coerceNum(getField(r.fields, FIELDS.sRec)),
        recYds: coerceNum(getField(r.fields, FIELDS.sRecYds)),
        recTd: coerceNum(getField(r.fields, FIELDS.sRecTD)),
        tkl: coerceNum(getField(r.fields, FIELDS.sTkl)),
        sck: coerceNum(getField(r.fields, FIELDS.sSck)),
      });
    }
    for (const [pid, arr] of Object.entries(statsByPlayer)) {
      const bySeason = {};
      for (const st of arr) {
        const key = String(st.season);
        if (!bySeason[key] || (st.gp ?? 0) > (bySeason[key].gp ?? 0)) bySeason[key] = st;
      }
      statsByPlayer[pid] = Object.values(bySeason);
    }
    for (const arr of Object.values(statsByPlayer)) {
      for (const st of arr) {
        // NFL convention: stats stay as SEASON TOTALS (no per-game division).
        // Derived: primary yardage (pass > rush > rec) and total TDs.
        st.yds = st.passYds ?? st.rushYds ?? st.recYds ?? null;
        if (st.passTd != null || st.rushTd != null || st.recTd != null) {
          st.td = (st.passTd || 0) + (st.rushTd || 0) + (st.recTd || 0);
        } else st.td = null;
      }
      arr.sort((a, b) => String(b.season).localeCompare(String(a.season)));
    }

    const yearsByContract = {};
    for (const y of years) {
      const cid = findLink(y.fields, contractIds);
      if (!cid) continue;
      const rawSalary = getField(y.fields, FIELDS.ySalary);
      const rawType = asText(getField(y.fields, FIELDS.yType));
      const rawGtd = getField(y.fields, FIELDS.yGuaranteed);
      const season = asText(getField(y.fields, FIELDS.ySeason));
      (yearsByContract[cid] ??= []).push({
        s: seasonLabel(season),
        season,
        salary: typeof rawSalary === "number" ? rawSalary / 1e6 : null,
        type: TYPE_MAP[norm(rawType)] || rawType || "G",
        decision: asText(getField(y.fields, FIELDS.yDecision)) || null,
        gtd: typeof rawGtd === "number" ? rawGtd / 1e6 : null,
      });
    }

    const contractsByPlayer = {};
    for (const c of contracts) {
      const pid = findLink(c.fields, playerIds);
      if (!pid) continue;
      const yrs = (yearsByContract[c.id] || []).sort((a, b) =>
        a.season.localeCompare(b.season)
      );
      const signedRaw = getField(c.fields, FIELDS.cSigned);
      let signed = null;
      if (typeof signedRaw === "number") signed = signedRaw;
      else if (signedRaw) {
        const d = new Date(signedRaw);
        if (!isNaN(d)) signed = d.getFullYear();
      }
      (contractsByPlayer[pid] ??= []).push({
        kind: asText(getField(c.fields, FIELDS.cKind), teamNameById) || "Contract",
        team: asText(getField(c.fields, FIELDS.cTeam), teamNameById),
        status: asText(getField(c.fields, FIELDS.cStatus)) || "Active",
        signed,
        years: yrs,
      });
    }

    const out = players
      .map((p) => ({
        id: p.id,
        name: asText(getField(p.fields, FIELDS.playerName)) || "Unknown",
        pos: asText(getField(p.fields, FIELDS.playerPos)),
        no: asText(getField(p.fields, FIELDS.playerNo)),
        teamName: asText(getField(p.fields, FIELDS.playerTeamName), teamNameById),
        teamId: (() => {
          const v = getField(p.fields, FIELDS.playerTeamName);
          return Array.isArray(v) && typeof v[0] === "string" && /^rec[a-zA-Z0-9]{14}$/.test(v[0]) ? v[0] : null;
        })(),
        status: asText(getField(p.fields, FIELDS.playerStatus)),
        rating2k: coerceNum(getField(p.fields, FIELDS.player2K)),
        injuryNotes: asText(getField(p.fields, FIELDS.playerInjury)),
        photo: photoUrl(getField(p.fields, FIELDS.playerPhoto)) || findAnyPhoto(p.fields),
        height: asText(getField(p.fields, FIELDS.playerHeight)),
        weight: asText(getField(p.fields, FIELDS.playerWeight)),
        age: asText(getField(p.fields, FIELDS.playerAge)),
        status: asText(getField(p.fields, FIELDS.playerStatus)),
        rating2k: coerceNum(getField(p.fields, FIELDS.player2K)),
        archetype: asText(getField(p.fields, FIELDS.playerArchetype)),
        role: asText(getField(p.fields, FIELDS.playerRole)),
        sort: sortRank(getField(p.fields, FIELDS.playerSort)),
        // Raw depth-chart label ("RG1", "WR2") so the formation view can map
        // players to slots by YOUR sort priority, not just the Position field.
        sortLabel: (() => {
          const v = getField(p.fields, FIELDS.playerSort);
          if (v == null) return null;
          const s = String(Array.isArray(v) ? v[0] : v).trim().toUpperCase();
          return s || null;
        })(),
        draft: asText(getField(p.fields, FIELDS.playerDraft)).replace(/^\s*\d{4}\s*[:\u00b7\-]?\s*/, ""),
        draftYear: coerceNum(getField(p.fields, FIELDS.playerDraftYear)),
        birthplace: asText(getField(p.fields, FIELDS.playerBirthplace)),
        college: asText(getField(p.fields, FIELDS.playerCollege)),
        draftRound: coerceNum(getField(p.fields, FIELDS.playerDraftRound)),
        draftPick: coerceNum(getField(p.fields, FIELDS.playerDraftPick)),
        stats: statsByPlayer[p.id] || [],
        awards: (() => { const v = getField(p.fields, FIELDS.playerAwards); return Array.isArray(v) ? v.filter((x) => typeof x === "string" && !isRecId(x)) : (v ? [String(v)] : []); })(),
        contracts: (contractsByPlayer[p.id] || []).sort(
          (a, b) => (b.signed || 0) - (a.signed || 0)
        ),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
    return res.status(200).json({ apiVersion: "v23.4", players: out, teams: teamsOut });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
