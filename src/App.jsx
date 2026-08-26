import React, { useState, useMemo, useEffect } from "react";

// ═══════════════ THEME (edit these to restyle the app) ═══════════
// Player detail header color:
//   "team"   -> uses the player's CURRENT team color
//   any hex  -> one fixed color for everyone, e.g. "#1e293b"
const HEADER_COLOR = "team";

// Season used for team payroll totals (must match your Season select format)
const CURRENT_SEASON = "2025";

// Salary bar colors by year type - change any hex you like.
const BAR_COLORS = {
  G: "#2563eb",    // guaranteed        (blue)
  PO: "#22c55e",   // player option     (green)
  TO: "#dc2626",   // team option       (red)
  NG: "#cbd5e1",   // non-guaranteed    (slate)
  PG: "#d2b48c",   // partially gtd     (tan)
  UFA: "#e2e8f0",  // free agent stub
  RFA: "#fecdd3",  // restricted stub
};
// Accent for the Total tile + featured contract border.
const ACCENT_TEXT = "text-emerald-600";
const ACCENT_BORDER = "border-emerald-200";

const TEAM_COLORS = {
  ARI: "#97233F", ATL: "#A71930", BAL: "#241773", BUF: "#00338D",
  CAR: "#0085CA", CHI: "#0B162A", CIN: "#FB4F14", CLE: "#311D00",
  DAL: "#003594", DEN: "#FB4F14", DET: "#0076B6", GB: "#203731",
  HOU: "#03202F", IND: "#002C5F", JAX: "#006778", JAC: "#006778",
  KC: "#E31837", LV: "#000000", LAC: "#0080C6", LAR: "#003594",
  MIA: "#008E97", MIN: "#4F2683", NE: "#002244", NO: "#D3BC8D",
  NYG: "#0B2265", NYJ: "#125740", PHI: "#004C54", PIT: "#FFB612",
  SF: "#AA0000", SEA: "#002244", TB: "#D50A0A", TEN: "#0C2340",
  WAS: "#5A1414", WSH: "#5A1414",
};

// Full team names -> abbreviations, so a player's current team
// (which may be stored as "New York Knicks") maps to its color.
const NAME_TO_ABBR = {
  "arizona cardinals": "ARI", "atlanta falcons": "ATL", "baltimore ravens": "BAL",
  "buffalo bills": "BUF", "carolina panthers": "CAR", "chicago bears": "CHI",
  "cincinnati bengals": "CIN", "cleveland browns": "CLE", "dallas cowboys": "DAL",
  "denver broncos": "DEN", "detroit lions": "DET", "green bay packers": "GB",
  "houston texans": "HOU", "indianapolis colts": "IND", "jacksonville jaguars": "JAX",
  "kansas city chiefs": "KC", "las vegas raiders": "LV", "los angeles chargers": "LAC",
  "los angeles rams": "LAR", "miami dolphins": "MIA", "minnesota vikings": "MIN",
  "new england patriots": "NE", "new orleans saints": "NO", "new york giants": "NYG",
  "new york jets": "NYJ", "philadelphia eagles": "PHI", "pittsburgh steelers": "PIT",
  "san francisco 49ers": "SF", "seattle seahawks": "SEA", "tampa bay buccaneers": "TB",
  "tennessee titans": "TEN", "washington commanders": "WAS",
};

function toAbbr(team) {
  if (!team) return "";
  const t = String(team).trim();
  if (TEAM_COLORS[t.toUpperCase()]) return t.toUpperCase();
  return NAME_TO_ABBR[t.toLowerCase()] || "";
}
const teamColor = (abbr) => TEAM_COLORS[String(abbr).toUpperCase()] || "#334155";
// Current-team color first; falls back to the contract team if no current team.
function playerHeaderColor(p) {
  if (HEADER_COLOR !== "team") return HEADER_COLOR;
  const current = toAbbr(p.teamName);
  if (current) return teamColor(current);
  const act = activeOf(p);
  return teamColor(act?.team || "");
}

const TYPE_LABEL = { G: "Guaranteed", PO: "Player Option", TO: "Team Option", NG: "Non-Guaranteed", PG: "Partially Gtd", UFA: "Free Agent", RFA: "Restricted FA" };
const BADGE = { PO: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300", TO: "bg-red-100 text-red-600 dark:bg-red-900/50 dark:text-red-300", NG: "bg-slate-100 text-slate-500 dark:text-slate-400", PG: "bg-amber-50 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300", UFA: "bg-slate-100 text-slate-500 dark:text-slate-400", RFA: "bg-rose-100 text-rose-600 dark:bg-rose-900/50 dark:text-rose-300" };

const fmtM = (v) => "$" + v.toFixed(1) + "M";
const cleanNo = (no) => String(no || "").replace(/^#+/, "");
const salaried = (c) => c.years.filter((y) => y.salary != null);
const total = (c) => salaried(c).reduce((a, y) => a + y.salary, 0);
const terms = (c) => salaried(c).length + " yrs / " + fmtM(total(c));
const displayLine = (c) => terms(c) + (c.team ? " (" + c.team + ")" : "") + " · " + c.kind;
const activeOf = (p) => p.contracts.find((c) => c.status === "Active") || p.contracts[0] || null;

// Years in the league, computed from Draft Year vs the current season.
function latestStats(p) {
  return p.stats && p.stats.length > 0 ? p.stats[0] : null;
}
const fmt1 = (v) => (v == null ? null : Number(v).toFixed(1));

// Inclusive season count: drafted 2014 -> 2025-26 is season #12.
function experienceOf(p) {
  if (!p.draftYear) return "";
  const nowYear = parseInt(String(CURRENT_SEASON).slice(0, 4), 10);
  const seasons = nowYear - p.draftYear + 1;
  if (isNaN(seasons) || seasons < 1) return "";
  return seasons === 1 ? "Rookie" : seasons + " seasons";
}

// Search matches player name, current team (full name or abbreviation),
// or the active contract's team. "knicks", "NY", "jalen" all work.
function matchesQuery(p, q) {
  if (!q) return true;
  const s = q.toLowerCase().trim();
  if (p.name.toLowerCase().includes(s)) return true;
  const team = String(p.teamName || "").toLowerCase();
  if (team.includes(s)) return true;
  const abbr = toAbbr(p.teamName) || (activeOf(p) && activeOf(p).team) || "";
  if (String(abbr).toLowerCase().includes(s)) return true;
  const actTeam = activeOf(p) ? String(activeOf(p).team).toLowerCase() : "";
  if (actTeam.includes(s)) return true;
  for (const c of p.contracts) {
    if (String(c.kind).toLowerCase().includes(s)) return true;
  }
  return false;
}


// ═══════════════ SHARED PIECES ═══════════════════════════════════
function Avatar({ p, size }) {
  const px = size === "lg" ? "w-20 h-20 text-2xl" : "w-11 h-11 text-sm";
  const url = photoOf(p);
  const no = cleanNo(p.no);
  const label = no ? "#" + no : p.name.split(" ").map((w) => w[0]).slice(0, 2).join("");
  // Initials render underneath; the img sits on top and removes itself if the
  // CDN 404s, so a bad fallback URL degrades to initials instead of a broken icon.
  return (
    <div className={px + " relative rounded-full bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-300 font-bold flex items-center justify-center shrink-0 overflow-hidden"}>
      {label}
      {url && (
        <img src={url} alt={p.name} loading="lazy"
          className="absolute inset-0 w-full h-full object-cover object-top bg-white"
          onError={(e) => e.currentTarget.remove()} />
      )}
    </div>
  );
}


function rankOf(teams, team, key, dir) {
  if (!teams || team[key] == null) return null;
  const vals = teams.filter((t) => t[key] != null);
  if (vals.length < 2) return null;
  const sorted = vals.slice().sort((a, b) => (dir === "asc" ? a[key] - b[key] : b[key] - a[key]));
  const rank = sorted.findIndex((t) => t.id === team.id) + 1;
  if (!rank) return null;
  const cls =
    rank <= 10 ? "text-green-600 dark:text-green-400"
    : rank <= 20 ? "text-amber-600 dark:text-amber-400"
    : "text-red-600 dark:text-red-400";
  return { label: "(" + ordinal(rank) + ")", cls };
}

function ordinal(n) {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return n + "th";
  const suffix = { 1: "st", 2: "nd", 3: "rd" }[n % 10] || "th";
  return n + suffix;
}

function Tile({ value, label, sub, accent, valueClass }) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 px-2 py-4 text-center shadow-sm flex flex-col items-center justify-center">
      <div className="text-[10px] font-semibold text-slate-400 tracking-widest uppercase mb-1">{label}</div>
      <div className={"text-2xl font-extrabold tracking-tight " + (valueClass ? valueClass : accent ? ACCENT_TEXT : "text-slate-900 dark:text-slate-100")}>{value}</div>
      {sub && (
        <div className={"text-[10px] font-bold mt-0.5 " + (typeof sub === "object" && sub.cls ? sub.cls : "text-blue-600 dark:text-blue-400")}>
          {typeof sub === "object" ? sub.label : sub}
        </div>
      )}
    </div>
  );
}


// "2026-2027" -> "'26-'27"; falls back to the old single-year tick
function seasonTick(y) {
  const raw = String(y.season || "");
  const m = raw.match(/(\d{4})\s*-\s*(\d{4})/);
  if (m) return "'" + m[1].slice(2) + "-'" + m[2].slice(2);
  const single = raw.match(/(\d{4})/);
  if (single) return single[1];
  return y.s;
}

function SalaryBars({ years }) {
  const max = Math.max(...years.map((y) => y.salary ?? 0), 1);
  return (
    <div className="flex items-end gap-2 h-32 mt-2">
      {years.map((y, i) => (
        <div key={i} className="flex-1 flex flex-col items-center justify-end h-full">
          <div className="text-[11px] font-bold text-slate-700 dark:text-slate-200 mb-1">
            {y.salary == null ? y.type : fmtM(y.salary)}
          </div>
          <div
            className="w-full rounded-t-md"
            style={{
              backgroundColor: BAR_COLORS[y.type] || BAR_COLORS.G,
              height: y.salary == null ? "6px" : Math.max((y.salary / max) * 100, 8) + "%",
            }}
          />
          <div className="text-[10px] font-semibold text-slate-400 mt-1 whitespace-nowrap">{seasonTick(y)}</div>
        </div>
      ))}
    </div>
  );
}

function ContractCard({ c, big }) {
  return (
    <div className={"bg-white dark:bg-slate-900 rounded-2xl border shadow-sm px-4 py-4 " + (big ? ACCENT_BORDER : "border-slate-200 dark:border-slate-800")}>
      <div className="flex items-baseline justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[11px] font-bold tracking-widest text-slate-400 uppercase truncate">
            {c.kind}{c.team ? " · " + c.team : ""}{c.signed ? " · " + c.signed : ""}
          </div>
          <div className="text-sm font-extrabold text-slate-800 dark:text-slate-200 mt-0.5">{terms(c)}</div>
        </div>
        <span className={"text-[10px] font-bold px-2 py-1 rounded-full shrink-0 " + (c.status === "Active" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300" : "bg-red-100 text-red-600 dark:bg-red-900/50 dark:text-red-300")}>
          {c.status}
        </span>
      </div>
      <SalaryBars years={c.years} />
      <div className="flex flex-wrap gap-1.5 mt-3">
        {c.years
          .filter((y) => y.type !== "G")
          .filter((y, _, arr) => {
            const isFA = y.type === "UFA" || y.type === "RFA";
            const hasOption = arr.some((o) => (o.type === "PO" || o.type === "TO") && !o.decision);
            return !(isFA && hasOption); // option chip covers it - FA chip is redundant
          })
          .map((y, i) => (
          <span key={i} className={"text-[11px] font-semibold px-2 py-1 rounded-full " + (BADGE[y.type] || "bg-slate-100 text-slate-500 dark:text-slate-400")}>
            {y.season || y.s} · {TYPE_LABEL[y.type] || y.type}
            {y.decision ? " · " + y.decision : ""}
            {y.gtd != null ? " (" + fmtM(y.gtd) + " gtd)" : ""}
          </span>
        ))}
        {c.years.length > 0 && c.years.every((y) => y.type === "G") && (
          <span className="text-[11px] font-semibold px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">Fully guaranteed</span>
        )}
      </div>
    </div>
  );
}

function BioRow({ k, v }) {
  if (!v) return null;
  return (
    <div className="flex justify-between px-4 py-3 text-sm">
      <span className="text-slate-400 font-medium">{k}</span>
      <span className="text-slate-800 dark:text-slate-200 font-semibold">{v}</span>
    </div>
  );
}

// ═══════════════ PLAYER DETAIL ═══════════════════════════════════
function PlayerDetail({ p, onBack, backLabel, mode = "full" }) {
  useEffect(() => { window.scrollTo(0, 0); }, []);
  const act = activeOf(p);
  const past = p.contracts.filter((c) => c !== act);
  const no = cleanNo(p.no);
  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 pb-24">
      <div className="px-5 pb-6 text-white" style={{ backgroundColor: playerHeaderColor(p), paddingTop: "calc(env(safe-area-inset-top) + 1.25rem)" }}>
        <button onClick={onBack} className="text-sm font-semibold opacity-80 mb-4">‹ {backLabel}</button>
        <div className="flex items-center gap-4">
          <Avatar p={p} size="lg" />
          <div className="min-w-0">
            <div className="text-2xl font-extrabold leading-tight truncate">
              {p.name}
            </div>
            <div className="flex items-center gap-2 mt-0.5 min-w-0">
              <span className="text-sm opacity-80 font-medium truncate">
                {[cleanNo(p.no) ? "#" + cleanNo(p.no) : "", p.pos].filter(Boolean).join(" · ")}
              </span>
              {injHasFlag(p, toAbbr(teamOfPlayer(p) || p.teamName || ""))
                ? <InjBadge p={p} team={toAbbr(teamOfPlayer(p) || p.teamName || "")} lg />
                : <StatusBadge status={p.status} />}
            </div>
            {(() => {
              const inj = injFor(p.name, toAbbr(teamOfPlayer(p) || p.teamName || ""));
              const live = inj && (inj.injury_body_part || inj.injury_notes)
                ? [inj.injury_body_part, inj.injury_notes].filter(Boolean).join(" — ") : null;
              const note = live || p.injuryNotes;
              return note ? <div className="text-xs font-semibold text-red-200 mt-1 truncate">{note}</div> : null;
            })()}
          </div>
        </div>
      </div>

      <div className="px-4 -mt-3">
        <div className="grid grid-cols-3 gap-2">
          <Tile
            value={p.rating2k != null ? Math.round(p.rating2k) : "—"}
            label="Madden"
            valueClass={p.rating2k == null ? null
              : Math.round(p.rating2k) >= 90 ? "text-amber-500 dark:text-amber-400"
              : Math.round(p.rating2k) >= 80 ? "text-slate-500 dark:text-slate-300"
              : "text-orange-700 dark:text-orange-400"}
          />
          <Tile value={currentSalary(p) > 0 ? fmtM(currentSalary(p)) : "—"} label={CURRENT_SEASON + " Salary"} />
          {(() => {
            const ev = nextEvent(p);
            const labels = { PO: "Player Option", TO: "Team Option", UFA: "Free Agent", RFA: "Restricted FA" };
            const colors = {
              PO: "text-emerald-600 dark:text-emerald-400",
              TO: "text-red-600 dark:text-red-400",
              UFA: "text-slate-500 dark:text-slate-400",
              RFA: "text-purple-600 dark:text-purple-400",
            };
            return (
              <Tile
                value={ev ? seasonTick({ season: ev.season }) : "—"}
                label={ev ? labels[ev.kind] : "Free Agent"}
                valueClass={ev ? colors[ev.kind] : null}
              />
            );
          })()}
        </div>

        {mode === "full" && (p.height || p.weight || p.age || p.draft || p.birthplace || p.draftYear) && (
          <>
            <div className="text-[11px] font-bold tracking-widest text-slate-400 uppercase mt-6 mb-2 px-1">Bio</div>
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm divide-y divide-slate-100 dark:divide-slate-800">
              <BioRow k="Height / Weight" v={[p.height, p.weight].filter(Boolean).join(" · ")} />
              <BioRow k="Age" v={p.age} />
              <BioRow k="Draft" v={[p.draftYear, p.draft].filter(Boolean).join(": ")} />
              <BioRow k="Experience" v={experienceOf(p)} />
              <BioRow k="College" v={p.college} />
              <BioRow k="Birthplace" v={p.birthplace} />
            </div>
          </>
        )}

        {mode === "full" && p.stats && p.stats.length > 0 && (
          <>
            <div className="text-[11px] font-bold tracking-widest text-slate-400 uppercase mt-6 mb-2 px-1">Stats</div>
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm divide-y divide-slate-100 dark:divide-slate-800">
              {p.stats.map((st, i) => {
                const fmtPct = (v) => (v == null ? null : Number(v).toFixed(1) + "%");
                return (
                  <div key={i} className="px-4 py-3">
                    <div className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5">{st.season || "—"}</div>
                    <div className="flex justify-between">
                      {[["G", st.gp != null ? Math.round(st.gp) : null], ["PASS", st.passYds != null ? Math.round(st.passYds) : null], ["RUSH", st.rushYds != null ? Math.round(st.rushYds) : null], ["REC YDS", st.recYds != null ? Math.round(st.recYds) : null], ["REC", st.rec != null ? Math.round(st.rec) : null]].map(([lbl, v]) => (
                        <span key={lbl} className="flex-1 text-center">
                          <span className="block text-[8px] font-bold text-slate-400 uppercase">{lbl}</span>
                          <span className="block text-xs font-extrabold text-slate-800 dark:text-slate-100 tabular-nums">{v ?? "—"}</span>
                        </span>
                      ))}
                    </div>
                    <div className="flex justify-between mt-2">
                      {[["TD", st.td != null ? Math.round(st.td) : null], ["INT", st.ints != null ? Math.round(st.ints) : null], ["TKL", st.tkl != null ? Math.round(st.tkl) : null], ["SCK", fmt1(st.sck)]].map(([lbl, v]) => (
                        <span key={lbl} className="flex-1 text-center">
                          <span className="block text-[8px] font-bold text-slate-400 uppercase">{lbl}</span>
                          <span className="block text-xs font-extrabold text-slate-800 dark:text-slate-100 tabular-nums">{v ?? "—"}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {act && salaried(act).length > 0 && (
          <div className="mt-4"><ContractCard c={act} big /></div>
        )}

        {past.length > 0 && (
          <>
            <div className="text-[11px] font-bold tracking-widest text-slate-400 uppercase mt-6 mb-2 px-1">Contract history</div>
            <div className="flex flex-col gap-3">
              {past.map((c, i) => <ContractCard key={i} c={c} />)}
            </div>
          </>
        )}


        {mode === "full" && p.awards && p.awards.length > 0 && (
          <>
            <div className="text-[11px] font-bold tracking-widest text-slate-400 uppercase mt-6 mb-2 px-1">Awards</div>
            <div className="flex flex-wrap gap-1.5">
              {p.awards.map((a, i) => (
                <span key={i} className="text-[11px] font-semibold px-2.5 py-1.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">
                  🏆 {a}
                </span>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ═══════════════ LIST HEADER (shared) ════════════════════════════
const NFL_VERSION = "f7";
// Until the current season has results, fall back to last season's numbers
const seasonStarted = (teams) => (teams || []).some((t) => (t.wins ?? 0) + (t.losses ?? 0) + (t.ties ?? 0) > 0);
function teamRec(t, started) {
  const w = started ? t.wins : (t.winsPrev ?? t.wins);
  const l = started ? t.losses : (t.lossesPrev ?? t.losses);
  const ti = started ? t.ties : (t.tiesPrev ?? t.ties);
  return { w: w ?? 0, l: l ?? 0, t: ti ?? 0, str: (w ?? 0) + "-" + (l ?? 0) + ((ti ?? 0) > 0 ? "-" + ti : "") };
}
const teamPts = (t, started) => ({
  pf: started ? t.pf : (t.pfPrev ?? t.pf),
  pa: started ? t.pa : (t.paPrev ?? t.pa),
});

// ═══════════════ LIVE INJURY LAYER (Sleeper API) ═════════════════
// Fetched once at load; free public feed, no key. Statuses:
//   injury_status: Questionable / Doubtful / Out
//   status: Active / Injured Reserve / PUP / NFI / Inactive
const INJ_BY_NAME = {}; // normalized name -> [sleeper players] (dupes kept)
const injNrm = (x) => String(x || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\./g, "").replace(/\s+(jr|sr|ii|iii|iv|v)$/i, "").replace(/\s+/g, " ").trim().toLowerCase();
const injTeamEq = (a, b) => {
  const n = (t) => String(t || "").toUpperCase();
  if (n(a) === n(b)) return true;
  const AL = [["WAS", "WSH"], ["JAX", "JAC"], ["LAR", "LA"], ["ARI", "ARZ"], ["BAL", "BLT"], ["CLE", "CLV"], ["HOU", "HST"]];
  return AL.some(([x, y]) => (n(a) === x && n(b) === y) || (n(a) === y && n(b) === x));
};
function injFor(name, teamAbbr) {
  const list = INJ_BY_NAME[injNrm(name)];
  if (!list || !list.length) return null;
  if (list.length > 1 && teamAbbr) {
    const hit = list.find((p) => injTeamEq(p.team, teamAbbr));
    if (hit) return hit;
    return null; // duplicate name, wrong/unknown team — don't guess
  }
  return list[0];
}
// Automated headshots: if Airtable has no photo, fall back to Sleeper's CDN
// (keyed by the player_id we already matched for injuries). Covers every
// rostered player with zero manual uploads.
function photoOf(p, teamAbbr) {
  if (p.photo) return p.photo;
  const inj = injFor(p.name, teamAbbr || toAbbr(teamOfPlayer(p) || p.teamName || ""));
  return inj && inj.player_id
    ? `https://sleepercdn.com/content/nfl/players/${inj.player_id}.jpg`
    : null;
}

// Badge only when NOT plain healthy-active (keeps rows quiet)
function InjBadge({ p, team, lg = false }) {
  const inj = injFor(p.name, team);
  if (!inj) return null;
  let label = null, cls = "";
  const is2 = inj.injury_status;
  if (is2 === "Questionable") { label = "QUESTIONABLE"; cls = "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300"; }
  else if (is2 === "Doubtful") { label = "DOUBTFUL"; cls = "bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300"; }
  else if (is2 === "Out") { label = "OUT"; cls = "bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300"; }
  else {
    const st = String(inj.status || "");
    if (/injured reserve/i.test(st)) { label = "IR"; cls = "bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300"; }
    else if (/pup|physically unable/i.test(st)) { label = "PUP"; cls = "bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300"; }
    else if (/non football/i.test(st)) { label = "NFI"; cls = "bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300"; }
    else if (/inactive/i.test(st)) { label = "INACTIVE"; cls = "bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-300"; }
  }
  if (!label) return null;
  return (
    <span className={"font-extrabold rounded px-1.5 shrink-0 " + (lg ? "text-[11px] py-0.5 " : "text-[9px] py-px ") + cls}>
      {label}
    </span>
  );
}

// Live status wins over the Airtable status field when they disagree
// (this is what makes Teams and Players views tell the same story)
// How many players per position count as "starters" (tune to your labels)
const STARTER_DEPTH = { WR: 3, CB: 2, LB: 2, OLB: 2, ILB: 2, DT: 2, DE: 2, EDGE: 2, S: 2, G: 2, T: 2 };
const depthOf = (p) => (p.sort != null ? (p.sort % 100 === 0 ? 1 : p.sort % 100) : null);
const isStarter = (p) => {
  const d = depthOf(p);
  if (d == null) return false;
  return d <= (STARTER_DEPTH[String(p.pos || "").toUpperCase()] || 1);
};

// unit state lives in TeamDetail now so the stat tiles up top can react to
// the Offense/Defense toggle. lineRank = this team's OL/DL league ranks.
function FormationView({ roster, abbr, unit, setUnit, onSelectPlayer, lineRank }) {
  const SLOTS = unit === "offense" ? [
    { lbl: "WR", x: 11, y: 24, aliases: ["WR"] },
    { lbl: "WR", x: 89, y: 24, aliases: ["WR"] },
    { lbl: "WR", x: 22, y: 40, aliases: ["WR"] },
    { lbl: "TE", x: 82, y: 40, aliases: ["TE"] },
    { lbl: "LT", x: 16, y: 56, aliases: ["LT", "OT", "T"] },
    { lbl: "LG", x: 33, y: 56, aliases: ["LG", "G", "OG"] },
    { lbl: "C", x: 50, y: 56, aliases: ["C", "OC"] },
    { lbl: "RG", x: 67, y: 56, aliases: ["RG", "G", "OG"] },
    { lbl: "RT", x: 84, y: 56, aliases: ["RT", "OT", "T"] },
    { lbl: "QB", x: 50, y: 72, aliases: ["QB"] },
    { lbl: "RB", x: 50, y: 90, aliases: ["RB", "HB", "FB"] },
  ] : [
    { lbl: "DE", x: 14, y: 72, aliases: ["DE", "EDGE"] },
    { lbl: "DT", x: 38, y: 72, aliases: ["DT", "NT", "DL"] },
    { lbl: "DT", x: 62, y: 72, aliases: ["DT", "NT", "DL"] },
    { lbl: "DE", x: 86, y: 72, aliases: ["DE", "EDGE"] },
    { lbl: "LB", x: 26, y: 56, aliases: ["LB", "ILB", "MLB", "OLB"] },
    { lbl: "LB", x: 50, y: 56, aliases: ["LB", "ILB", "MLB", "OLB"] },
    { lbl: "LB", x: 74, y: 56, aliases: ["LB", "ILB", "MLB", "OLB"] },
    { lbl: "CB", x: 11, y: 40, aliases: ["CB", "DB"] },
    { lbl: "CB", x: 89, y: 40, aliases: ["CB", "DB"] },
    { lbl: "S", x: 33, y: 24, aliases: ["S", "FS", "SS"] },
    { lbl: "S", x: 67, y: 24, aliases: ["S", "FS", "SS"] },
  ];
  const used = new Set();
  // Slot filling, in priority order:
  //   1. Sort Priority label from Airtable ("RG1" -> RG slot, "WR2" -> 2nd WR
  //      slot) — this is the depth chart as the user maintains it, and it
  //      works even when Position says something generic like "OL".
  //   2. Position field, lowest sort value first (original behavior).
  const pick = (aliases) => {
    const lbl = (p) => String(p.sortLabel || "").toUpperCase();
    const depthNo = (p) => { const m = lbl(p).match(/(\d+)$/); return m ? Number(m[1]) : 1; };
    const byLabel = roster
      .filter((p) => !used.has(p.id) && aliases.some((a) => new RegExp("^" + a + "\\d*$").test(lbl(p))))
      .sort((a, b) => depthNo(a) - depthNo(b));
    const byPos = roster
      .filter((p) => !used.has(p.id) && aliases.includes(String(p.pos || "").toUpperCase()))
      .sort((a, b) => (a.sort ?? 9999) - (b.sort ?? 9999));
    const hit = byLabel[0] || byPos[0] || null;
    if (hit) used.add(hit.id);
    return hit;
  };
  // Ring scheme (no yellow — it collided with the gold 90+ OVR chip):
  //   emerald = Sleeper confirms healthy · orange = Questionable
  //   red = Doubtful · red + faded photo = Out/IR/PUP · slate = no Sleeper data
  const injOf = (p) => (p ? injFor(p.name, abbr) : null);
  const isOut = (inj) => !!inj && (inj.injury_status === "Out" || /injured reserve|pup|non football/i.test(String(inj.status || "")));
  const ringCls = (p) => {
    if (!p) return "border-white/40";
    const inj = injOf(p);
    if (!inj) return "border-slate-400";
    if (isOut(inj)) return "border-red-600";
    if (inj.injury_status === "Doubtful") return "border-red-500";
    if (inj.injury_status === "Questionable") return "border-orange-400";
    return "border-emerald-500";
  };
  return (
    <div className="mt-4">
      <div className="flex gap-2 mb-3">
        {[["offense", "Offense"], ["defense", "Defense"]].map(([k, lbl]) => (
          <button key={k} onClick={() => setUnit(k)}
            className={"flex-1 py-1.5 rounded-full text-[11px] font-extrabold " + (unit === k
              ? "text-white"
              : "bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-800")}
            style={unit === k ? { backgroundColor: teamColor(abbr) } : undefined}>
            {lbl}
          </button>
        ))}
      </div>
      <div className="relative rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 shadow-sm"
        style={{ paddingBottom: "118%", background: "repeating-linear-gradient(180deg,#1c7c40 0 9%,#166534 9% 18%)" }}>
        {/* subtle top-down light so it reads as turf, not a flat panel */}
        <div className="absolute inset-0" style={{ background: "linear-gradient(180deg,rgba(255,255,255,0.10) 0%,rgba(0,0,0,0) 30%,rgba(0,0,0,0.18) 100%)" }} />
        {/* end zone in team color */}
        <div className="absolute inset-x-0 top-0 flex items-center justify-center"
          style={{ height: "9%", background: teamColor(abbr), boxShadow: "inset 0 -6px 12px rgba(0,0,0,0.25)" }}>
          <span className="text-white/60 font-black text-[11px] tracking-[0.5em] pl-[0.5em] uppercase">{abbr}</span>
        </div>
        <div className="absolute inset-x-0 h-[2.5px] bg-white/90" style={{ top: "9%" }} />
        {/* faint team logo watermark at midfield */}
        {TEAM_LOGOS[abbr] && (
          <img src={TEAM_LOGOS[abbr]} alt="" className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-2/5 opacity-[0.09] pointer-events-none select-none" />
        )}
        {/* yard lines with numbers every other line */}
        {[18, 27, 36, 45, 54, 63, 72, 81, 90].map((y, i) => (
          <React.Fragment key={y}>
            <div className="absolute inset-x-0 h-px bg-white/45" style={{ top: y + "%" }} />
            {i % 2 === 1 && (
              <>
                <span className="absolute left-2 text-white/35 text-[9px] font-extrabold tabular-nums" style={{ top: y + "%", transform: "translateY(-50%)" }}>
                  {[10, 20, 30, 40][(i - 1) / 2]}
                </span>
                <span className="absolute right-2 text-white/35 text-[9px] font-extrabold tabular-nums" style={{ top: y + "%", transform: "translateY(-50%)" }}>
                  {[10, 20, 30, 40][(i - 1) / 2]}
                </span>
              </>
            )}
          </React.Fragment>
        ))}
        {/* hash marks */}
        {Array.from({ length: 19 }, (_, i) => 11.3 + i * 4.5).map((y) => (
          <React.Fragment key={y}>
            <div className="absolute w-1.5 h-px bg-white/30" style={{ left: "39%", top: y + "%" }} />
            <div className="absolute w-1.5 h-px bg-white/30" style={{ left: "59.5%", top: y + "%" }} />
          </React.Fragment>
        ))}
        {/* sidelines */}
        <div className="absolute inset-y-0 left-0 w-[3px] bg-white/60" />
        <div className="absolute inset-y-0 right-0 w-[3px] bg-white/60" />
        {/* line-unit rank pill: OL on offense, DL on defense */}
        {(() => {
          const lr = unit === "offense" ? lineRank?.ol : lineRank?.dl;
          if (!lr || lr.rank == null) return null;
          const tier = lr.rank <= 8 ? "bg-emerald-500 text-white"
            : lr.rank <= 20 ? "bg-slate-900/80 text-white"
            : "bg-rose-600 text-white";
          return (
            <div className={"absolute bottom-2 left-2 flex items-center gap-1.5 rounded-full pl-2 pr-2.5 py-1 text-[10px] font-extrabold shadow-md " + tier}>
              <span className="uppercase tracking-wide">{unit === "offense" ? "OL" : "DL"}</span>
              <span className="tabular-nums">#{lr.rank}</span>
              <span className="opacity-70 tabular-nums font-bold">{lr.avg.toFixed(1)} OVR</span>
            </div>
          );
        })()}
        {SLOTS.map((s, i) => {
          const p = pick(s.aliases);
          return (
            <button key={unit + i} disabled={!p} onClick={p ? () => onSelectPlayer(p) : undefined}
              className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center"
              style={{ left: s.x + "%", top: s.y + "%" }}>
              <span className="relative">
                {p && photoOf(p, abbr) ? (
                  <img src={photoOf(p, abbr)} alt="" loading="lazy"
                    className={"w-12 h-12 rounded-full object-cover bg-white border-[3px] shadow-md " + ringCls(p) + (isOut(injOf(p)) ? " grayscale opacity-70" : "")} />
                ) : (
                  <span className={"w-12 h-12 rounded-full flex items-center justify-center text-[10px] font-extrabold shadow-md border-[3px] " + ringCls(p) + (p ? " bg-white/90 text-slate-700" : " bg-white/20 text-white/70 border-dashed")}>
                    {s.lbl}
                  </span>
                )}
                {p && cleanNo(p.no) && (
                  <span className="absolute top-1/2 -translate-y-1/2 -left-2.5 px-1 rounded text-[8px] font-extrabold bg-white/85 text-slate-700 tabular-nums shadow">
                    #{cleanNo(p.no)}
                  </span>
                )}
                <span className={"absolute -bottom-1.5 left-1/2 -translate-x-1/2 px-1.5 rounded-full text-[9px] font-extrabold tabular-nums shadow " +
                  (p && p.rating2k != null
                    ? (Math.round(p.rating2k) >= 90 ? "bg-amber-400 text-slate-900"
                      : Math.round(p.rating2k) >= 85 ? "bg-emerald-500 text-white"
                      : Math.round(p.rating2k) >= 70 ? "bg-slate-900/85 text-white"
                      : "bg-rose-600 text-white")
                    : "bg-slate-900/85 text-white")}>
                  {p && p.rating2k != null ? (Math.round(p.rating2k) >= 90 ? "⭐" : "") + Math.round(p.rating2k) : s.lbl}
                </span>
              </span>
              <span className="mt-2 text-[9px] font-bold text-white/95 max-w-[70px] truncate drop-shadow">
                {p ? (() => {
                  const parts = p.name.split(" ");
                  return /^(jr\.?|sr\.?|ii|iii|iv|v)$/i.test(parts[parts.length - 1] || "")
                    ? parts.slice(-2).join(" ")
                    : parts.slice(-1)[0];
                })() : ""}
              </span>
            </button>
          );
        })}
      </div>
      <div className="text-[9px] text-slate-400 mt-2 px-1">Ring = health (green ok · orange Questionable · red Doubtful · red+faded Out/IR · gray no data) · chip = OVR · pill = line rank vs NFL · tap for profile</div>
    </div>
  );
}

function injHasFlag(p, team) {
  const inj = injFor(p.name, team);
  return !!(inj && (inj.injury_status || !/^active$/i.test(String(inj.status || ""))));
}
function LiveStatus({ p, team }) {
  return injHasFlag(p, team)
    ? <InjBadge p={p} team={team} />
    : <StatusBadge status={p.status} />;
}

function ListHeader({ title, q, setQ, placeholder }) {
  return (
    <div className="bg-blue-600 px-5 pb-5 text-white sticky top-0 z-10 shadow-md" style={{ paddingTop: "calc(env(safe-area-inset-top) + 1.5rem)" }}>
      <div className="text-2xl font-extrabold tracking-tight">{title}</div>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={placeholder || "Search players or teams…"}
        className="mt-3 w-full rounded-xl px-4 py-2.5 text-sm text-slate-800 dark:text-slate-200 bg-white/95 dark:bg-slate-900/80 placeholder-slate-400 outline-none"
      />
    </div>
  );
}

// Populated once data loads: abbr -> logo URL
const TEAM_LOGOS = {};

function TeamPill({ team }) {
  const abbr = toAbbr(team) || team;
  if (!abbr) return null;
  const logo = TEAM_LOGOS[abbr];
  if (logo) {
    return <img src={logo} alt={abbr} className="w-8 h-8 rounded-full object-contain bg-white shrink-0" />;
  }
  return (
    <span className="text-[10px] font-bold text-white px-2 py-1 rounded-full shrink-0" style={{ backgroundColor: teamColor(abbr) }}>
      {abbr}
    </span>
  );
}

// ═══════════════ TAB: PLAYER HUB ═════════════════════════════════
function PlayersTab({ players, onSelect }) {
  const [q, setQ] = useState("");
  const [injOnly, setInjOnly] = useState(false);
  const list = useMemo(
    () => players
      .filter((p) => matchesQuery(p, q))
      .filter((p) => !injOnly || (() => {
        const inj = injFor(p.name, toAbbr(teamOfPlayer(p) || p.teamName || ""));
        return inj && (inj.injury_status || !/^active$/i.test(String(inj.status || "")));
      })()),
    [players, q, injOnly]
  );
  return (
    <div>
      <ListHeader title={<>Players <span className="text-[10px] font-bold text-white/50 align-middle">{NFL_VERSION}</span></>} q={q} setQ={setQ} />
      <div className="flex px-4 mt-3">
        <button onClick={() => setInjOnly((v) => !v)}
          className={"py-1.5 px-4 rounded-full text-[11px] font-extrabold " + (injOnly
            ? "bg-rose-600 text-white"
            : "bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-300 border border-slate-200 dark:border-slate-800")}>
          🏥 Injury Report
        </button>
      </div>
      <div className="px-4 pb-28 mt-4">
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
          {list.map((p) => (
            <button key={p.id} onClick={() => onSelect(p)} className="w-full flex items-center gap-3 px-4 py-3 text-left active:bg-slate-50 dark:active:bg-slate-800">
              <span className="w-7 text-center text-[11px] font-extrabold text-slate-400 uppercase shrink-0">{p.pos || "—"}</span>
              <Avatar p={p} />
              <span className="flex-1 min-w-0">
                <span className="flex items-center gap-1.5 text-sm font-bold text-slate-900 dark:text-slate-100">
                  <span className="truncate">{p.name}</span>
                  <InjBadge p={p} team={toAbbr(teamOfPlayer(p) || p.teamName || "")} />
                </span>
                <span className="block text-[11px] text-slate-400 font-medium truncate">
                  {[p.height, p.weight, p.age ? p.age + " yrs" : ""]
                    .filter(Boolean)
                    .join(" · ") || "—"}
                </span>
                {(p.rating2k != null || p.archetype) && (
                  <span className="flex items-center gap-1.5 mt-1 min-w-0">
                    <Rating2kBadge r={p.rating2k} />
                    {p.archetype && <span className="text-[10px] font-semibold text-slate-400 truncate">{p.archetype}</span>}
                  </span>
                )}
              </span>
              <TeamPill team={teamOfPlayer(p) || p.teamName || activeOf(p)?.team} />
            </button>
          ))}
          {list.length === 0 && faOnly && <div className="text-center text-sm text-slate-400 py-12 px-6">No events for the {startYear(CURRENT_SEASON) + 1} offseason yet. Add UFA/RFA rows or option years in Contract Years.</div>}
          {list.length === 0 && !faOnly && <div className="text-center text-sm text-slate-400 py-12">No players match "{q}".</div>}
        </div>
      </div>
    </div>
  );
}

// ═══════════════ TAB: CONTRACTS ══════════════════════════════════

// Upcoming free agency: the earliest UFA/RFA year at/after the current season
function faStatus(p) {
  let best = null;
  for (const c of p.contracts || []) {
    for (const y of c.years || []) {
      const t = String(y.type || "").toUpperCase();
      if (t !== "UFA" && t !== "RFA") continue;
      if (String(y.season) < CURRENT_SEASON) continue;
      if (!best || String(y.season) < String(best.season)) best = { type: t, season: y.season };
    }
  }
  if (!best) return null;
  const yr = String(best.season).slice(0, 4); // "2026-2027" -> hits market summer 2026
  return { ...best, label: best.type + " " + yr };
}


function Rating2kBadge({ r }) {
  if (r == null) return null;
  const n = Math.round(r);
  const cls =
    n >= 90 ? "bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300"        // superstar
    : n >= 85 ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300" // great
    : n >= 70 ? "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300"          // solid
    : "bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300";                    // liability
  return (
    <span className={"shrink-0 px-1.5 py-0.5 rounded-full text-[9px] font-extrabold " + cls}>
      {n >= 90 ? "⭐ " : ""}{n} OVR
    </span>
  );
}

// Next contract event: earliest pending PO/TO or upcoming UFA/RFA on the active deal

// First year of a season string: "2026-2027" | "2026-27" -> 2026
function startYear(s) {
  const m = String(s || "").match(/(\d{4})/);
  return m ? Number(m[1]) : null;
}

function nextEvent(p) {
  let best = null;
  for (const c of p.contracts || []) {
    if (String(c.status).toLowerCase() === "expired") continue; // blank status still counts
    for (const y of c.years || []) {
      if (startYear(y.season) != null && startYear(y.season) < startYear(CURRENT_SEASON)) continue;
      const t = String(y.type || "").toUpperCase();
      let kind = null;
      if ((t === "PO" || t === "TO") && !y.decision) kind = t;
      else if (t === "UFA" || t === "RFA") kind = t;
      if (!kind) continue;
      if (!best || String(y.season) < String(best.season)) best = { kind, season: y.season };
    }
  }
  if (!best) return null;
  return { ...best, label: best.kind + " " + String(best.season).slice(0, 4) };
}

const EVENT_WORDS = { PO: "Player Option", TO: "Team Option", UFA: "Free Agent", RFA: "Restricted FA" };
const EVENT_COLORS = {
  PO: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300",
  TO: "bg-red-100 text-red-600 dark:bg-red-900/50 dark:text-red-300",
  UFA: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
  RFA: "bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300",
};

function EventPill({ ev }) {
  if (!ev) return null;
  const cls = EVENT_COLORS[ev.kind] || EVENT_COLORS.UFA;
  return (
    <span className={"inline-flex shrink-0 px-1.5 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wide " + cls}>
      {EVENT_WORDS[ev.kind] || ev.kind} {seasonTick({ season: ev.season })}
    </span>
  );
}


// The season after the current one - "2025-2026" -> "2026-2027". Rolls forward with CURRENT_SEASON.
function nextSeason(s) {
  const m = String(s).match(/(\d{4})\s*-\s*(\d{4})/);
  if (!m) return null;
  return (Number(m[1]) + 1) + "-" + (Number(m[2]) + 1);
}

function ContractsTab({ players, onSelect }) {
  const [q, setQ] = useState("");
  const [faOnly, setFaOnly] = useState(false);
  const list = useMemo(
    () =>
      players
        .filter((p) => p.contracts.length > 0)
        .filter((p) => matchesQuery(p, q))
        .filter((p) => {
          if (!faOnly) return true;
          const ev = nextEvent(p);                       // UFA, RFA, player + team options
          return ev && startYear(ev.season) === startYear(CURRENT_SEASON) + 1;
        })
        .slice()
        .sort((x, y) => {
          if (faOnly) {
            const rank = { UFA: 0, RFA: 1, PO: 2, TO: 3 };
            const ex = nextEvent(x), ey = nextEvent(y);
            const rx = rank[ex?.kind] ?? 9, ry = rank[ey?.kind] ?? 9;
            if (rx !== ry) return rx - ry;              // free agents first, then options
          }
          const sx = currentSalary(x), sy = currentSalary(y);
          if (sy !== sx) return sy - sx;               // biggest current-season salary first
          return x.name.localeCompare(y.name);          // $0 group: alphabetical
        }),
    [players, q, faOnly]
  );
  return (
    <div>
      <ListHeader title="Contracts" q={q} setQ={setQ} />
      <div className="px-4 mt-3 flex gap-2">
        {[["All", false], ["Free Agency " + (startYear(CURRENT_SEASON) + 1), true]].map(([lbl, v]) => (
          <button key={lbl} onClick={() => setFaOnly(v)}
            className={"px-4 py-1.5 rounded-full text-xs font-bold " + (faOnly === v
              ? "bg-blue-600 text-white"
              : "bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-800")}>
            {lbl}
          </button>
        ))}
      </div>
      <div className="px-4 pb-28 mt-4">
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
          {list.map((p) => {
            const act = activeOf(p);
            return (
              <button key={p.id} onClick={() => onSelect(p)} className="w-full flex items-center gap-3 px-4 py-3 text-left active:bg-slate-50 dark:active:bg-slate-800">
                <Avatar p={p} />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-bold text-slate-900 dark:text-slate-100 truncate">{p.name}</span>
                  <span className="block text-[11px] text-slate-400 font-medium truncate">
                    {act ? displayLine(act) : "No contract"}
                  </span>
                  {nextEvent(p) && (
                    <span className="block mt-1"><EventPill ev={nextEvent(p)} /></span>
                  )}
                </span>
                {currentSalary(p) > 0 && (
                  <span className="text-xs font-extrabold text-slate-700 dark:text-slate-200 shrink-0">{fmtM(currentSalary(p))}</span>
                )}
                <TeamPill team={teamOfPlayer(p) || act?.team} />
              </button>
            );
          })}
          {list.length === 0 && <div className="text-center text-sm text-slate-400 py-12">No players match "{q}".</div>}
        </div>
      </div>
    </div>
  );
}


// ═══════════════ TAB: TEAMS ══════════════════════════════════════
function teamOfPlayer(p) {
  return toAbbr(p.teamName) || (activeOf(p) ? toAbbr(activeOf(p).team) || activeOf(p).team : "");
}

function currentSalary(p) {
  const act = activeOf(p);
  if (!act) return 0;
  const yr = act.years.find((y) => y.season === CURRENT_SEASON && y.salary != null);
  if (yr) return yr.salary;
  const first = salaried(act)[0];
  return first ? first.salary : 0;
}

const ROLE_ORDER = ["Offense", "Offensive Line", "Defense", "Defensive Line", "Special Teams"];
// Position -> unit. Position wins over the Role field so an OT always rolls
// up to Offensive Line; Role is the fallback for unknown positions.
const POS_UNIT = {};
for (const p of ["QB", "RB", "FB", "HB", "WR", "TE"]) POS_UNIT[p] = "Offense";
for (const p of ["LT", "LG", "C", "RG", "RT", "OT", "OG", "G", "OL"]) POS_UNIT[p] = "Offensive Line";
for (const p of ["DE", "DT", "NT", "EDGE", "DL"]) POS_UNIT[p] = "Defensive Line";
for (const p of ["LB", "ILB", "OLB", "MLB", "CB", "S", "FS", "SS", "DB"]) POS_UNIT[p] = "Defense";
for (const p of ["K", "P", "LS", "KR", "PR"]) POS_UNIT[p] = "Special Teams";
function unitOf(p) {
  const pos = String(p.pos || "").toUpperCase().trim();
  if (POS_UNIT[pos]) return POS_UNIT[pos];
  if (ROLE_ORDER.includes(p.role)) return p.role;
  return "Roster";
}

const ORDINALS = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th", "10th"];

function winPct(t) {
  const w = t.wins ?? 0, l = t.losses ?? 0;
  return w + l > 0 ? w / (w + l) : -1;
}

function TeamsTab({ teams, players, onSelect }) {
  const [q, setQ] = useState("");
  const [conf, setConf] = useState("all"); // all | east | west
  const [div, setDiv] = useState(null);    // division name or null
  const s = q.toLowerCase().trim();
  // Direct team-name matches, plus teams of any player whose name matches -
  // searching "Brunson" surfaces the Knicks.
  const playerTeamAbbrs = new Set(
    s
      ? players
          .filter((p) => p.name.toLowerCase().includes(s))
          .map((p) => teamOfPlayer(p))
          .filter(Boolean)
      : []
  );
  const confOf = (t) => {
    const c = String(t.conference).toLowerCase();
    return c.startsWith("afc") ? "afc" : c.startsWith("nfc") ? "nfc" : "other";
  };
  // Divisional rank across ALL teams (unaffected by search/filters)
  const divRank = {};
  {
    const byDiv = {};
    for (const t of teams) { if (t.division) (byDiv[t.division] ??= []).push(t); }
    for (const arr of Object.values(byDiv)) {
      arr.sort((a, b) => winPct(b) - winPct(a) || (b.wins ?? 0) - (a.wins ?? 0));
      arr.forEach((t, i) => { divRank[t.id] = ORDINALS[i] || `${i + 1}th`; });
    }
  }
  const divisions = conf === "all" ? [] :
    [...new Set(teams.filter((t) => confOf(t) === conf).map((t) => t.division).filter(Boolean))].sort();
  let list = teams.filter((t) => {
    if (conf !== "all" && confOf(t) !== conf) return false;
    if (div && t.division !== div) return false;
    if (!s) return true;
    if ((t.name + " " + t.abbr).toLowerCase().includes(s)) return true;
    const abbr = t.abbr || toAbbr(t.name);
    return playerTeamAbbrs.has(abbr);
  });
  list = [...list].sort((a, b) =>
    conf === "all"
      ? String(a.name).localeCompare(String(b.name))
      : winPct(b) - winPct(a) || (b.wins ?? 0) - (a.wins ?? 0)
  );
  const pickConf = (k) => { setConf(k); setDiv(null); };
  return (
    <div>
      <ListHeader title="Teams" q={q} setQ={setQ} placeholder="Search teams or players…" />
      <div className="px-4 pb-28">
        <div className="flex gap-2 mt-4">
          {[["all", "All"], ["afc", "AFC"], ["nfc", "NFC"]].map(([k, lbl]) => (
            <button key={k} onClick={() => pickConf(k)}
              className={"flex-1 py-2 rounded-full text-xs font-bold transition-colors " + (conf === k
                ? "bg-blue-600 text-white"
                : "bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-800")}>
              {lbl}
            </button>
          ))}
        </div>
        {divisions.length > 0 && (
          <div className="flex gap-2 mt-2 overflow-x-auto no-scrollbar">
            {divisions.map((d) => (
              <button key={d} onClick={() => setDiv(div === d ? null : d)}
                className={"px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap transition-colors " + (div === d
                  ? "bg-blue-600 text-white"
                  : "bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-800")}>
                {d}
              </button>
            ))}
          </div>
        )}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden mt-4">
          {list.map((t) => {
            const abbr = t.abbr || toAbbr(t.name);
            return (
              <button key={t.id} onClick={() => onSelect(t)} className="w-full flex items-center gap-3 px-4 py-3 text-left active:bg-slate-50 dark:active:bg-slate-800">
                {t.logo ? (
                  <img src={t.logo} alt="" className="w-11 h-11 rounded-full object-contain bg-white shrink-0" />
                ) : (
                  <span className="w-11 h-11 rounded-full shrink-0" style={{ backgroundColor: teamColor(abbr) }} />
                )}
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-bold text-slate-900 dark:text-slate-100 truncate">{t.name}</span>
                  <span className="block text-[11px] text-slate-400 font-medium truncate">
                    {t.division ? (divRank[t.id] ? `${divRank[t.id]} in ${t.division}` : t.division) : "—"}
                  </span>
                </span>
                {(() => { const r = teamRec(t, seasonStarted(teams)); return (r.w + r.l + r.t) >= 0; })() && (
                  <span className="flex gap-2.5 shrink-0">
                    {(() => { const r = teamRec(t, seasonStarted(teams)); return [["W", r.w], ["L", r.l], ["T", r.t]]; })().map(([lbl, v]) => (
                      <span key={lbl} className="w-7 text-center">
                        <span className="block text-[8px] font-bold text-slate-400 uppercase">{lbl}</span>
                        <span className="block text-xs font-extrabold text-slate-800 dark:text-slate-100 tabular-nums">{v}</span>
                      </span>
                    ))}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {list.length === 0 && <div className="text-center text-sm text-slate-400 py-12">No teams match{q ? ` "${q}"` : " the selected filters"}.</div>}
      </div>
    </div>
  );
}


function StatusBadge({ status }) {
  if (!status) return null;
  const s = String(status).toLowerCase().trim();
  let cls = "bg-slate-100 text-slate-500 dark:text-slate-400";
  if (s === "ir" || s.includes("injured reserve") || s.includes("out")) cls = "bg-red-100 text-red-600 dark:bg-red-900/50 dark:text-red-300";
  else if (s.includes("active") || s.includes("available")) cls = "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300";
  else if (s.includes("injur") || s.includes("day") || s.includes("question") || s.includes("doubt")) cls = "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300";
  return (
    <span className={"shrink-0 px-1.5 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wide " + cls}>
      {status}
    </span>
  );
}


// Committed salary for a player in a given season (active deals only)
function salaryInSeason(p, season) {
  for (const c of p.contracts || []) {
    if (c.status !== "Active") continue;
    for (const y of c.years || []) {
      if (y.season === season && y.salary != null) return { salary: y.salary, type: y.type, decision: y.decision };
    }
  }
  return null;
}
function seasonsAhead(n) {
  const out = [CURRENT_SEASON];
  for (let i = 1; i < n; i++) out.push(nextSeason(out[i - 1]));
  return out.filter(Boolean);
}
const LINE_COLORS = ["#2563eb", "#16a34a", "#dc2626", "#9333ea", "#f59e0b", "#0891b2"];

// League-wide OL/DL rankings from Madden OVRs: average of the top-5 offensive
// linemen and top-4 defensive linemen per team (typical starting fronts).
// Needs 3+ rated players to count — thin data shouldn't produce a fake rank.
const OL_POS = new Set(["LT", "LG", "C", "RG", "RT", "OT", "OG", "G", "OC", "OL"]);
const DL_POS = new Set(["DE", "DT", "NT", "EDGE", "DL"]);
function computeLineRanks(players, teams) {
  const per = {};
  for (const t of teams || []) {
    const a = t.abbr || toAbbr(t.name);
    if (!a) continue;
    const roster = players.filter((p) => (p.teamId && p.teamId === t.id) || teamOfPlayer(p) === a);
    const avgTop = (posSet, n) => {
      const rated = roster
        .filter((p) => posSet.has(String(p.pos || "").toUpperCase()) && p.rating2k != null)
        .map((p) => Number(p.rating2k))
        .sort((x, y) => y - x)
        .slice(0, n);
      return rated.length >= 3 ? rated.reduce((s, v) => s + v, 0) / rated.length : null;
    };
    per[a] = { ol: { avg: avgTop(OL_POS, 5) }, dl: { avg: avgTop(DL_POS, 4) } };
  }
  for (const key of ["ol", "dl"]) {
    const ranked = Object.entries(per)
      .filter(([, v]) => v[key].avg != null)
      .sort((x, y) => y[1][key].avg - x[1][key].avg);
    ranked.forEach(([a], i) => { per[a][key].rank = i + 1; });
  }
  return per;
}

function TeamDetail({ team, teams, players, onBack, onSelectPlayer }) {
  useEffect(() => { window.scrollTo(0, 0); }, []);
  const abbr = team.abbr || toAbbr(team.name);
  const [seg, setSeg] = useState("roster");
  const [unit, setUnit] = useState("offense"); // lifted from FormationView so tiles can react
  const lineRanks = useMemo(() => computeLineRanks(players, teams), [players, teams]);
  const [roleFilter, setRoleFilter] = useState(null);
  const [chartMode, setChartMode] = useState("cap");
  const [capSeason, setCapSeason] = useState(null);
  const roster = players.filter((p) => {
    if (p.teamId && p.teamId === team.id) return true; // exact Airtable link - no naming needed
    const t = teamOfPlayer(p);
    return t && (t === abbr || String(p.teamName).toLowerCase() === String(team.name).toLowerCase());
  });
  const payroll = roster.reduce((a, p) => a + currentSalary(p), 0);

  const groups = {};
  for (const p of roster) {
    const role = unitOf(p);
    (groups[role] ??= []).push(p);
  }
  const orderedRoles = [...ROLE_ORDER.filter((r) => groups[r]), ...(groups["Roster"] ? ["Roster"] : [])];

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 pb-24">
      <div className="px-5 pb-6 text-white" style={{ backgroundColor: teamColor(abbr), paddingTop: "calc(env(safe-area-inset-top) + 1.25rem)" }}>
        <button onClick={onBack} className="text-sm font-semibold opacity-80 mb-4">‹ Teams</button>
        <div className="flex items-center gap-4">
          {team.logo ? (
            <img src={team.logo} alt="" className="w-16 h-16 rounded-full object-contain bg-white shrink-0" />
          ) : (
            <span className="text-3xl">🏈</span>
          )}
          <div className="min-w-0">
            <div className="text-2xl font-extrabold leading-tight truncate">
              {team.name}
              {(() => {
                // Record lives next to the name now (freed the tile up top).
                // teamRec already drops the tie unless there is one.
                const r = teamRec(team, seasonStarted(teams));
                return (r.w + r.l + r.t) > 0
                  ? <span className="ml-2 text-base font-bold opacity-80 tabular-nums align-middle">({r.str})</span>
                  : null;
              })()}
            </div>
            <div className="text-sm opacity-80 font-medium mt-0.5 truncate">
              {(() => {
                if (!team.division) return [team.conference].filter(Boolean).join(" · ") || "—";
                const rivals = (teams || []).filter((t) => t.division === team.division)
                  .sort((a, b) => winPct(b) - winPct(a) || (b.wins ?? 0) - (a.wins ?? 0));
                const i = rivals.findIndex((t) => t.id === team.id);
                const ord = i >= 0 ? (ORDINALS[i] || `${i + 1}th`) : null;
                return ord ? `${ord} in ${team.division}` : team.division;
              })()}
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 -mt-3">
        <div className="grid grid-cols-3 gap-2">
          {(() => {
            const started = seasonStarted(teams);
            const pts = teamPts(team, started);
            const sx = team.stx || {}; // per-team stats merged from /api/standings
            // Rank suffix, colored by tier so good/bad reads at a glance
            const rk = (rank) => rank == null ? null
              : <span className={rank <= 10 ? "text-green-600 dark:text-green-400" : rank <= 22 ? "text-slate-400" : "text-red-500 dark:text-red-400"}>#{rank} NFL</span>;
            if (seg === "formation" && unit === "offense") {
              return (
                <>
                  <Tile value={sx.passYpg != null ? sx.passYpg.toFixed(1) : "—"} label="Pass Yds/G" sub={rk(sx.passYpgRank)} />
                  <Tile value={sx.rushYpg != null ? sx.rushYpg.toFixed(1) : "—"} label="Rush Yds/G" sub={rk(sx.rushYpgRank)} />
                  <Tile value={sx.offTd != null ? sx.offTd : "—"} label="Off TDs" sub={rk(sx.offTdRank)} />
                </>
              );
            }
            if (seg === "formation" && unit === "defense") {
              return (
                <>
                  <Tile value={sx.passYpgAllowed != null ? sx.passYpgAllowed.toFixed(1) : "—"} label="Pass Yds/G Alwd" sub={rk(sx.passYpgAllowedRank)} />
                  <Tile value={sx.rushYpgAllowed != null ? sx.rushYpgAllowed.toFixed(1) : "—"} label="Rush Yds/G Alwd" sub={rk(sx.rushYpgAllowedRank)} />
                  <Tile value={pts.pa != null ? Math.round(pts.pa) : "—"} label="Points Allowed" sub={rk(sx.paRank)} />
                </>
              );
            }
            const diff = pts.pf != null && pts.pa != null ? Math.round(pts.pf - pts.pa) : null;
            return (
              <>
                <Tile value={pts.pf != null ? Math.round(pts.pf) : "—"} label="Points Scored"
                  sub={team.ppg != null ? team.ppg.toFixed(1) + "/gm" : null} />
                <Tile value={pts.pa != null ? Math.round(pts.pa) : "—"} label="Points Allowed"
                  sub={team.oppPpg != null ? team.oppPpg.toFixed(1) + "/gm" : null} />
                <Tile value={diff != null ? (diff > 0 ? "+" + diff : String(diff)) : "—"} label="Point Diff"
                  valueClass={diff == null ? null : diff > 0 ? "text-emerald-600 dark:text-emerald-400" : diff < 0 ? "text-red-600 dark:text-red-400" : null} />
              </>
            );
          })()}
        </div>

        <div className="flex gap-2 mt-4">
          {[["roster", "Roster"], ["formation", "Formation"], ["contracts", "Contracts"], ["charts", "Charts"]].map(([k, lbl]) => (
            <button key={k} onClick={() => setSeg(k)}
              className={"flex-1 py-2 rounded-full text-xs font-bold transition-colors " + (seg === k
                ? "text-white"
                : "bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-800")}
              style={seg === k ? { backgroundColor: teamColor(abbr) } : undefined}>
              {lbl}
            </button>
          ))}
        </div>

        {seg === "roster" && (
          <div className="flex gap-2 mt-4 overflow-x-auto no-scrollbar">
            {ROLE_ORDER.map((r) => (
              <button key={r} onClick={() => setRoleFilter(roleFilter === r ? null : r)}
                className={"px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap transition-colors " + (roleFilter === r
                  ? "text-white"
                  : "bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-800")}
                style={roleFilter === r ? { backgroundColor: teamColor(abbr) } : undefined}>
                {r}
              </button>
            ))}
          </div>
        )}
        {seg === "roster" && orderedRoles.filter((role) => !roleFilter || role === roleFilter).map((role) => (
          <div key={role}>
            <div className="text-[11px] font-bold tracking-widest text-slate-400 uppercase mt-6 mb-2 px-1">{role}</div>
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
              {(() => {
                const sorted = groups[role].slice().sort((a, b) => {
                  if (a.sort != null && b.sort != null) return a.sort - b.sort;
                  if (a.sort != null) return -1;
                  if (b.sort != null) return 1;
                  return currentSalary(b) - currentSalary(a);
                });
                const starters = sorted.filter(isStarter);
                const bench = sorted.filter((p) => !isStarter(p));
                const withHeaders = [];
                if (starters.length) withHeaders.push({ __hdr: "Starters" }, ...starters);
                if (bench.length) withHeaders.push({ __hdr: "Bench" }, ...bench);
                return withHeaders;
              })()
                .map((p) => p.__hdr ? (
                  <div key={"hdr-" + p.__hdr} className="px-4 py-1.5 text-[9px] font-extrabold tracking-widest uppercase text-slate-400 bg-slate-50 dark:bg-slate-800/60">{p.__hdr}</div>
                ) : (
                  <button key={p.id} onClick={() => onSelectPlayer(p)} className="w-full flex items-center gap-3 px-4 py-3 text-left active:bg-slate-50 dark:active:bg-slate-800">
                    <span className="w-7 text-center text-[11px] font-extrabold text-slate-400 uppercase shrink-0">{p.pos || "—"}</span>
                    <Avatar p={p} />
                    <span className="flex-1 min-w-0">
                      <span className="flex items-center gap-2">
                        <span className="flex-1 min-w-0 text-sm font-bold text-slate-900 dark:text-slate-100 truncate">{p.name}</span>
                        {p.rating2k != null && <Rating2kBadge r={p.rating2k} />}
                      </span>
                      <span className="flex items-center gap-1.5 mt-0.5">
                        {cleanNo(p.no) && <span className="text-[11px] text-slate-400 font-medium">#{cleanNo(p.no)}</span>}
                        <LiveStatus p={p} team={abbr} />
                        <span className="flex-1" />
                        {(() => {
                          const st = latestStats(p);
                          if (st && (st.yds != null || st.td != null || st.tkl != null)) {
                            return (
                              <span className="flex gap-2 shrink-0">
                                {[["G", st.gp != null ? String(Math.round(st.gp)) : null], ["YDS", st.yds != null ? String(Math.round(st.yds)) : null], ["TD", st.td != null ? String(Math.round(st.td)) : null], ["TKL", st.tkl != null ? String(Math.round(st.tkl)) : null]].map(([lbl, v]) => (
                                  <span key={lbl} className="w-7 text-center">
                                    <span className="block text-[8px] font-bold text-slate-400 uppercase">{lbl}</span>
                                    <span className="block text-[11px] font-extrabold text-slate-800 dark:text-slate-100 tabular-nums">{v ?? "—"}</span>
                                  </span>
                                ))}
                              </span>
                            );
                          }
                          return currentSalary(p) > 0 ? (
                            <span className="text-xs font-extrabold text-slate-600 dark:text-slate-300 shrink-0">{fmtM(currentSalary(p))}</span>
                          ) : null;
                        })()}
                      </span>
                      {p.injuryNotes && (
                        <span className="block text-[11px] font-semibold text-red-500 truncate mt-0.5">{p.injuryNotes}</span>
                      )}
                    </span>
                  </button>
                ))}
            </div>
          </div>
        ))}
        {seg === "formation" && <FormationView roster={roster} abbr={abbr} unit={unit} setUnit={setUnit} onSelectPlayer={onSelectPlayer} lineRank={lineRanks[abbr]} />}
        {seg === "contracts" && (
          <>
            <div className="flex items-baseline justify-between mt-6 mb-2 px-1">
              <span className="text-[11px] font-bold tracking-widest text-slate-400 uppercase">Team Contracts</span>
              <span className="text-[11px] font-bold text-green-600 dark:text-green-400">{fmtM(payroll)} payroll</span>
            </div>
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
              {roster
                .slice()
                .sort((a, b) => currentSalary(b) - currentSalary(a) || a.name.localeCompare(b.name))
                .map((p) => {
                  const act = activeOf(p);
                  return (
                    <button key={p.id} onClick={() => onSelectPlayer(p)} className="w-full flex items-center gap-3 px-4 py-3 text-left active:bg-slate-50 dark:active:bg-slate-800">
                      <Avatar p={p} />
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-bold text-slate-900 dark:text-slate-100 truncate">{p.name}</span>
                        <span className="block text-[11px] text-slate-400 font-medium truncate">
                          {act ? (act.terms || displayLine(act)) : "No contract"}
                        </span>
                        {nextEvent(p) && (
                          <span className="block mt-1"><EventPill ev={nextEvent(p)} /></span>
                        )}
                      </span>
                      <span className="text-xs font-extrabold text-slate-700 dark:text-slate-200 shrink-0">
                        {currentSalary(p) > 0 ? fmtM(currentSalary(p)) : "—"}
                      </span>
                    </button>
                  );
                })}
              {roster.length === 0 && <div className="text-center text-sm text-slate-400 py-10">No players linked yet.</div>}
            </div>
          </>
        )}

        {seg === "charts" && (() => {
          const seasons = seasonsAhead(5);
          return (
            <>
              <div className="flex gap-2 mt-4">
                {[["cap", "Cap Outlook"], ["timeline", "Timeline"], ["trends", "Trends"]].map(([k, lbl]) => (
                  <button key={k} onClick={() => setChartMode(k)}
                    className={"flex-1 py-1.5 rounded-full text-[11px] font-bold " + (chartMode === k
                      ? "bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900"
                      : "bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-800")}>
                    {lbl}
                  </button>
                ))}
              </div>

              {chartMode === "cap" && (() => {
                const totals = seasons.map((s) => ({
                  season: s,
                  rows: roster
                    .map((p) => ({ p, y: salaryInSeason(p, s) }))
                    .filter((x) => x.y)
                    .sort((a, b) => b.y.salary - a.y.salary),
                }));
                const max = Math.max(...totals.map((t) => t.rows.reduce((a, r) => a + r.y.salary, 0)), 1);
                const selT = totals.find((t) => t.season === capSeason) || null;
                return (
                  <>
                    <div className="text-[11px] font-bold tracking-widest text-slate-400 uppercase mt-6 mb-2 px-1">Committed Payroll by Season</div>
                    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-4">
                      <div className="flex items-end gap-2 h-36">
                        {totals.map((t) => {
                          const sum = t.rows.reduce((a, r) => a + r.y.salary, 0);
                          const active = capSeason === t.season;
                          return (
                            <button key={t.season} onClick={() => setCapSeason(active ? null : t.season)} className="flex-1 flex flex-col items-center justify-end h-full">
                              <div className="text-[10px] font-bold text-slate-700 dark:text-slate-200 mb-1 tabular-nums">{sum > 0 ? fmtM(sum) : "—"}</div>
                              <div className={"w-full rounded-t-md " + (active ? "opacity-100" : "opacity-80")}
                                style={{ backgroundColor: active ? "#1d4ed8" : "#2563eb", height: Math.max((sum / max) * 100, sum > 0 ? 6 : 2) + "%" }} />
                              <div className={"text-[10px] font-semibold mt-1 whitespace-nowrap " + (active ? "text-blue-600 dark:text-blue-400" : "text-slate-400")}>{seasonTick({ season: t.season })}</div>
                            </button>
                          );
                        })}
                      </div>
                      <div className="text-[10px] text-slate-400 text-center mt-2">Tap a season for the breakdown</div>
                    </div>
                    {selT && (
                      <>
                        <div className="text-[11px] font-bold tracking-widest text-slate-400 uppercase mt-5 mb-2 px-1">{selT.season} · {selT.rows.length} players</div>
                        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
                          {selT.rows.map(({ p, y }) => (
                            <button key={p.id} onClick={() => onSelectPlayer(p)} className="w-full flex items-center gap-3 px-4 py-2.5 text-left active:bg-slate-50 dark:active:bg-slate-800">
                              <Avatar p={p} />
                              <span className="flex-1 min-w-0">
                                <span className="block text-sm font-bold text-slate-900 dark:text-slate-100 truncate">{p.name}</span>
                              </span>
                              {(y.type === "PO" || y.type === "TO") && !y.decision && (
                                <span className={"px-1.5 py-0.5 rounded-full text-[9px] font-extrabold uppercase " + (y.type === "PO" ? EVENT_COLORS.PO : EVENT_COLORS.TO)}>
                                  {y.type === "PO" ? "Player Option" : "Team Option"}
                                </span>
                              )}
                              <span className="text-xs font-extrabold text-slate-700 dark:text-slate-200 shrink-0 tabular-nums">{fmtM(y.salary)}</span>
                            </button>
                          ))}
                          {selT.rows.length === 0 && <div className="text-center text-sm text-slate-400 py-8">No committed salary.</div>}
                        </div>
                      </>
                    )}
                  </>
                );
              })()}

              {chartMode === "timeline" && (() => {
                const rows = roster
                  .map((p) => ({ p, cells: seasons.map((s) => salaryInSeason(p, s) || (faStatus(p) && faStatus(p).season === s ? { fa: true } : null)) }))
                  .filter((r) => r.cells.some(Boolean))
                  .sort((a, b) => currentSalary(b.p) - currentSalary(a.p));
                return (
                  <>
                    <div className="text-[11px] font-bold tracking-widest text-slate-400 uppercase mt-6 mb-2 px-1">Contract Timeline</div>
                    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="w-20 shrink-0" />
                        {seasons.map((s) => (
                          <span key={s} className="flex-1 text-center text-[9px] font-bold text-slate-400">{"'" + String(s).slice(2, 4)}</span>
                        ))}
                      </div>
                      {rows.map(({ p, cells }) => (
                        <button key={p.id} onClick={() => onSelectPlayer(p)} className="w-full flex items-center gap-2 py-1.5 text-left">
                          <span className="w-20 shrink-0 text-[11px] font-bold text-slate-700 dark:text-slate-200 truncate">{p.name}</span>
                          {cells.map((c, i) => (
                            <span key={i} className="flex-1 h-3 rounded-sm" style={{
                              backgroundColor: !c ? "transparent"
                                : c.fa ? "#94a3b8"
                                : BAR_COLORS[c.type] || BAR_COLORS.G,
                              opacity: c && c.fa ? 0.35 : 1,
                              border: !c ? "1px dashed rgba(148,163,184,0.25)" : "none",
                            }} />
                          ))}
                        </button>
                      ))}
                      {rows.length === 0 && <div className="text-center text-sm text-slate-400 py-8">No contract years entered.</div>}
                      <div className="flex flex-wrap gap-3 mt-3 text-[9px] font-bold text-slate-400 uppercase">
                        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: BAR_COLORS.G }} /> Guaranteed</span>
                        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: BAR_COLORS.PO }} /> Player Opt</span>
                        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: BAR_COLORS.TO }} /> Team Opt</span>
                        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-slate-400/40" /> Free Agent</span>
                      </div>
                    </div>
                  </>
                );
              })()}

              {chartMode === "trends" && (() => {
                const withTrend = roster
                  .map((p) => ({ p, pts: (p.stats || []).filter((s) => s.yds != null).sort((a, b) => String(a.season).localeCompare(String(b.season))) }))
                  .filter((x) => x.pts.length >= 2)
                  .sort((a, b) => (b.pts[b.pts.length - 1].yds ?? 0) - (a.pts[a.pts.length - 1].yds ?? 0))
                  .slice(0, 5);
                if (withTrend.length === 0) {
                  return <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm mt-6 text-center text-sm text-slate-400 py-10 px-6">Trends need at least two seasons of stats per player. Add more seasons in the Stats table and lines appear here.</div>;
                }
                const allSeasons = Array.from(new Set(withTrend.flatMap((x) => x.pts.map((s) => s.season)))).sort();
                const maxPts = Math.max(...withTrend.flatMap((x) => x.pts.map((s) => s.yds)), 100);
                const W = 320, H = 150, PAD = 14;
                const xOf = (season) => PAD + (allSeasons.indexOf(season) / Math.max(allSeasons.length - 1, 1)) * (W - PAD * 2);
                const yOf = (v) => H - PAD - (v / maxPts) * (H - PAD * 2);
                return (
                  <>
                    <div className="text-[11px] font-bold tracking-widest text-slate-400 uppercase mt-6 mb-2 px-1">Yards Trends</div>
                    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-4">
                      <svg viewBox={"0 0 " + W + " " + H} className="w-full">
                        {withTrend.map((x, i) => (
                          <g key={x.p.id}>
                            <polyline
                              fill="none" stroke={LINE_COLORS[i % LINE_COLORS.length]} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                              points={x.pts.map((s) => xOf(s.season) + "," + yOf(s.yds)).join(" ")} />
                            {x.pts.map((s) => (
                              <circle key={s.season} cx={xOf(s.season)} cy={yOf(s.yds)} r="3" fill={LINE_COLORS[i % LINE_COLORS.length]} />
                            ))}
                          </g>
                        ))}
                        {allSeasons.map((s) => (
                          <text key={s} x={xOf(s)} y={H - 2} textAnchor="middle" className="fill-slate-400" fontSize="8" fontWeight="600">{"'" + String(s).slice(2, 4)}</text>
                        ))}
                      </svg>
                      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
                        {withTrend.map((x, i) => (
                          <button key={x.p.id} onClick={() => onSelectPlayer(x.p)} className="flex items-center gap-1.5 text-[10px] font-bold text-slate-600 dark:text-slate-300">
                            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: LINE_COLORS[i % LINE_COLORS.length] }} />
                            {x.p.name} · {Math.round(x.pts[x.pts.length - 1].yds)}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                );
              })()}
            </>
          );
        })()}

        {seg === "roster" && roster.length === 0 && (
          <div className="text-center text-sm text-slate-400 mt-16">
            No players linked to {team.name} yet.
          </div>
        )}
      </div>
    </div>
  );
}


// ═══════════════ TAB: DRAFT ══════════════════════════════════════

function roundOf(p) {
  if (isUndrafted(p)) return null;
  if (p.draftRound != null) return Number(p.draftRound) || null;
  const t = String(p.draft || "");
  let m = t.match(/(?:round|rnd|rd|r)\s*\.?\s*(\d)/i) || t.match(/(\d)(?:st|nd)\s*round/i);
  if (m) return Number(m[1]);
  // fall back to the pick number: 32 picks per round, 7 rounds
  const pk = pickOf(p);
  if (pk !== 999) return Math.min(7, Math.ceil(pk / 32));
  return null;
}
function isUndrafted(p) {
  return /undrafted/i.test(String(p.draft || ""));
}
function draftedBy(p) {
  const m = String(p.draft || "").match(/\(([A-Za-z]{2,4})\)\s*$/);
  return m ? m[1].toUpperCase() : null;
}
function pickOf(p) {
  if (p.draftPick != null) return p.draftPick;
  const m = String(p.draft || "").match(/pick\s*(\d+)/i);
  return m ? parseInt(m[1], 10) : 999;
}


const STAT_CATS = [
  { key: "passYds", label: "PASS" },
  { key: "rushYds", label: "RUSH" },
  { key: "recYds", label: "REC" },
  { key: "td", label: "TD" },
  { key: "tkl", label: "TKL" },
  { key: "sck", label: "SCK" },
  { key: "ints", label: "INT" },
];

function StatsTab({ players, onSelect }) {
  const seasons = Array.from(
    new Set(players.flatMap((p) => (p.stats || []).map((s) => s.season)).filter(Boolean))
  ).sort((a, b) => String(b).localeCompare(String(a)));
  const [selSeason, setSelSeason] = useState(null);
  const season = selSeason && seasons.includes(selSeason) ? selSeason : (seasons.includes(CURRENT_SEASON) ? CURRENT_SEASON : seasons[0]);
  const [cat, setCat] = useState("pts");

  const rows = players
    .map((p) => {
      const st = (p.stats || []).find((s) => s.season === season);
      return st && st[cat] != null ? { p, st } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.st[cat] - a.st[cat]);

  const catLabel = STAT_CATS.find((c) => c.key === cat)?.label || "";

  return (
    <div>
      <div className="bg-blue-600 pb-4 px-4" style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.75rem)" }}>
        <h1 className="text-3xl font-extrabold text-white mb-3">Stats</h1>
        {seasons.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1" style={{ scrollbarWidth: "none" }}>
            {seasons.map((s) => (
              <button key={s} onClick={() => setSelSeason(s)}
                className={"shrink-0 px-3 py-1 rounded-full text-xs font-bold " + (s === season ? "bg-white text-blue-700" : "bg-blue-500/60 text-blue-100 active:bg-blue-500")}>
                {s}
              </button>
            ))}
          </div>
        )}
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1" style={{ scrollbarWidth: "none" }}>
          {STAT_CATS.map((c) => (
            <button key={c.key} onClick={() => setCat(c.key)}
              className={"shrink-0 px-4 py-1.5 rounded-full text-sm font-bold " + (c.key === cat ? "bg-white text-blue-700" : "bg-blue-500/60 text-blue-100 active:bg-blue-500")}>
              {c.label}
            </button>
          ))}
        </div>
      </div>
      <div className="px-4 pb-28 mt-4">
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
          {rows.map(({ p, st }, i) => (
            <button key={p.id} onClick={() => onSelect(p)} className="w-full flex items-center gap-3 px-4 py-3 text-left active:bg-slate-50 dark:active:bg-slate-800">
              <span className="w-6 text-center text-sm font-extrabold shrink-0 text-slate-400">{i + 1}</span>
              <Avatar p={p} />
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-bold text-slate-900 dark:text-slate-100 truncate">{p.name}</span>
                <span className="block text-[11px] text-slate-400 font-medium truncate">
                  {[teamOfPlayer(p), p.pos].filter(Boolean).join(" · ") || "—"}
                </span>
              </span>
              <span className="text-right shrink-0 w-8">
                <span className="block text-[10px] font-bold text-slate-400 uppercase">G</span>
                <span className="block text-sm font-extrabold text-slate-900 dark:text-slate-100 tabular-nums">
                  {st.gp != null ? Math.round(st.gp) : "—"}
                </span>
              </span>
              <span className="text-right shrink-0">
                <span className="block text-[10px] font-bold text-slate-400 uppercase">{catLabel}</span>
                <span className="block text-sm font-extrabold text-slate-900 dark:text-slate-100 tabular-nums">
                  {Math.round(st[cat] * 10) / 10}
                </span>
              </span>
            </button>
          ))}
          {rows.length === 0 && (
            <div className="text-center text-sm text-slate-400 py-12 px-6">
              No {catLabel} entries for {season || "any season"} yet. Fill the Stats table in Airtable and they appear here.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DraftTab({ players, onSelect }) {
  const byYear = {};
  const noData = [];
  for (const p of players) {
    if (p.draftYear) (byYear[p.draftYear] ??= []).push(p);
    else noData.push(p);
  }
  const years = Object.keys(byYear).map(Number).sort((a, b) => b - a);
  const [selYear, setSelYear] = useState(null);
  const yr = selYear && byYear[selYear] ? selYear : years[0]; // default: newest class
  return (
    <div>
      <div className="bg-blue-600 pb-4 px-4" style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.75rem)" }}>
        <h1 className="text-3xl font-extrabold text-white mb-3">Draft</h1>
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1" style={{ scrollbarWidth: "none" }}>
          {years.map((y) => (
            <button
              key={y}
              onClick={() => setSelYear(y)}
              className={
                "shrink-0 px-4 py-1.5 rounded-full text-sm font-bold transition-colors " +
                (y === yr ? "bg-white text-blue-700" : "bg-blue-500/60 text-blue-100 active:bg-blue-500")
              }
            >
              {y}
            </button>
          ))}
        </div>
      </div>
      <div className="px-4 pb-28 mt-4">
        {[yr].filter((y) => y != null).map((yr) => {
          const cls = byYear[yr];
          const rounds = [
            ...[1, 2, 3, 4, 5, 6, 7].map((r) => ["Round " + r, cls.filter((p) => roundOf(p) === r)]),
            ["Undrafted", cls.filter((p) => isUndrafted(p))],
            ["Round Unknown", cls.filter((p) => !isUndrafted(p) && (roundOf(p) == null || roundOf(p) > 7))],
          ].filter(([, g]) => g.length > 0);
          return (
            <div key={yr}>
              {rounds.map(([label, group]) => (
                <div key={label}>
                  <div className="text-[11px] font-bold tracking-widest text-slate-400 uppercase mt-6 mb-2 px-1">
                    {label}
                  </div>
                  <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
                    {group
                      .sort((a, b) => pickOf(a) - pickOf(b))
                      .map((p) => (
                        <button key={p.id} onClick={() => onSelect(p)} className="w-full flex items-center gap-3 px-4 py-3 text-left active:bg-slate-50 dark:active:bg-slate-800">
                          <span className="w-7 text-center text-sm font-extrabold text-slate-400 tabular-nums shrink-0">{pickOf(p) !== 999 ? pickOf(p) : "—"}</span>
                          <Avatar p={p} />
                          <span className="flex-1 min-w-0">
                            <span className="block text-sm font-bold text-slate-900 dark:text-slate-100 truncate">{p.name}</span>
                            <span className="block text-[11px] text-slate-400 font-medium truncate">{[p.pos, p.college].filter(Boolean).join(" · ") || "—"}</span>
                          </span>
                          <TeamPill team={draftedBy(p) || teamOfPlayer(p)} />
                        </button>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          );
        })}
        {noData.length > 0 && (
          <div className="text-center text-xs text-slate-400 mt-8">
            {noData.length} player{noData.length === 1 ? "" : "s"} without draft data yet
          </div>
        )}
        {years.length === 0 && (
          <div className="text-center text-sm text-slate-400 mt-16">
            No draft data yet. Fill in the Draft Year field in Airtable and classes will appear here.
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════ PLACEHOLDER TABS ════════════════════════════════
function ComingSoon({ icon, title, blurb }) {
  return (
    <div>
      <div className="bg-blue-600 px-5 pb-5 text-white sticky top-0 z-10 shadow-md" style={{ paddingTop: "calc(env(safe-area-inset-top) + 1.5rem)" }}>
        <div className="text-2xl font-extrabold tracking-tight">{title}</div>
      </div>
      <div className="px-8 pt-24 pb-28 text-center">
        <div className="text-5xl mb-4">{icon}</div>
        <div className="text-lg font-extrabold text-slate-700 dark:text-slate-200">{title} is coming soon</div>
        <div className="text-sm text-slate-400 mt-2 leading-relaxed">{blurb}</div>
      </div>
    </div>
  );
}

// ═══════════════ APP SHELL ═══════════════════════════════════════
const TABS = [
  { id: "teams", label: "Teams", icon: "🏈" },
  { id: "players", label: "Players", icon: "👤" },
  { id: "stats", label: "Stats", icon: "📊" },
  { id: "contracts", label: "Contracts", icon: "💰" },
  { id: "draft", label: "Draft", icon: "🎓" },
];

export default function App() {
  const [tab, setTab] = useState("teams");
  const [sel, setSel] = useState(null);
  const [players, setPlayers] = useState(null);
  const [teams, setTeams] = useState([]);
  const [stand, setStand] = useState(null); // records + stat ranks from /api/standings

  // Automated records/stats: merge ESPN data into the Airtable teams by abbr.
  // Airtable values still win when present; ESPN fills the blanks (and stx).
  const mergedTeams = useMemo(() => {
    if (!stand || !stand.teams) return teams;
    const find = (abbr) => stand.teams.find((s) => injTeamEq(s.abbr, abbr));
    return teams.map((t) => {
      const s = find(t.abbr || toAbbr(t.name));
      if (!s) return t;
      const stx = {
        passYpg: s.passYpg, passYpgRank: s.passYpgRank,
        rushYpg: s.rushYpg, rushYpgRank: s.rushYpgRank,
        offTd: s.offTd, offTdRank: s.offTdRank,
        passYpgAllowed: s.passYpgAllowed, passYpgAllowedRank: s.passYpgAllowedRank,
        rushYpgAllowed: s.rushYpgAllowed, rushYpgAllowedRank: s.rushYpgAllowedRank,
        paRank: s.paRank,
      };
      return stand.isCurrent
        ? { ...t, wins: t.wins ?? s.wins, losses: t.losses ?? s.losses, ties: t.ties ?? s.ties, pf: t.pf ?? s.pf, pa: t.pa ?? s.pa, stx }
        : { ...t, winsPrev: t.winsPrev ?? s.wins, lossesPrev: t.lossesPrev ?? s.losses, tiesPrev: t.tiesPrev ?? s.ties, pfPrev: t.pfPrev ?? s.pf, paPrev: t.paPrev ?? s.pa, stx };
    });
  }, [teams, stand]);
  const [selTeam, setSelTeam] = useState(null);
  const [error, setError] = useState(null);

  const [, setInjTick] = useState(0);
  useEffect(() => {
    let alive = true;
    // No ?active=true — that filter excluded IR/PUP players, which is why
    // injured players were showing green rings (no match = assumed healthy).
    fetch("https://api.sleeper.app/v1/players/nfl")
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        for (const p of Object.values(d || {})) {
          if (!p || !p.full_name || !p.team) continue;
          const k = injNrm(p.full_name);
          (INJ_BY_NAME[k] = INJ_BY_NAME[k] || []).push(p);
        }
        setInjTick((t) => t + 1);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    fetch("/api/contracts")
      .then((r) => r.json())
      .then((d) => { if (d.error) setError(d.error); else {
        for (const t of d.teams || []) { const a = t.abbr || toAbbr(t.name); if (a && t.logo) TEAM_LOGOS[a] = t.logo; }
        setPlayers(d.players); setTeams(d.teams || []);
      } })
      .catch((e) => setError(String(e)));
  }, []);
  useEffect(() => {
    // Non-fatal: if ESPN is down the app just shows Airtable's numbers.
    fetch("/api/standings")
      .then((r) => r.json())
      .then((d) => { if (d && d.teams) setStand(d); })
      .catch(() => {});
  }, []);

  if (sel) {
    return (
      <PlayerDetail
        p={sel}
        onBack={() => setSel(null)}
        backLabel={tab === "contracts" ? "Contracts" : tab === "teams" ? (selTeam ? selTeam.name : "Teams") : "Players"}
        mode="full"
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950">
      {error && (
        <div className="m-4 bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-2xl px-4 py-3">
          Couldn't load data: {error}
        </div>
      )}
      {!players && !error && <div className="text-center text-sm text-slate-400 pt-24">Loading…</div>}

      {players && tab === "teams" && !selTeam && (
        <TeamsTab teams={mergedTeams} players={players} onSelect={setSelTeam} />
      )}
      {players && tab === "teams" && selTeam && (
        <TeamDetail
          team={mergedTeams.find((t) => t.id === selTeam.id) || selTeam} teams={mergedTeams}
          players={players}
          onBack={() => setSelTeam(null)}
          onSelectPlayer={setSel}
        />
      )}
      {players && tab === "players" && <PlayersTab players={players} onSelect={setSel} />}
      {players && tab === "contracts" && <ContractsTab players={players} onSelect={setSel} />}
      {players && tab === "stats" && <StatsTab players={players} onSelect={setSel} />}
      {players && tab === "draft" && <DraftTab players={players} onSelect={setSel} />}

      <div className="fixed bottom-0 inset-x-0 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex pb-[env(safe-area-inset-bottom)] z-20">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => { setTab(t.id); setSel(null); setSelTeam(null); }}
            className={"flex-1 py-2.5 text-center " + (tab === t.id ? "text-blue-600" : "text-slate-400")}
          >
            <div className="text-lg leading-none">{t.icon}</div>
            <div className="text-[10px] font-bold mt-1">{t.label}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
