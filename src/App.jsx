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
  const px = size === "lg" ? "w-20 h-20 text-2xl" : size === "sm" ? "w-9 h-9 text-xs" : "w-11 h-11 text-sm";
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

function Tile({ value, label, sub, accent, valueClass, compact }) {
  return (
    <div className={"bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 text-center shadow-sm flex flex-col items-center justify-center " + (compact ? "px-1 py-2.5" : "px-2 py-4")}>
      <div className={"font-semibold text-slate-400 tracking-widest uppercase mb-1 " + (compact ? "text-[8px]" : "text-[10px]")}>{label}</div>
      <div className={(compact ? "text-lg " : "text-2xl ") + "font-extrabold tracking-tight " + (valueClass ? valueClass : accent ? ACCENT_TEXT : "text-slate-900 dark:text-slate-100")}>{value}</div>
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
// ── Season stats box + game-by-game graph (from /api/season-stats) ──
function SeasonStatsBox({ p, seasonStats }) {
  const [metric, setMetric] = useState(null);
  if (!seasonStats || !seasonStats.players) return null;
  // match by name (+team when ambiguous)
  const nm = hrbNrmSafe(p.name);
  const abbr = toAbbr(teamOfPlayer(p) || p.teamName || "");
  const cands = Object.values(seasonStats.players).filter((q) => hrbNrmSafe(q.name) === nm);
  const P = cands.length > 1 ? cands.find((q) => injTeamEq(q.team, abbr)) || cands[0] : cands[0];
  if (!P || !P.totals || !P.totals.gp) return null;
  const T = P.totals, G = P.perGame;
  const pos = String(p.pos || P.pos || "").toUpperCase();
  const isQB = pos === "QB", isRB = ["RB", "HB", "FB"].includes(pos), isRec = ["WR", "TE"].includes(pos);
  const isDef = !isQB && !isRB && !isRec && (T.tkl > 0 || T.sacks > 0 || T.defInt > 0);
  // Columns per position: [label, total, per-game, graphKey]
  const cols = isQB ? [["Cmp", T.cmp, G.cmp, "cmp"], ["Att", T.att, G.att, "att"], ["Pass Yds", T.passYds, G.passYds, "passYds"], ["Pass TD", T.passTd, G.passTd, "passTd"], ["INT", T.int, G.int, "int"], ["Rush Yds", T.rushYds, G.rushYds, "rushYds"], ["Rush TD", T.rushTd, G.rushTd, "rushTd"]]
    : isRB ? [["Carries", T.car, G.car, "car"], ["Rush Yds", T.rushYds, G.rushYds, "rushYds"], ["Y/Car", T.ypcar, null, null], ["Rush TD", T.rushTd, G.rushTd, "rushTd"], ["Targets", T.tgt, G.tgt, "tgt"], ["Rec", T.rec, G.rec, "rec"], ["Rec Yds", T.recYds, G.recYds, "recYds"], ["Rec TD", T.recTd, G.recTd, "recTd"], ["Tgt Share", T.tgtShare != null ? Math.round(T.tgtShare * 100) + "%" : null, null, null]]
    : isRec ? [["Rec", T.rec, G.rec, "rec"], ["Targets", T.tgt, G.tgt, "tgt"], ["Rec Yds", T.recYds, G.recYds, "recYds"], ["Rec TD", T.recTd, G.recTd, "recTd"], ["Y/Rec", T.ypc, null, null], ["Tgt Share", T.tgtShare != null ? Math.round(T.tgtShare * 100) + "%" : null, null, null], ["Carries", T.car, G.car, "car"], ["Rush TD", T.rushTd, G.rushTd, "rushTd"]]
    : isDef ? [["Tackles", T.tkl, G.tkl, "tkl"], ["Solo", T.solo, G.solo, "solo"], ["Sacks", T.sacks, G.sacks, "sacks"], ["TFL", T.tfl, G.tfl, "tfl"], ["INT", T.defInt, G.defInt, "defInt"], ["PD", T.pd, G.pd, "pd"], ["TD", T.defTd, G.defTd, "defTd"]]
    : [];
  if (!cols.length) return null;
  const graphable = cols.filter((c) => c[3]);
  const key = metric || (isRec ? "tgt" : isRB ? "car" : isQB ? "passYds" : "tkl");
  const series = P.games.map((g) => ({ week: g.week, opp: g.opp, v: g[key] || 0 }));
  const max = Math.max(1, ...series.map((d) => d.v));
  const W = 320, H = 110, padL = 22, padB = 18, padT = 10;
  const x = (i) => padL + (series.length > 1 ? (i * (W - padL - 6)) / (series.length - 1) : (W - padL) / 2);
  const y = (v) => padT + (H - padT - padB) * (1 - v / max);
  const path = series.map((d, i) => (i ? "L" : "M") + x(i).toFixed(1) + " " + y(d.v).toFixed(1)).join(" ");
  const label = graphable.find((c) => c[3] === key)?.[0] || key;
  return (
    <>
      <div className="text-[11px] font-bold tracking-widest text-slate-400 uppercase mt-6 mb-2 px-1">{seasonStats.season} Season · {T.gp} GP</div>
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="grid grid-cols-4 divide-x divide-y divide-slate-100 dark:divide-slate-800">
          {cols.map(([lbl, tot, pg]) => (
            <div key={lbl} className="px-2 py-2.5 text-center">
              <div className="text-[8px] font-semibold tracking-widest uppercase text-slate-400">{lbl}</div>
              <div className="text-base font-extrabold tabular-nums text-slate-900 dark:text-white">{tot ?? "—"}</div>
              {pg != null && <div className="text-[9px] font-semibold text-slate-400 tabular-nums">{pg}/g</div>}
            </div>
          ))}
        </div>
        {/* game-by-game line: is the role trending up or down? */}
        <div className="border-t border-slate-100 dark:border-slate-800 px-3 pt-2.5 pb-2">
          <div className="flex items-center gap-1.5 overflow-x-auto mb-1" style={{ scrollbarWidth: "none" }}>
            {graphable.map(([lbl,,, k]) => (
              <button key={k} onClick={() => setMetric(k)}
                className={"shrink-0 px-2.5 py-1 rounded-full text-[10px] font-bold " + (key === k ? "bg-blue-600 text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-300")}>
                {lbl}
              </button>
            ))}
          </div>
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
            {[0, 0.5, 1].map((f) => (
              <g key={f}>
                <line x1={padL} x2={W - 6} y1={y(max * f)} y2={y(max * f)} stroke="currentColor" className="text-slate-200 dark:text-slate-700" strokeWidth="1" />
                <text x={padL - 4} y={y(max * f) + 3} fontSize="8" textAnchor="end" className="fill-slate-400">{Math.round(max * f)}</text>
              </g>
            ))}
            <path d={path} fill="none" stroke="#2563eb" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
            {series.map((d, i) => (
              <g key={i}>
                <circle cx={x(i)} cy={y(d.v)} r="3.5" fill="#2563eb" stroke="white" strokeWidth="1.5" />
                <text x={x(i)} y={y(d.v) - 7} fontSize="8" textAnchor="middle" fontWeight="700" className="fill-slate-700 dark:fill-slate-200">{d.v}</text>
                <text x={x(i)} y={H - 4} fontSize="7.5" textAnchor="middle" className="fill-slate-400">W{d.week}</text>
              </g>
            ))}
          </svg>
          <div className="text-[9px] text-slate-400 text-center">{label} by game</div>
        </div>
      </div>
    </>
  );
}

function PlayerDetail({ p, onBack, backLabel, mode = "full", seasonStats }) {
  useEffect(() => { window.scrollTo(0, 0); }, []);
  const act = activeOf(p);
  const past = p.contracts.filter((c) => c !== act);
  const no = cleanNo(p.no);
  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 pb-24">
      <div className="relative overflow-hidden px-5 pb-7 text-white"
        style={{ background: `linear-gradient(160deg, ${playerHeaderColor(p)} 0%, ${playerHeaderColor(p)} 55%, rgba(0,0,0,0.35) 100%)`, paddingTop: "calc(env(safe-area-inset-top) + 1.25rem)" }}>
        {/* jersey number watermark + team logo ghost give the card depth without clutter */}
        {no && <div className="absolute -right-2 -bottom-6 text-[120px] font-black leading-none text-white/10 select-none tabular-nums">{no}</div>}
        {TEAM_LOGOS[toAbbr(teamOfPlayer(p) || p.teamName || "")] && (
          <img src={TEAM_LOGOS[toAbbr(teamOfPlayer(p) || p.teamName || "")]} alt="" className="absolute right-4 top-3 w-9 h-9 rounded-full bg-white/90 p-0.5 shadow" />
        )}
        <button onClick={onBack} className="relative text-sm font-semibold opacity-80 mb-4">‹ {backLabel}</button>
        <div className="relative flex items-center gap-4">
          <div className="rounded-full p-[3px] bg-white/90 shadow-lg shrink-0"><Avatar p={p} size="lg" /></div>
          <div className="min-w-0">
            <div className="text-[26px] font-extrabold leading-tight truncate drop-shadow-sm">
              {p.name}
            </div>
            <div className="flex items-center gap-2 mt-1 min-w-0 flex-wrap">
              {cleanNo(p.no) && <span className="text-[11px] font-extrabold px-2 py-0.5 rounded-full bg-white/20 tabular-nums">#{cleanNo(p.no)}</span>}
              {p.pos && <span className="text-[11px] font-extrabold px-2 py-0.5 rounded-full bg-white/20">{p.pos}</span>}
              {p.rating2k != null && <span className={"text-[11px] font-extrabold px-2 py-0.5 rounded-full " + (Math.round(p.rating2k) >= 90 ? "bg-amber-400 text-slate-900" : "bg-white/20")}>{Math.round(p.rating2k)} OVR</span>}
              {injHasFlag(p, toAbbr(teamOfPlayer(p) || p.teamName || ""))
                ? <InjBadge p={p} team={toAbbr(teamOfPlayer(p) || p.teamName || "")} lg noNote />
                : <StatusBadge status={p.status} />}
            </div>
            <InjuryLine p={p} />
          </div>
        </div>
      </div>

      <div className="px-4 -mt-3">
        {(() => {
          // Three season tiles by position; nothing for positions without box-score stats (OL, K, P).
          const pos = String(p.pos || "").toUpperCase();
          const rowOf = () => {
            if (!seasonStats || !seasonStats.players) return null;
            const nm = hrbNrmSafe(p.name), abbr = toAbbr(teamOfPlayer(p) || p.teamName || "");
            const c = Object.values(seasonStats.players).filter((q) => hrbNrmSafe(q.name) === nm);
            return c.length > 1 ? c.find((q) => injTeamEq(q.team, abbr)) || c[0] : c[0] || null;
          };
          const S = rowOf(); const T = S ? S.totals : null;
          const v = (k) => (T ? T[k] : "—");
          const yr = seasonStats ? seasonStats.season : "";
          let tiles = null;
          if (["WR", "TE"].includes(pos)) tiles = [["Rec", v("rec")], ["Rec Yds", v("recYds")], ["Rec TD", v("recTd")]];
          else if (["RB", "HB", "FB"].includes(pos)) tiles = [["Carries", v("car")], ["Rush Yds", v("rushYds")], ["Rush TD", v("rushTd")]];
          else if (pos === "QB") tiles = [["Pass Yds", v("passYds")], ["Pass TD", v("passTd")], ["INT", v("int")]];
          else if (/^(DE|DT|NT|EDGE|DL|LB|ILB|OLB|MLB|CB|S|FS|SS|DB|NB|LDE|RDE|LDT|RDT|LOLB|ROLB)$/.test(pos)) tiles = [["Tackles", v("tkl")], ["Sacks", v("sacks")], ["INT", v("defInt")]];
          if (!tiles) return null;
          return (
            <div className="grid grid-cols-3 gap-2">
              {tiles.map(([lbl, val]) => <Tile key={lbl} value={val ?? "—"} label={yr ? yr + " " + lbl : lbl} />)}
            </div>
          );
        })()}

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
        {mode === "full" && <SeasonStatsBox p={p} seasonStats={seasonStats} />}

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
const INJ_BY_LAST = {}; // "TEAM|lastname" -> [sleeper players] — nickname-proof fallback
const lastNameKey = (name) => {
  const parts = injNrm(name).split(" ").filter(Boolean);
  return parts.length ? parts[parts.length - 1] : "";
};
const injNrm = (x) => String(x || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\./g, "").replace(/\s+(jr|sr|ii|iii|iv|v)$/i, "").replace(/\s+/g, " ").trim().toLowerCase();
const injTeamEq = (a, b) => {
  const n = (t) => String(t || "").toUpperCase();
  if (n(a) === n(b)) return true;
  const AL = [["WAS", "WSH"], ["JAX", "JAC"], ["LAR", "LA"], ["ARI", "ARZ"], ["BAL", "BLT"], ["CLE", "CLV"], ["HOU", "HST"]];
  return AL.some(([x, y]) => (n(a) === x && n(b) === y) || (n(a) === y && n(b) === x));
};
// Sleeper's "not playing" vocabulary — shared by the formation and the unit rankings
const OUT_CODES = new Set(["OUT", "IR", "PUP", "NA", "SUS", "COV", "DNR", "NFI", "RET"]);
function injIsOut(inj) {
  return !!inj && (OUT_CODES.has(String(inj.injury_status || "").toUpperCase()) ||
    /injured reserve|pup|non football|suspend|inactive/i.test(String(inj.status || "")));
}

function injFor(name, teamAbbr) {
  const list = INJ_BY_NAME[injNrm(name)];
  if (list && list.length) {
    if (list.length > 1 && teamAbbr) {
      const hit = list.find((p) => injTeamEq(p.team, teamAbbr));
      if (hit) return hit;
      return null; // duplicate name, wrong/unknown team — don't guess
    }
    return list[0];
  }
  // Full name missed (nickname: "Bam Knight" vs Sleeper's "Zonovan Knight").
  // Fall back to team + last name, but only when exactly one player on that
  // team has the last name — never guess between two Smiths.
  if (teamAbbr) {
    for (const t of Object.keys(INJ_BY_LAST)) {
      const [team, last] = t.split("|");
      if (last === lastNameKey(name) && injTeamEq(team, teamAbbr)) {
        const cands = INJ_BY_LAST[t];
        if (cands.length === 1) return cands[0];
      }
    }
  }
  return null;
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
// Player-page injury line: "Ankle sprain · Est. return Oct 20". Body part +
// type from Sleeper (instant); return date from ESPN when the team gave one.
function InjuryLine({ p }) {
  const [espn, setEspn] = useState(null);
  const abbr = toAbbr(teamOfPlayer(p) || p.teamName || "");
  const inj = injFor(p.name, abbr);
  useEffect(() => {
    setEspn(null);
    if (!inj || !inj.espn_id || !injHasFlag(p, abbr)) return;
    let alive = true;
    fetch(`/api/player-injury?espn=${inj.espn_id}`).then((r) => r.json()).then((d) => { if (alive) setEspn(d && d.injury ? d.injury : null); }).catch(() => {});
    return () => { alive = false; };
  }, [inj && inj.espn_id, p.id]);
  if (!inj || !injHasFlag(p, abbr)) return p.injuryNotes ? <div className="text-xs font-semibold text-red-200 mt-1 truncate">{p.injuryNotes}</div> : null;
  const part = inj.injury_body_part || (espn && (espn.location || espn.type)) || "";
  const kind = (espn && espn.detail) || (inj.injury_notes && !/^\s*$/.test(inj.injury_notes) ? inj.injury_notes : "") || (espn && espn.type) || "";
  const label = [part, kind && kind.toLowerCase() !== String(part).toLowerCase() ? kind.toLowerCase() : ""].filter(Boolean).join(" ");
  const ret = espn && espn.returnDate ? new Date(espn.returnDate) : null;
  const retTxt = ret && !isNaN(ret) ? " · Est. return " + ret.toLocaleDateString([], { month: "short", day: "numeric" }) : "";
  if (!label && !retTxt) return null;
  return <div className="text-xs font-semibold text-red-200 mt-1 truncate">{label ? label[0].toUpperCase() + label.slice(1) : "Injury"}{retTxt}</div>;
}

function InjBadge({ p, team, lg = false, noNote = false }) {
  const inj = injFor(p.name, team);
  if (!inj) return null;
  let label = null, cls = "";
  const is2 = inj.injury_status;
  if (is2 === "Questionable") { label = "QUESTIONABLE"; cls = "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300"; }
  else if (is2 === "Doubtful") { label = "DOUBTFUL"; cls = "bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300"; }
  else if (is2 === "Out") { label = "OUT"; cls = "bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300"; }
  // Sleeper also uses short codes in injury_status itself (IR, PUP, NA, Sus, COV)
  else if (/^(IR|PUP|NA|SUS|COV|DNR|NFI)$/i.test(String(is2 || ""))) { label = String(is2).toUpperCase() === "NA" ? "OUT" : String(is2).toUpperCase(); cls = "bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300"; }
  else {
    const st = String(inj.status || "");
    if (/injured reserve/i.test(st)) { label = "IR"; cls = "bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300"; }
    else if (/pup|physically unable/i.test(st)) { label = "PUP"; cls = "bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300"; }
    else if (/non football/i.test(st)) { label = "NFI"; cls = "bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300"; }
    else if (/inactive/i.test(st)) { label = "INACTIVE"; cls = "bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-300"; }
  }
  if (!label) return null;
  const note = inj.injury_body_part || null; // e.g. "Hamstring", "Knee"
  return (
    <span className="inline-flex items-center gap-1 min-w-0">
      <span className={"font-extrabold rounded px-1.5 shrink-0 " + (lg ? "text-[11px] py-0.5 " : "text-[9px] py-px ") + cls}>
        {label}
      </span>
      {note && !noNote && (
        <span className={"text-slate-400 dark:text-slate-500 font-semibold truncate " + (lg ? "text-[11px]" : "text-[9px]")}>
          {note}
        </span>
      )}
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
function FormationView({ roster, abbr, unit, setUnit, onSelectPlayer, lineRank, team }) {
  const lblOf = (p) => String(p.sortLabel || "").toUpperCase();
  const depthNo = (p) => { const m = lblOf(p).match(/(\d+)$/); return m ? Number(m[1]) : 1; };
  const baseOf = (p) => { const m = lblOf(p).match(/^([A-Z]+)/); return m ? m[1] : null; };
  const norm = (b) => (b && b.length > 2 && /^[LR]/.test(b) && !["LB", "RB"].includes(b) ? b.slice(1) : b);
  const injOf = (p) => (p ? injFor(p.name, abbr) : null);
  // Sleeper's injury_status vocabulary is wider than Q/D/Out — IR, PUP, NA,
  // Sus, COV, DNR all mean "not playing". Missing any of these = a hurt
  // player shown as healthy (the Charbonnet bug).
  const isOut = injIsOut;
  // Health state: "out" | "d" | "q" | "ok" | null (no Sleeper match)
  const healthOf = (p) => {
    const inj = injOf(p);
    if (!inj) return null;
    if (isOut(inj)) return "out";
    const st = String(inj.injury_status || "").toUpperCase();
    if (st === "DOUBTFUL") return "d";
    if (st === "QUESTIONABLE") return "q";
    return "ok";
  };
  // Ring: white = healthy (reads on grass), gray = no data, orange = Q, red = D/Out
  const ringCls = (p) => {
    if (!p) return "border-white/40";
    const h = healthOf(p);
    if (h == null) return "border-slate-400";
    if (h === "ok") return "border-white";
    return "border-red-500"; // anyone banged up = red; the badge says how badly
  };
  // High-contrast status badge at the top-right of the circle — the thing
  // you actually read, since ring hue alone gets lost against green turf.
  const HealthBadge = ({ p, small }) => {
    const h = healthOf(p);
    if (!h || h === "ok") return null;
    const inj = injOf(p);
    const txt = h === "q" ? "QUESTIONABLE" : h === "d" ? "DOUBTFUL"
      : (String(inj.injury_status || "").toUpperCase() === "IR" || /injured reserve/i.test(String(inj.status || ""))) ? "IR"
      : String(inj.injury_status || "").toUpperCase() === "PUP" ? "PUP" : "OUT";
    return (
      <span className={"absolute -top-2 left-1/2 -translate-x-1/2 px-1.5 rounded-full font-extrabold text-white bg-red-600 border-2 border-white shadow whitespace-nowrap flex items-center justify-center " +
        (small ? "h-[13px] text-[6px] " : "h-[15px] text-[7px] ")}>
        {txt}
      </span>
    );
  };
  const used = new Set();
  let SLOTS, assigned, formationLabel = null; // defense sets this ("4-3 · Nickel"); offense stays clean

  if (unit === "offense") {
    // Offense keeps the 11-man template — it's stable across the league.
    SLOTS = [
      { lbl: "WR", x: 11, y: 24, exact: ["WR1"], aliases: ["WR"] },
      { lbl: "WR", x: 89, y: 24, exact: ["WR2"], aliases: ["WR"] },
      { lbl: "WR", x: 22, y: 40, exact: ["WR3"], aliases: ["WR"] },
      { lbl: "TE", x: 82, y: 40, exact: ["TE1"], aliases: ["TE"] },
      { lbl: "LT", x: 10, y: 56, exact: ["LT1"], aliases: ["LT", "OT", "T"] },
      { lbl: "LG", x: 30, y: 56, exact: ["LG1"], aliases: ["LG", "G", "OG"] },
      { lbl: "C", x: 50, y: 56, exact: ["C1"], aliases: ["C", "OC"] },
      { lbl: "RG", x: 70, y: 56, exact: ["RG1"], aliases: ["RG", "G", "OG"] },
      { lbl: "RT", x: 90, y: 56, exact: ["RT1"], aliases: ["RT", "OT", "T"] },
      { lbl: "QB", x: 50, y: 72, exact: ["QB1"], aliases: ["QB"] },
      { lbl: "RB", x: 50, y: 88, exact: ["RB1", "HB1"], aliases: ["RB", "HB", "FB"] },
    ];
    // Two-pass slot assignment.
    //   Pass 1 — exact depth labels claim their exact slot: "WR3" lands at the
    //   3rd WR spot even if no WR2 exists, leaving the WR2 slot visibly open.
    //   Pass 2 — remaining slots fill in depth order by label, then Position.
    assigned = new Array(SLOTS.length).fill(null);
    // Next man up: an OUT/IR/PUP/suspended starter is skipped in pass 1 and
    // his slot fills from the depth chart in pass 2 (WR4 steps into WR3's
    // spot). He goes to the sideline wearing his OUT badge. Q/D starters stay
    // on the field — those are game-time calls, not lineup changes.
    const outStarter = new Array(SLOTS.length).fill(null);
    SLOTS.forEach((s, i) => {
      for (const want of s.exact || []) {
        const hit = roster.find((p) => !used.has(p.id) && lblOf(p) === want);
        if (hit) {
          if (isOut(injOf(hit))) { outStarter[i] = hit; continue; }
          assigned[i] = hit; used.add(hit.id); break;
        }
      }
    });
    SLOTS.forEach((s, i) => {
      if (assigned[i]) return;
      const aliasIdx = (p) => s.aliases.findIndex((a) => new RegExp("^" + a + "\\d*$").test(lblOf(p)));
      const healthy = (p) => !isOut(injOf(p));
      const byLabel = roster
        .filter((p) => !used.has(p.id) && aliasIdx(p) !== -1 && healthy(p))
        .sort((a, b) => aliasIdx(a) - aliasIdx(b) || depthNo(a) - depthNo(b));
      const byPos = roster
        .filter((p) => !used.has(p.id) && s.aliases.includes(String(p.pos || "").toUpperCase()) && healthy(p))
        .sort((a, b) => (a.sort ?? 9999) - (b.sort ?? 9999));
      // no healthy body at all -> show the injured starter rather than a hole
      const hit = byLabel[0] || byPos[0] || outStarter[i] || null;
      if (hit) { assigned[i] = hit; used.add(hit.id); if (outStarter[i] && hit !== outStarter[i]) s.nextUp = true; }
    });
  } else {
    // ── Defense: NOT a template. Every declared starter takes the field. ──
    // Real depth charts don't have exactly 11 starters (4 LBs + a nickel is
    // 12). Each row lays itself out for however many starters it has, so a
    // 4-3, 3-4, nickel, or 3-4-with-four-LBs all render without dropping
    // anyone. Rule: "X1" (or a side label like LOLB1) in Airtable = starter.
    // Base label normalized: strip a side prefix (LILB -> ILB, RDE -> DE) so
    // any naming style classifies into the right row. Nicknames included
    // (MIKE/WILL/SAM/JACK/BUCK/MACK for LBs, STAR/DIME/NICKEL for DBs).
    const ROW_OF = (b0) => {
      const b = norm(b0);
      if (/^(DE|DT|NT|EDGE|DL)$/.test(b)) return "dl";
      if (/^(OLB|ILB|MLB|LB|WLB|SLB|MIKE|WILL|SAM|JACK|BUCK|MACK)$/.test(b)) return "lb";
      if (/^(CB|NB|NCB|SLOT|DB|STAR|DIME|NICKEL)$/.test(b)) return "db";
      if (/^(S|FS|SS)$/.test(b)) return "s";
      return null;
    };
    // How many depth numbers count as "starter" per label. Side-prefixed
    // labels (LDE, RILB) are one-per-side, so they're always depth 1.
    const STARTER_MAX = {
      DE: 2, DT: 2, NT: 1, EDGE: 2, DL: 4,
      OLB: 2, ILB: 2, MLB: 2, LB: 4, WLB: 1, SLB: 1, MIKE: 1, WILL: 1, SAM: 1, JACK: 1, BUCK: 1, MACK: 1,
      CB: 3, NB: 1, NCB: 1, SLOT: 1, DB: 2, STAR: 1, DIME: 1, NICKEL: 1, FS: 1, SS: 1, S: 2,
    };
    const maxFor = (b0) => (b0 !== norm(b0) ? 1 : (STARTER_MAX[b0] ?? 1));
    // Left-to-right ordering inside a row: L-side labels, then the "1" of an
    // edge position (SAM/WILL/OLB1/DE1/CB1), interior, "2" of an edge, R-side.
    const EDGE_BASES = new Set(["DE", "EDGE", "OLB", "CB", "S"]);
    const LEFT_NAMES = new Set(["SAM", "SLB"]), RIGHT_NAMES = new Set(["WILL", "WLB"]);
    // 0 = left edge · 1 = left interior · 2 = middle · 3 = right interior · 4 = right edge
    // So LDE · LDT · RDT · RDE lines up as a real front, not LDT · LDE · RDE · RDT.
    const sideKey = (b0, d) => {
      const b = norm(b0);
      const edge = EDGE_BASES.has(b);
      if (b0 !== b) return b0.startsWith("L") ? (edge ? 0 : 1) : (edge ? 4 : 3);
      if (LEFT_NAMES.has(b)) return 0;
      if (RIGHT_NAMES.has(b)) return 4;
      return edge ? (d <= 1 ? 0 : 4) : 2;
    };
    const rows = { dl: [], lb: [], db: [], s: [] };
    const starters = roster
      .filter((p) => { const b = baseOf(p); return b && ROW_OF(b) && depthNo(p) <= maxFor(b); })
      .sort((a, b) => sideKey(baseOf(a), depthNo(a)) - sideKey(baseOf(b), depthNo(b)) || depthNo(a) - depthNo(b));
    const starterIds = new Set(starters.map((p) => p.id));
    starters.forEach((p) => {
      let who = p, nextUp = false;
      if (isOut(injOf(p))) {
        // Next man up: same position family first (WLB1 out -> WLB2), then
        // any healthy non-starter in the same row, shallowest depth first.
        const fam = norm(baseOf(p)), row = ROW_OF(baseOf(p));
        const repl = roster
          .filter((q) => !used.has(q.id) && !starterIds.has(q.id) && q.id !== p.id && baseOf(q) && ROW_OF(baseOf(q)) === row && !isOut(injOf(q)))
          .sort((a, b) => (norm(baseOf(a)) === fam ? 0 : 1) - (norm(baseOf(b)) === fam ? 0 : 1) || depthNo(a) - depthNo(b))[0];
        if (repl) { who = repl; nextUp = true; }
      }
      rows[ROW_OF(baseOf(p))].push({ p: who, lbl: baseOf(p), nextUp });
      used.add(who.id);
    });
    // Fallback for rosters without depth labels: fill each row by Position.
    const FALLBACK = { dl: ["DE", "DT", "NT", "EDGE", "DL"], lb: ["LB", "ILB", "OLB", "MLB"], db: ["CB", "NB", "DB"], s: ["S", "FS", "SS"] };
    const MIN_ROW = { dl: 3, lb: 2, db: 2, s: 2 };
    const BASE_ROW = { dl: 4, lb: 3, db: 2, s: 2 };
    for (const r of Object.keys(rows)) {
      if (rows[r].length === 0) {
        roster.filter((p) => !used.has(p.id) && FALLBACK[r].includes(String(p.pos || "").toUpperCase()))
          .sort((a, b) => (a.sort ?? 9999) - (b.sort ?? 9999)).slice(0, BASE_ROW[r])
          .forEach((p) => { rows[r].push({ p, lbl: String(p.pos || "").toUpperCase() }); used.add(p.id); });
      }
      while (rows[r].length < MIN_ROW[r]) rows[r].push({ p: null, lbl: r === "s" ? "S" : r === "db" ? "CB" : r.toUpperCase() });
    }
    // Row geometry mirrors real alignments instead of even columns:
    //   DL hugs the box, LBs sit inside the ends (OLBs wide in a 3-4),
    //   corners pin to the sidelines with the nickel tucked closer to the
    //   line, safeties split the deep middle.
    const XS = {
      dl: { 3: [22, 50, 78], 4: [10, 36.7, 63.3, 90], 5: [10, 30, 50, 70, 90] },
      lb: { 2: [33, 67], 3: [26, 50, 74], 4: [12, 38, 62, 88], 5: [10, 30, 50, 70, 90] },
      s: { 1: [50], 2: [33, 67], 3: [25, 50, 75] },
    };
    const spread = (n, i) => (n === 1 ? 50 : 10 + (80 * i) / (n - 1));
    const xFor = (r, n, i) => (XS[r] && XS[r][n] ? XS[r][n][i] : spread(n, i));
    const Y = { dl: 72, lb: 56, db: 40, s: 24 };
    SLOTS = []; assigned = [];
    // Personnel label from what's actually on the field: "4-3 · Nickel"
    const dbN = rows.db.filter((x) => x.p).length + rows.s.filter((x) => x.p).length;
    formationLabel = `${rows.dl.filter((x) => x.p).length}-${rows.lb.filter((x) => x.p).length}` +
      (dbN >= 7 ? " · Quarter" : dbN >= 6 ? " · Dime" : dbN >= 5 ? " · Nickel" : " · Base");
    for (const r of ["dl", "lb", "db", "s"]) {
      const n = rows[r].length;
      rows[r].forEach((it, i) => {
        let x = xFor(r, n, i), y = Y[r];
        if (r === "db") {
          // corners pinned to the sidelines, interior DBs (nickel/dime)
          // spread between them on the same row — never on top of a LB
          const inner = n - 2;
          if (i === 0) x = 11;
          else if (i === n - 1) x = 89;
          else x = inner === 1 ? 50 : 32 + (36 * (i - 1)) / (inner - 1);
          if (n === 1) x = 50;
        }
        SLOTS.push({ lbl: it.lbl, x, y, nextUp: !!it.nextUp });
        assigned.push(it.p);
      });
    }
  }
  // Sideline: everyone on this side of the ball who didn't crack the 11.
  const sideOf = (p) => {
    const u = unitOf(p);
    if (u === "Offense" || u === "Offensive Line") return "offense";
    if (u === "Defense" || u === "Defensive Line") return "defense";
    const m = lblOf(p).match(/^([A-Z]+)/);
    const b = m ? m[1] : null;
    if (b && (OL_POS.has(b) || ["QB", "RB", "FB", "HB", "WR", "TE"].includes(b))) return "offense";
    if (b && /^[LR]?(DE|DT|NT|EDGE|DL|OLB|ILB|MLB|LB|WLB|SLB|MIKE|WILL|SAM|JACK|BUCK|MACK|CB|NB|NCB|SLOT|DB|STAR|DIME|NICKEL|S|FS|SS)$/.test(b)) return "defense";
    return null;
  };
  // Sideline order: by positional importance (the question a bench answers
  // is "who's behind my starter at X"), then depth number within position.
  // Offense: QB > RB > WR > TE > line. Defense: edge > interior > LB > CB > S.
  const SIDELINE_ORDER = unit === "offense"
    ? ["QB", "RB", "HB", "FB", "WR", "TE", "LT", "LG", "C", "RG", "RT", "OT", "OG", "G", "OC", "OL"]
    : ["DE", "LDE", "RDE", "EDGE", "DT", "LDT", "RDT", "NT", "DL", "LB", "ILB", "MLB", "OLB", "LLB", "RLB", "WLB", "SLB", "CB", "LCB", "RCB", "NB", "NCB", "DB", "S", "FS", "SS"];
  const posRank = (p) => {
    const m = lblOf(p).match(/^([A-Z]+)/);
    const base = (m && SIDELINE_ORDER.includes(m[1])) ? m[1] : String(p.pos || "").toUpperCase();
    const i = SIDELINE_ORDER.indexOf(base);
    return i === -1 ? 99 : i;
  };
  const bench = roster
    .filter((p) => !used.has(p.id) && sideOf(p) === unit)
    .sort((a, b) => posRank(a) - posRank(b) || depthNo(a) - depthNo(b) || (b.rating2k ?? -1) - (a.rating2k ?? -1));
  // Ring scheme (no yellow — it collided with the gold 90+ OVR chip):
  //   emerald = Sleeper confirms healthy · orange = Questionable
  //   red = Doubtful · red + faded photo = Out/IR/PUP · slate = no Sleeper data
  return (
    <div className="mt-4">
      {setUnit && <div className="flex gap-2 mb-3">
        {[["offense", "Offense"], ["defense", "Defense"]].map(([k, lbl]) => (
          <button key={k} onClick={() => setUnit(k)}
            className={"flex-1 py-1.5 rounded-full text-[11px] font-extrabold " + (unit === k
              ? "text-white"
              : "bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-800")}
            style={unit === k ? { backgroundColor: teamColor(abbr) } : undefined}>
            {lbl}
          </button>
        ))}
      </div>}
      <div className="relative rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 shadow-sm"
        style={{ paddingBottom: "118%", background: "repeating-linear-gradient(180deg,#1c7c40 0 9%,#166534 9% 18%)" }}>
        {/* subtle top-down light so it reads as turf, not a flat panel */}
        <div className="absolute inset-0" style={{ background: "linear-gradient(180deg,rgba(255,255,255,0.10) 0%,rgba(0,0,0,0) 30%,rgba(0,0,0,0.18) 100%)" }} />
        {/* end zone: team color with painted diagonal texture and big
            stenciled letters — reads like turf paint, not a UI header */}
        <div className="absolute inset-x-0 top-0 flex items-center justify-center overflow-hidden"
          style={{ height: "9%", background: teamColor(abbr) }}>
          <div className="absolute inset-0" style={{ background: "repeating-linear-gradient(45deg, rgba(255,255,255,0.06) 0 10px, transparent 10px 20px)" }} />
          <div className="absolute inset-x-0 top-[18%] h-px bg-white/25" />
          <div className="absolute inset-x-0 bottom-[18%] h-px bg-white/25" />
          {/* painted end-zone lettering: team nickname, outlined like turf paint */}
          <span className="font-black text-[22px] tracking-[0.3em] pl-[0.3em] uppercase text-white select-none"
            style={{ WebkitTextStroke: "1px rgba(0,0,0,0.35)", textShadow: "0 2px 0 rgba(0,0,0,0.25), 0 0 12px rgba(0,0,0,0.25)", opacity: 0.92 }}>
            {(team && team.name ? String(team.name).trim().split(" ").pop() : abbr)}
          </span>
        </div>
        <div className="absolute inset-x-0 h-[2.5px] bg-white/90" style={{ top: "9%" }} />
        {/* line rank: frosted tag sitting just below the line it grades —
            under the OL row on offense, under the DL front on defense */}
        {(() => {
          const lr = unit === "offense" ? lineRank?.ol : lineRank?.def;
          if (!lr || lr.rank == null) return null;
          const tierText = lr.rank <= 10 ? "text-emerald-300"
            : lr.rank <= 20 ? "text-yellow-300"
            : "text-rose-300";
          return (
            <span className="absolute right-2 flex items-baseline gap-1 rounded-md bg-black/35 backdrop-blur-sm px-2 py-1 text-[10px] font-extrabold text-white/90 shadow-sm"
              style={{ top: unit === "offense" ? "66.5%" : "82.5%" }}>
              {unit === "offense" ? "OL" : "DEF"}
              <span className={"tabular-nums " + tierText}>{ordinal(lr.rank)}</span>
            </span>
          );
        })()}
        {/* faint team logo watermark at midfield */}
        {TEAM_LOGOS[abbr] && (
          <img src={TEAM_LOGOS[abbr]} alt="" className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-2/5 opacity-[0.09] pointer-events-none select-none" />
        )}
        {/* personnel tag: what's on the field right now */}
        {formationLabel && (
          <span className="absolute left-2 rounded-md bg-black/35 backdrop-blur-sm px-2 py-1 text-[10px] font-extrabold text-white/90 shadow-sm" style={{ top: "11%" }}>
            {formationLabel}
          </span>
        )}
        <style>{`@keyframes hrbPop { from { opacity: 0; transform: translate(-50%, -50%) scale(.6); } to { opacity: 1; transform: translate(-50%, -50%) scale(1); } }`}</style>
        {/* yard lines (no side numbers — quieter field) */}
        {[16, 24, 32, 40, 48, 56, 64, 72, 80, 88].map((y) => (
          <div key={y} className="absolute inset-x-0 h-px bg-white/45" style={{ top: y + "%" }} />
        ))}
        {/* hash marks */}
        {Array.from({ length: 21 }, (_, i) => 12 + i * 4).map((y) => (
          <React.Fragment key={y}>
            <div className="absolute w-1.5 h-px bg-white/30" style={{ left: "39%", top: y + "%" }} />
            <div className="absolute w-1.5 h-px bg-white/30" style={{ left: "59.5%", top: y + "%" }} />
          </React.Fragment>
        ))}
        {/* sidelines */}
        <div className="absolute inset-y-0 left-0 w-[3px] bg-white/60" />
        <div className="absolute inset-y-0 right-0 w-[3px] bg-white/60" />
        {SLOTS.map((s, i) => {
          const p = assigned[i];
          return (
            <button key={unit + i + (p ? p.id : "")} disabled={!p} onClick={p ? () => onSelectPlayer(p) : undefined}
              className="absolute flex flex-col items-center"
              style={{ left: s.x + "%", top: s.y + "%", transform: "translate(-50%, -50%)", animation: `hrbPop .35s ease-out ${i * 30}ms both` }}>
              <span className="relative">
                {p && photoOf(p, abbr) ? (
                  <img src={photoOf(p, abbr)} alt="" loading="lazy"
                    className={"w-12 h-12 rounded-full object-cover bg-white border-[3px] shadow-md " + ringCls(p)} />
                ) : (
                  <span className={"w-12 h-12 rounded-full flex items-center justify-center text-[10px] font-extrabold shadow-md border-[3px] " + ringCls(p) + (p ? " bg-white/90 text-slate-700" : " bg-white/20 text-white/70 border-dashed")}>
                    {s.lbl}
                  </span>
                )}
                {/* Layout: position = left-edge tag (quietest info, proven
                    spot), rating = bottom pill (the scan target), number
                    merged into the single name line below. One row of text,
                    nothing above the head. */}
                {p && (
                  <span className="absolute top-1/2 -translate-y-1/2 -left-3 px-1 rounded text-[8px] font-extrabold bg-white/85 text-slate-700 shadow">
                    {s.lbl}
                  </span>
                )}
                {p && p.rating2k != null && (
                  <span className={"absolute -bottom-1.5 left-1/2 -translate-x-1/2 px-1.5 rounded-full text-[9px] font-extrabold tabular-nums shadow " +
                    (Math.round(p.rating2k) >= 90 ? "bg-amber-400 text-slate-900"
                      : Math.round(p.rating2k) >= 85 ? "bg-emerald-500 text-white"
                      : Math.round(p.rating2k) >= 70 ? "bg-slate-900/85 text-white"
                      : "bg-rose-600 text-white")}>
                    {Math.round(p.rating2k)}
                  </span>
                )}
                {p && <HealthBadge p={p} />}
              </span>
              <span className="mt-2 text-[9px] font-bold text-white/95 max-w-[100px] truncate drop-shadow">
                {p ? (() => {
                  const parts = p.name.split(" ");
                  const last = /^(jr\.?|sr\.?|ii|iii|iv|v)$/i.test(parts[parts.length - 1] || "")
                    ? parts.slice(-2).join(" ")
                    : parts.slice(-1)[0];
                  const no = cleanNo(p.no);
                  return (no ? "#" + no + " " : "") + last;
                })() : ""}
              </span>
            </button>
          );
        })}
      </div>
      {/* The sideline: everyone on this side of the ball who isn't in the 11.
          Horizontal scroll, best-rated first — depth at a glance without
          stealing space from the formation. */}
      {bench.length > 0 && (
        <div className="mt-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm px-2 pt-2 pb-1">
          <div className="flex items-baseline justify-between px-1 mb-1.5">
            <span className="text-[9px] font-semibold tracking-widest uppercase text-slate-400">Sideline</span>
            <span className="text-[9px] font-bold text-slate-400 tabular-nums truncate ml-3">
              {(() => {
                const counts = {};
                for (const b of bench) { const k = (baseOf(b) && norm(baseOf(b))) || String(b.pos || "").toUpperCase() || "?"; counts[k] = (counts[k] || 0) + 1; }
                return Object.entries(counts).map(([k, n]) => `${k} (${n})`).join(" · ");
              })()}
            </span>
          </div>
          <div className="flex gap-3 overflow-x-auto pt-3 pb-1.5 px-1">
            {bench.map((p) => (
              <button key={p.id} onClick={() => onSelectPlayer(p)} className="flex flex-col items-center shrink-0 w-[68px]">
                <span className="relative">
                  {photoOf(p, abbr) ? (
                    <img src={photoOf(p, abbr)} alt="" loading="lazy"
                      className={"w-12 h-12 rounded-full object-cover bg-white border-[3px] " + ringCls(p).replace("border-white", "border-slate-200 dark:border-slate-700")} />
                  ) : (
                    <span className={"w-12 h-12 rounded-full flex items-center justify-center text-[9px] font-extrabold bg-slate-100 dark:bg-slate-800 text-slate-500 border-[3px] " + ringCls(p).replace("border-white", "border-slate-200 dark:border-slate-700")}>
                      {String(p.pos || "").toUpperCase() || "—"}
                    </span>
                  )}
                  <HealthBadge p={p} small />
                  {p.rating2k != null && (
                    <span className={"absolute -bottom-1 left-1/2 -translate-x-1/2 px-1 rounded-full text-[8px] font-extrabold tabular-nums shadow " +
                      (Math.round(p.rating2k) >= 90 ? "bg-amber-400 text-slate-900"
                        : Math.round(p.rating2k) >= 85 ? "bg-emerald-500 text-white"
                        : Math.round(p.rating2k) >= 70 ? "bg-slate-900/85 text-white"
                        : "bg-rose-600 text-white")}>
                      {Math.round(p.rating2k)}
                    </span>
                  )}
                </span>
                <span className="mt-2 text-[9px] font-bold text-slate-600 dark:text-slate-300 max-w-full truncate">
                  {(() => {
                    const parts = String(p.name).split(" ");
                    const last = /^(jr\.?|sr\.?|ii|iii|iv|v)$/i.test(parts[parts.length - 1] || "")
                      ? parts.slice(-2).join(" ")
                      : parts.slice(-1)[0];
                    const no = cleanNo(p.no);
                    return (no ? "#" + no + " " : "") + last;
                  })()}
                </span>
                <span className="text-[8px] font-semibold text-slate-400 uppercase">{p.sortLabel || p.pos || ""}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {(team && (team.headCoach || team.offCoord || team.defCoord)) && (
        <div className="mt-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm px-3 py-2.5 grid grid-cols-3 gap-2">
          {[["Head Coach", team.headCoach], ["Off. Coordinator", team.offCoord], ["Def. Coordinator", team.defCoord]].map(([k, v]) => (
            <div key={k} className="min-w-0">
              <div className="text-[8px] font-semibold tracking-widest uppercase text-slate-400">{k}</div>
              <div className="text-[11px] font-bold text-slate-800 dark:text-slate-100 truncate">{v || "—"}</div>
            </div>
          ))}
        </div>
      )}
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

function ListHeader({ title, q, setQ, placeholder, pills, noSearch }) {
  return (
    <div className="bg-blue-600 px-5 pb-5 text-white sticky top-0 z-10 shadow-md" style={{ paddingTop: "calc(env(safe-area-inset-top) + 1.5rem)" }}>
      <div className="text-2xl font-extrabold tracking-tight">{title}</div>
      {!noSearch && <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={placeholder || "Search players or teams…"}
        className="mt-3 w-full rounded-xl px-4 py-2.5 text-sm text-slate-800 dark:text-slate-200 bg-white/95 dark:bg-slate-900/80 placeholder-slate-400 outline-none"
      />}
      {pills}
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
// Hub for the Players bottom tab: one place for players, injuries, contracts, draft
function PlayersHub({ players, onSelect }) {
  const [view, setView] = useState("players");
  const pills = (
    <div className="flex gap-2 mt-3 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
      {[["players", "Players"], ["injury", "🏥 Injury Report"], ["contracts", "Contracts"], ["draft", "Draft"]].map(([k, lbl]) => (
        <button key={k} onClick={() => setView(k)}
          className={"shrink-0 px-3.5 py-1.5 rounded-full text-[11px] font-extrabold " + (view === k ? "bg-white text-blue-700" : "bg-blue-500/60 text-blue-100 active:bg-blue-500")}>
          {lbl}
        </button>
      ))}
    </div>
  );
  if (view === "contracts") return <ContractsTab players={players} onSelect={onSelect} pills={pills} />;
  if (view === "draft") return <DraftTab players={players} onSelect={onSelect} pills={pills} />;
  return <PlayersTab players={players} onSelect={onSelect} pills={pills} forceInj={view === "injury"} key={view} />;
}

function PlayersTab({ players, onSelect, pills, forceInj }) {
  const [q, setQ] = useState("");
  const injOnly = !!forceInj;
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
      <ListHeader title={<>{injOnly ? "Injury Report" : "Players"} <span className="text-[10px] font-bold text-white/50 align-middle">{NFL_VERSION}</span></>} q={q} setQ={setQ} pills={pills} />
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
          {list.length === 0 && injOnly && <div className="text-center text-sm text-slate-400 py-12 px-6">No injuries reported right now.</div>}
          {list.length === 0 && !injOnly && <div className="text-center text-sm text-slate-400 py-12">No players match "{q}".</div>}
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
      {n} OVR
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

function ContractsTab({ players, onSelect, pills }) {
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
      <ListHeader title="Contracts" q={q} setQ={setQ} pills={pills} />
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
      <ListHeader title="Teams" q={q} setQ={setQ} noSearch />
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
                    {(() => { const r = teamRec(t, seasonStarted(teams)); return [["W", r.w], ["L", r.l], ...(r.t > 0 ? [["T", r.t]] : [])]; })().map(([lbl, v]) => (
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
const OL_POS = new Set(["LT", "LG", "C", "RG", "RT", "OT", "OG", "G", "T", "OC", "OL"]);
const DL_POS = new Set(["DE", "DT", "NT", "EDGE", "DL", "LDE", "RDE", "LDT", "RDT"]);
const DEF_POS = new Set([...DL_POS, "LB", "ILB", "OLB", "MLB", "LOLB", "ROLB", "LLB", "RLB", "WLB", "SLB", "CB", "LCB", "RCB", "NB", "NCB", "SLOT", "DB", "S", "FS", "SS"]);
function computeLineRanks(players, teams) {
  // A player counts toward a line by Position OR by depth label — so an
  // "LDE1" whose Position field says LB still counts as a defensive lineman.
  const baseLabel = (p) => {
    const m = String(p.sortLabel || "").toUpperCase().match(/^([A-Z]+)/);
    return m ? m[1] : null;
  };
  const per = {};
  for (const t of teams || []) {
    const a = t.abbr || toAbbr(t.name);
    if (!a) continue;
    // IDENTICAL matching to TeamDetail's roster — including the full
    // team-name fallback. Without it, teams whose players only match by
    // name (e.g. Buffalo) render a formation but compute no line rank.
    const roster = players.filter((p) => {
      if (p.teamId && p.teamId === t.id) return true;
      const tm = teamOfPlayer(p);
      return tm && (tm === a || String(p.teamName || "").toLowerCase() === String(t.name || "").toLowerCase());
    });
    const avgTop = (posSet, n, min = 3) => {
      // Injury-aware: a starter on IR/OUT doesn't count toward the unit's grade,
      // so a team that loses its 95-OVR corner sees its DEF rank drop.
      const rated = roster
        .filter((p) => (posSet.has(String(p.pos || "").toUpperCase()) || posSet.has(baseLabel(p))) && p.rating2k != null && !injIsOut(injFor(p.name, a)))
        .map((p) => Number(p.rating2k))
        .sort((x, y) => y - x)
        .slice(0, n);
      return rated.length >= min ? rated.reduce((s, v) => s + v, 0) / rated.length : null;
    };
    // def = whole defense: top-11 rated defenders, needs 7+ to count.
    // Scheme-agnostic on purpose — a 3-4 and a 4-3 team compare fairly.
    per[a] = { ol: { avg: avgTop(OL_POS, 5) }, dl: { avg: avgTop(DL_POS, 4) }, def: { avg: avgTop(DEF_POS, 11, 7) } };
  }
  for (const key of ["ol", "dl", "def"]) {
    const ranked = Object.entries(per)
      .filter(([, v]) => v[key].avg != null)
      .sort((x, y) => y[1][key].avg - x[1][key].avg);
    ranked.forEach(([a], i) => { per[a][key].rank = i + 1; });
  }
  return per;
}

// ── Team Stats: Leaders (with trend arrows) · Volume (carry/target share bars) · Defense ──
function playerSeasonRow(p, seasonStats) {
  if (!seasonStats || !seasonStats.players) return null;
  const nm = hrbNrmSafe(p.name), abbr = toAbbr(teamOfPlayer(p) || p.teamName || "");
  const c = Object.values(seasonStats.players).filter((q) => hrbNrmSafe(q.name) === nm);
  return (c.length > 1 ? c.find((q) => injTeamEq(q.team, abbr)) || c[0] : c[0]) || null;
}
// ▲ / ▼ / → : last 3 games vs season average for a per-game stat
function TrendArrow({ row, k }) {
  if (!row || !row.games || row.games.length < 2) return null;
  const g = row.games, last = g.slice(-3), avg = row.perGame[k] || 0;
  const recent = last.reduce((a, x) => a + (x[k] || 0), 0) / last.length;
  if (!avg && !recent) return null;
  const r = avg ? recent / avg : 2;
  const up = r >= 1.15, down = r <= 0.85;
  return <span className={"text-[10px] font-extrabold " + (up ? "text-emerald-500" : down ? "text-rose-500" : "text-slate-400")}>{up ? "▲" : down ? "▼" : "→"}</span>;
}
function TeamStatsPanel({ roster, abbr, seasonStats, mode, setMode, onSelectPlayer }) {
  const rows = roster.map((p) => ({ p, s: playerSeasonRow(p, seasonStats) })).filter((x) => x.s && x.s.totals && x.s.totals.gp);
  const yr = seasonStats ? seasonStats.season : "";
  const Bar = ({ label, sub, pct, val, arrow, color, onClick }) => (
    <button onClick={onClick} className="w-full text-left py-1.5">
      <div className="flex items-baseline justify-between text-[11px]">
        <span className="font-bold text-slate-800 dark:text-slate-100 truncate flex items-center gap-1.5">{label}{arrow}<span className="text-slate-400 font-medium">{sub}</span></span>
        <span className="font-extrabold tabular-nums text-slate-700 dark:text-slate-200 ml-2 shrink-0">{val}</span>
      </div>
      <div className="mt-1 h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
        <div className="h-full rounded-full" style={{ width: Math.max(2, Math.min(100, pct)) + "%", backgroundColor: color }} />
      </div>
    </button>
  );
  const Section = ({ title, children }) => (
    <div className="mt-4">
      <div className="text-[11px] font-bold tracking-widest text-slate-400 uppercase mb-1.5 px-1">{title}</div>
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm px-4 py-2 divide-y divide-slate-100 dark:divide-slate-800">{children}</div>
    </div>
  );
  const color = teamColor(abbr);
  const sumBy = (k) => rows.reduce((a, x) => a + (x.s.totals[k] || 0), 0);
  const empty = <div className="text-center text-xs text-slate-400 py-10">No {yr} box-score stats for this roster yet.</div>;
  return (
    <>
      <div className="flex gap-2 mt-4">
        {[["leaders", "Leaders"], ["volume", "Volume"], ["defense", "Defense"]].map(([k, lbl]) => (
          <button key={k} onClick={() => setMode(k)}
            className={"flex-1 py-1.5 rounded-full text-[11px] font-bold " + (mode === k ? "text-white" : "bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-800")}
            style={mode === k ? { backgroundColor: color } : undefined}>{lbl}</button>
        ))}
      </div>
      {!rows.length ? empty : mode === "leaders" ? (() => {
        const top = (k, n = 5) => rows.filter((x) => (x.s.totals[k] || 0) > 0).sort((a, b) => b.s.totals[k] - a.s.totals[k]).slice(0, n);
        const block = (title, k, unit, pgKey) => {
          const list = top(k); if (!list.length) return null;
          const max = list[0].s.totals[k];
          return (
            <Section key={title} title={title}>
              {list.map(({ p, s }) => <Bar key={p.id} label={p.name} sub={" " + (p.pos || "")} arrow={<TrendArrow row={s} k={pgKey || k} />} pct={(s.totals[k] / max) * 100} val={s.totals[k] + unit} color={color} onClick={() => onSelectPlayer(p)} />)}
            </Section>
          );
        };
        return (
          <>
            {block(yr + " Rushing Yards", "rushYds", " yds", "rushYds")}
            {block(yr + " Receiving Yards", "recYds", " yds", "recYds")}
            {block(yr + " Touchdowns", "td", " TD", "recTd")}
            {block(yr + " Targets", "tgt", "", "tgt")}
            {block(yr + " Tackles", "tkl", "", "tkl")}
            {block(yr + " Sacks", "sacks", "", "sacks")}
            <div className="text-[9px] text-slate-400 mt-2 px-1">▲ ▼ = last 3 games vs season average (up 15%+ / down 15%+)</div>
          </>
        );
      })() : mode === "volume" ? (() => {
        const carries = sumBy("car"), targets = sumBy("tgt");
        const rush = rows.filter((x) => (x.s.totals.car || 0) > 0).sort((a, b) => b.s.totals.car - a.s.totals.car).slice(0, 8);
        const rec = rows.filter((x) => (x.s.totals.tgt || 0) > 0).sort((a, b) => b.s.totals.tgt - a.s.totals.tgt).slice(0, 10);
        return (
          <>
            <Section title={yr + " Rushing · carry share"}>
              {rush.map(({ p, s }) => <Bar key={p.id} label={p.name} sub={" " + (p.pos || "")} arrow={<TrendArrow row={s} k="car" />} pct={(s.totals.car / Math.max(1, carries)) * 100} val={Math.round((s.totals.car / Math.max(1, carries)) * 100) + "% · " + s.totals.car + " car"} color={color} onClick={() => onSelectPlayer(p)} />)}
            </Section>
            <Section title={yr + " Receiving · target share"}>
              {rec.map(({ p, s }) => <Bar key={p.id} label={p.name} sub={" " + (p.pos || "")} arrow={<TrendArrow row={s} k="tgt" />} pct={(s.totals.tgt / Math.max(1, targets)) * 100} val={Math.round((s.totals.tgt / Math.max(1, targets)) * 100) + "% · " + s.totals.tgt + " tgt"} color={color} onClick={() => onSelectPlayer(p)} />)}
            </Section>
          </>
        );
      })() : (() => {
        const block = (title, k, n = 8) => {
          const list = rows.filter((x) => (x.s.totals[k] || 0) > 0).sort((a, b) => b.s.totals[k] - a.s.totals[k]).slice(0, n);
          if (!list.length) return null;
          const max = list[0].s.totals[k];
          return (
            <Section key={title} title={title}>
              {list.map(({ p, s }) => <Bar key={p.id} label={p.name} sub={" " + (p.pos || "")} arrow={<TrendArrow row={s} k={k} />} pct={(s.totals[k] / max) * 100} val={String(s.totals[k])} color={color} onClick={() => onSelectPlayer(p)} />)}
            </Section>
          );
        };
        return (
          <>
            {block(yr + " Tackles", "tkl")}
            {block(yr + " Sacks", "sacks", 6)}
            {block(yr + " Interceptions", "defInt", 6)}
            {block(yr + " Passes Defended", "pd", 6)}
            {block(yr + " Tackles for Loss", "tfl", 6)}
          </>
        );
      })()}
    </>
  );
}

function TeamDetail({ team, teams, players, onBack, onSelectPlayer, seasonStats }) {
  useEffect(() => { window.scrollTo(0, 0); }, []);
  const abbr = team.abbr || toAbbr(team.name);
  const [seg, setSeg] = useState("roster");
  // Inside Roster: "list" (full roster), "offense" or "defense" (formation)
  const [rosterView, setRosterView] = useState("list");
  const unit = rosterView === "list" ? null : rosterView;
  const lineRanks = useMemo(() => computeLineRanks(players, teams), [players, teams]);
  const [roleFilter, setRoleFilter] = useState(null);
  const [chartMode, setChartMode] = useState("leaders");
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
        <div className={"grid gap-2 " + (seg === "roster" && unit ? "grid-cols-4" : "grid-cols-3")}>
          {(() => {
            const started = seasonStarted(teams);
            const pts = teamPts(team, started);
            const sx = team.stx || {}; // per-team stats merged from /api/standings
            // Rank line under each stat: top 10 green, 11-20 yellow, bottom 12 red.
            // (Passed as {label, cls} — the format Tile's sub actually renders;
            // a JSX element here silently displays nothing, which is why ranks
            // were invisible before.)
            const rk = (rank) => rank == null ? null : {
              label: ordinal(rank),
              cls: rank <= 10 ? "text-green-600 dark:text-green-400"
                : rank <= 20 ? "text-yellow-600 dark:text-yellow-400"
                : "text-red-500 dark:text-red-400",
            };
            if (seg === "roster" && unit === "offense") {
              return (
                <>
                  <Tile compact value={sx.passYpg != null ? sx.passYpg.toFixed(1) : "—"} label="Pass Yds" sub={rk(sx.passYpgRank)} />
                  <Tile compact value={sx.passTd != null ? sx.passTd : "—"} label="Pass TD" sub={rk(sx.passTdRank)} />
                  <Tile compact value={sx.rushYpg != null ? sx.rushYpg.toFixed(1) : "—"} label="Rush Yds" sub={rk(sx.rushYpgRank)} />
                  <Tile compact value={sx.rushTd != null ? sx.rushTd : "—"} label="Rush TD" sub={rk(sx.rushTdRank)} />
                </>
              );
            }
            if (seg === "roster" && unit === "defense") {
              return (
                <>
                  <Tile compact value={sx.defPassYpg != null ? sx.defPassYpg.toFixed(1) : "—"} label="Pass Yds" sub={rk(sx.defPassYpgRank)} />
                  <Tile compact value={sx.defPassTd != null ? sx.defPassTd : "—"} label="Pass TD" sub={rk(sx.defPassTdRank)} />
                  <Tile compact value={sx.defRushYpg != null ? sx.defRushYpg.toFixed(1) : "—"} label="Rush Yds" sub={rk(sx.defRushYpgRank)} />
                  <Tile compact value={sx.defRushTd != null ? sx.defRushTd : "—"} label="Rush TD" sub={rk(sx.defRushTdRank)} />
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
          {[["roster", "Roster"], ["contracts", "Contracts"], ["charts", "Stats"]].map(([k, lbl]) => (
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
          <div className="flex gap-2 mt-3">
            {[["offense", "Offense"], ["defense", "Defense"]].map(([k, lbl]) => (
              <button key={k} onClick={() => setRosterView(rosterView === k ? "list" : k)}
                className={"flex-1 py-1.5 rounded-full text-[11px] font-extrabold transition-colors " + (rosterView === k
                  ? "text-white"
                  : "bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-800")}
                style={rosterView === k ? { backgroundColor: teamColor(abbr) } : undefined}>
                {lbl}
              </button>
            ))}
          </div>
        )}
        {seg === "roster" && unit && <FormationView roster={roster} abbr={abbr} unit={unit} onSelectPlayer={onSelectPlayer} lineRank={lineRanks[abbr]} team={team} />}
        {seg === "roster" && !unit && orderedRoles.map((role) => (
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

        {seg === "charts" && <TeamStatsPanel roster={roster} abbr={abbr} seasonStats={seasonStats} mode={chartMode} setMode={setChartMode} onSelectPlayer={onSelectPlayer} />}

        {seg === "roster" && !unit && roster.length === 0 && (
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

function DraftTab({ players, onSelect, pills }) {
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
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-extrabold text-white">Draft</h1>
          {/* one dropdown instead of a scroll of years — native picker on iOS */}
          <label className="relative">
            <select value={yr ?? ""} onChange={(e) => setSelYear(Number(e.target.value))}
              className="appearance-none bg-white text-blue-700 font-extrabold text-sm rounded-full pl-4 pr-8 py-1.5 outline-none">
              {years.map((y) => <option key={y} value={y}>{y} Draft Class</option>)}
            </select>
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-blue-700 text-xs">▾</span>
          </label>
        </div>
        {pills}
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
// ═══════════════ TD BOARD ════════════════════════════════════════
// Weekly anytime-TD board. Each card is "player vs this week's defense":
//   rank · headshot · POS Name · [opp logo] vs OPP
//   ROLE | OPP vs POS: TD/G · YDS/G | TD SHARE · IMP TOTAL |  big TD%
// Real data only — if the endpoint isn't live, the tab says so plainly.
// Rank colors on the opponent tiles: high rank number = defense allows a
// lot to this position = good for the scorer (green).
const rankTile = (rank) => (rank == null ? "bg-slate-100 text-slate-400 dark:bg-slate-800"
  : rank >= 23 ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
  : rank >= 11 ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
  : "bg-rose-500/15 text-rose-600 dark:text-rose-400");
const valTile = (val, good, ok) => (val == null ? "bg-slate-100 text-slate-400 dark:bg-slate-800"
  : val >= good ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
  : val >= ok ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
  : "bg-rose-500/15 text-rose-600 dark:text-rose-400");

function TdBoardTab({ players, teams, onSelect }) {
  const [board, setBoard] = useState(null);
  const [sb, setSb] = useState(null);
  const [seg, setSeg] = useState("matchups");
  const [digestWeek, setDigestWeek] = useState(null);
  const [digest, setDigest] = useState(null);       // { week, stats, games }
  const [history, setHistory] = useState(null);
  const season = new Date().getMonth() >= 8 ? new Date().getFullYear() : new Date().getFullYear() - 1;
  useEffect(() => {
    if (seg !== "digest") return;
    const w = digestWeek ?? (sb?.week ?? 1);
    let alive = true;
    setDigest(null);
    Promise.all([
      fetch(`/api/week-stats?season=${season}&week=${w}`).then((r) => r.json()).catch(() => null),
      fetch(`/api/scoreboard?week=${w}`).then((r) => r.json()).catch(() => null),
    ]).then(([stats, games]) => { if (alive) setDigest({ week: w, stats, games }); });
    return () => { alive = false; };
  }, [seg, digestWeek, sb?.week]);
  useEffect(() => {
    if (seg !== "history" || history) return;
    fetch(`/api/td-history?season=${season}`).then((r) => r.json()).then(setHistory).catch(() => setHistory({ weeks: [], error: "unreachable" }));
  }, [seg]);
  useEffect(() => {
    fetch("/api/td-board").then((r) => r.json()).then(setBoard).catch(() => setBoard({ ready: false, cards: [], reason: "Couldn't reach the board endpoint." }));
  }, []);
  useEffect(() => {
    let alive = true;
    const load = () => fetch("/api/scoreboard").then((r) => r.json()).then((d) => { if (alive && d && d.games) setSb(d); }).catch(() => {});
    load();
    const t = setInterval(load, 60000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  const live = board && board.ready;
  const cards = live ? board.cards : [];
  const findPlayer = (c) => players.find((p) => hrbNrmSafe(p.name) === hrbNrmSafe(c.name));
  const week = sb?.week ?? board?.week ?? 1;
  const gamesByDay = useMemo(() => {
    const out = [];
    for (const g of (sb?.games || [])) {
      const d = new Date(g.date);
      const key = d.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
      let grp = out.find((x) => x.key === key);
      if (!grp) { grp = { key, games: [] }; out.push(grp); }
      grp.games.push(g);
    }
    return out;
  }, [sb]);

  return (
    <div>
      <div className="bg-blue-600 pb-3 px-4" style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.75rem)" }}>
        <div className="flex items-baseline gap-2 flex-wrap">
          <h1 className="text-xl font-extrabold text-white">{seg === "matchups" ? "Matchups" : seg === "digest" ? "Digest" : seg === "history" ? "History" : "TD Targets"} <span className="text-blue-200">(Wk {seg === "digest" ? (digestWeek ?? week) : week})</span></h1>
          <span className="text-[11px] font-semibold text-blue-200">
            {seg === "matchups"
              ? (sb ? "scores " + new Date(sb.updatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) + " ↻" : "loading…")
              : (live ? "v1 · " + new Date(board.updatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "v1")}
          </span>
        </div>
      </div>
      <div className="px-4 pt-3">
        <div className="flex gap-2 mb-3">
          {[["matchups", "Matchups"], ["board", "TD Targets"], ["digest", "Digest"], ["history", "History"]].map(([k, lbl]) => (
            <button key={k} onClick={() => setSeg(k)}
              className={"flex-1 py-1.5 rounded-full text-xs font-bold " + (seg === k ? "bg-blue-600 text-white" : "bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-800")}>
              {lbl}
            </button>
          ))}
        </div>

        {seg === "matchups" ? (
          <>
            {!sb && <div className="p-6 text-center text-xs text-slate-400">Loading this week's games…</div>}
            {sb && sb.games.length === 0 && <div className="p-6 text-center text-xs text-slate-400">No games scheduled this week.</div>}
            {gamesByDay.map((grp) => (
              <div key={grp.key} className="mb-4">
                <div className="text-[10px] font-semibold tracking-widest uppercase text-slate-400 mb-1.5">{grp.key}</div>
                <div className="space-y-1.5">
                  {grp.games.map((g) => {
                    const isLive = g.state === "in", isFinal = g.state === "post";
                    const kickoff = new Date(g.date).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
                    const Row = ({ t }) => {
                      const hasBall = isLive && g.possession && String(g.possession) === String(t.id);
                      const lost = isFinal && !t.winner;
                      return (
                        <div className="flex items-center gap-2.5">
                          <img src={t.logo || TEAM_LOGOS[t.abbr] || ""} alt="" className="w-7 h-7 rounded-full bg-white object-contain shrink-0" />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline gap-1.5">
                              <span className={"text-[13px] font-extrabold tracking-wide " + (lost ? "text-slate-400" : "text-slate-900 dark:text-white")}>{t.abbr}</span>
                              {t.record && <span className="text-[10px] font-semibold text-slate-400 tabular-nums">{t.record}</span>}
                            </div>
                            <div className="text-[10px] text-slate-400 truncate leading-tight">{t.name}</div>
                          </div>
                          <div className={"w-8 text-right text-lg font-extrabold tabular-nums " + (lost ? "text-slate-400" : "text-slate-900 dark:text-white")}>
                            {g.state === "pre" ? "" : (t.score ?? 0)}
                            {hasBall && <span className="ml-1 text-[10px] text-rose-500 align-middle">▼</span>}
                          </div>
                        </div>
                      );
                    };
                    return (
                      <div key={g.id} className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm px-3 py-2 flex items-center gap-2">
                        <div className="flex-1 min-w-0 space-y-1.5">
                          <Row t={g.away} />
                          <Row t={g.home} />
                        </div>
                        <div className="w-20 shrink-0 text-center border-l border-slate-100 dark:border-slate-800 pl-2">
                          {isLive ? (
                            <>
                              <div className="text-xs font-extrabold text-slate-900 dark:text-white uppercase">{g.detail}</div>
                              {g.downDistance && <div className={"text-[10px] font-semibold mt-0.5 " + (g.redZone ? "text-rose-500" : "text-slate-400")}>{g.downDistance}</div>}
                            </>
                          ) : isFinal ? (
                            <div className="text-xs font-extrabold text-slate-500 dark:text-slate-300">Final</div>
                          ) : (
                            <>
                              <div className="text-xs font-extrabold text-slate-900 dark:text-white tabular-nums">{kickoff}</div>
                              {g.broadcast && <div className="text-[9px] font-semibold text-slate-400">{g.broadcast}</div>}
                            </>
                          )}
                          {g.odds && (g.odds.details || g.odds.overUnder != null) && !isFinal && (
                            <div className="text-[9px] font-semibold text-slate-400 mt-0.5 tabular-nums">
                              {g.odds.details}{g.odds.overUnder != null ? ` · O/U ${g.odds.overUnder}` : ""}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </>
        ) : seg === "digest" ? (() => {
          const wk = digestWeek ?? week;
          const weeksList = Array.from({ length: Math.max(1, sb?.week ?? 1) }, (_, i) => i + 1);
          const st = digest && digest.stats, gm = digest && digest.games;
          const plist = st && st.players ? Object.values(st.players) : [];
          const top = (k, n = 8) => plist.map((p) => ({ p, v: p.games.reduce((a, g) => a + (g[k] || 0), 0), g: p.games[0] })).filter((x) => x.v > 0).sort((a, b) => b.v - a.v).slice(0, n);
          const tdList = plist.map((p) => ({ p, v: p.games.reduce((a, g) => a + (g.rushTd || 0) + (g.recTd || 0), 0), g: p.games[0] })).filter((x) => x.v > 0).sort((a, b) => b.v - a.v).slice(0, 10);
          const teamsArr = st && st.teams ? Object.entries(st.teams) : [];
          const defWorst = teamsArr.map(([a, t]) => ({ a, y: (t.def.passYds || 0) + (t.def.rushYds || 0), pa: t.pa })).sort((x, y) => y.y - x.y).slice(0, 5);
          const defBest = teamsArr.map(([a, t]) => ({ a, y: (t.def.passYds || 0) + (t.def.rushYds || 0), pa: t.pa })).sort((x, y) => x.y - y.y).slice(0, 5);
          const Row = ({ x, val }) => (
            <div className="flex items-center gap-2 py-1.5 text-[12px]">
              {TEAM_LOGOS[x.p.team] && <img src={TEAM_LOGOS[x.p.team]} alt="" className="w-4 h-4 rounded-full bg-white object-contain" />}
              <span className="flex-1 truncate font-bold text-slate-800 dark:text-slate-100">{x.p.name}<span className="text-slate-400 font-medium"> {x.p.pos || ""} · {x.p.team}{x.g ? " vs " + x.g.opp : ""}</span></span>
              <span className="font-extrabold tabular-nums text-slate-700 dark:text-slate-200">{val}</span>
            </div>
          );
          const Card = ({ title, children }) => (
            <div className="mb-3">
              <div className="text-[10px] font-semibold tracking-widest uppercase text-slate-400 mb-1.5">{title}</div>
              <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-3 py-1 divide-y divide-slate-100 dark:divide-slate-800">{children}</div>
            </div>
          );
          return (
            <>
              <div className="flex gap-1.5 overflow-x-auto pb-2 mb-2" style={{ scrollbarWidth: "none" }}>
                {weeksList.map((w) => (
                  <button key={w} onClick={() => setDigestWeek(w)}
                    className={"shrink-0 px-3 py-1 rounded-full text-[11px] font-bold " + (wk === w ? "bg-blue-600 text-white" : "bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-800")}>Wk {w}</button>
                ))}
              </div>
              {!digest && <div className="p-6 text-center text-xs text-slate-400">Building the Week {wk} digest…</div>}
              {digest && (!st || !st.gamesFinal) && <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 text-center text-xs text-slate-400">No finished games in Week {wk} yet — the digest fills in as games go final.</div>}
              {digest && st && st.gamesFinal > 0 && (
                <>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mb-3">{st.gamesFinal} of {st.gamesScheduled} games final.</div>
                  {gm && gm.games && (
                    <Card title="Scores">
                      {gm.games.filter((g) => g.state === "post").map((g) => (
                        <div key={g.id} className="flex items-center justify-between py-1.5 text-[12px] tabular-nums">
                          <span className={"font-bold " + (g.away.winner ? "text-slate-900 dark:text-white" : "text-slate-400")}>{g.away.abbr} {g.away.score}</span>
                          <span className="text-slate-300 text-[10px]">@</span>
                          <span className={"font-bold " + (g.home.winner ? "text-slate-900 dark:text-white" : "text-slate-400")}>{g.home.score} {g.home.abbr}</span>
                        </div>
                      ))}
                    </Card>
                  )}
                  <Card title="Touchdown scorers">{tdList.map((x) => <Row key={x.p.id} x={x} val={x.v + " TD"} />)}</Card>
                  <Card title="Most targets">{top("tgt").map((x) => <Row key={x.p.id} x={x} val={x.v} />)}</Card>
                  <Card title="Most carries">{top("car").map((x) => <Row key={x.p.id} x={x} val={x.v} />)}</Card>
                  <Card title="Passing yards">{top("passYds", 6).map((x) => <Row key={x.p.id} x={x} val={x.v} />)}</Card>
                  <Card title="Defenses that got gashed · total yds allowed">
                    {defWorst.map((d) => <div key={d.a} className="flex items-center justify-between py-1.5 text-[12px]"><span className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">{TEAM_LOGOS[d.a] && <img src={TEAM_LOGOS[d.a]} alt="" className="w-4 h-4 rounded-full bg-white object-contain" />}{d.a}</span><span className="font-extrabold tabular-nums text-rose-500">{d.y} yds · {d.pa} pts</span></div>)}
                  </Card>
                  <Card title="Defenses that shut it down">
                    {defBest.map((d) => <div key={d.a} className="flex items-center justify-between py-1.5 text-[12px]"><span className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">{TEAM_LOGOS[d.a] && <img src={TEAM_LOGOS[d.a]} alt="" className="w-4 h-4 rounded-full bg-white object-contain" />}{d.a}</span><span className="font-extrabold tabular-nums text-emerald-500">{d.y} yds · {d.pa} pts</span></div>)}
                  </Card>
                </>
              )}
            </>
          );
        })() : seg === "history" ? (
          <>
            {!history && <div className="p-6 text-center text-xs text-slate-400">Loading the calibration log…</div>}
            {history && history.error && <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 text-xs text-slate-400">History needs the Airtable table <b>TD Log</b> (see setup) — {history.error}</div>}
            {history && !history.error && history.weeks.length === 0 && (
              <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 text-center">
                <div className="text-xs font-bold text-slate-700 dark:text-slate-200">No boards logged yet</div>
                <div className="text-[11px] text-slate-400 mt-1">Each Saturday the top 25 is snapshotted to Airtable; after the games it's scored here against actual touchdowns.</div>
              </div>
            )}
            {history && history.weeks.map((w) => (
              <div key={w.week} className="mb-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
                <div className="px-3 py-2 flex items-baseline justify-between border-b border-slate-100 dark:border-slate-800">
                  <div className="text-xs font-extrabold text-slate-800 dark:text-slate-100">Week {w.week} <span className="text-slate-400 font-semibold">· {w.picks.length} picks{w.final ? "" : " · in progress"}</span></div>
                  {w.n > 0 && <div className="text-[11px] font-bold tabular-nums"><span className={w.hits >= w.expected ? "text-emerald-500" : "text-amber-500"}>{w.hits} hit</span> <span className="text-slate-400">/ {w.expected} expected</span></div>}
                </div>
                {w.n > 0 && (
                  <div className="px-3 py-1.5 flex gap-1.5 border-b border-slate-100 dark:border-slate-800">
                    {w.buckets.map((b) => (
                      <div key={b.range} className="flex-1 text-center rounded-md bg-slate-50 dark:bg-slate-800 py-1">
                        <div className="text-[8px] text-slate-400 font-semibold">{b.range}</div>
                        <div className="text-[11px] font-extrabold tabular-nums text-slate-700 dark:text-slate-200">{b.n ? `${b.hits}/${b.n}` : "—"}</div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {w.picks.map((p) => (
                    <div key={p.rank + p.player} className="px-3 py-1.5 flex items-center gap-2 text-[12px]">
                      <span className="w-4 text-slate-400 tabular-nums">{p.rank}</span>
                      <span className="flex-1 truncate font-bold text-slate-800 dark:text-slate-100">{p.player}<span className="text-slate-400 font-medium"> {p.pos} · {p.team} vs {p.opp}</span></span>
                      <span className="text-slate-400 tabular-nums">{Math.round((p.tdPct || 0) * 100)}%</span>
                      <span className={"w-5 text-center font-extrabold " + (p.hit == null ? "text-slate-300" : p.hit ? "text-emerald-500" : "text-rose-400")}>{p.hit == null ? "·" : p.hit ? "✓" : "✗"}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {history && !history.error && (
              <div className="text-[9px] text-slate-400 mt-1 px-1">Buckets show hits/picks by predicted TD% — a calibrated model hits ~40% of its 30–45% picks, ~50% of its 45–60% picks, and so on.</div>
            )}
          </>
        ) : (
          <>
            {!board && <div className="p-6 text-center text-xs text-slate-400">Building this week's board…</div>}
            {board && !live && (
              <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4">
                <div className="text-xs font-bold text-slate-700 dark:text-slate-200">Board isn't live yet</div>
                <div className="text-[11px] text-slate-400 mt-1">{board.reason || "The data source didn't return player stats."} Nothing is shown rather than guessed numbers.</div>
              </div>
            )}
            {live && (
              <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
                {cards.map((c, i) => {
                  const p = findPlayer(c);
                  const pct = Math.round((c.tdPct || 0) * 100);
                  return (
                    <button key={c.sleeperId || c.name + i} onClick={p ? () => onSelect(p) : undefined}
                      className="w-full text-left px-3 py-2 active:bg-slate-50 dark:active:bg-slate-800/60">
                      {/* row 1: rank · headshot · POS Name · vs OPP */}
                      <div className="flex items-center gap-2">
                        <div className="w-4 text-xs font-extrabold text-slate-400 tabular-nums">{i + 1}</div>
                        {p ? <Avatar p={p} size="sm" /> : <img src={c.headshot} alt="" className="w-9 h-9 rounded-full object-cover object-top bg-white" onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} />}
                        {TEAM_LOGOS[c.team] && <img src={TEAM_LOGOS[c.team]} alt="" className="w-5 h-5 rounded-full bg-white object-contain shrink-0" />}
                        <div className="min-w-0 flex-1">
                          <div className="text-[12px] font-extrabold text-slate-900 dark:text-white truncate">
                            <span className="text-slate-400 font-bold mr-1.5">{c.pos}</span>{c.name}
                            {c.injury && <span className="ml-2 text-[9px] font-extrabold uppercase text-rose-500">{c.injury}</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 dark:text-slate-300 shrink-0">
                          {TEAM_LOGOS[c.opp] && <img src={TEAM_LOGOS[c.opp]} alt="" className="w-4 h-4 rounded-full bg-white object-contain" />}
                          <span>{(c.home ? "vs " : "@ ") + c.opp}</span>
                        </div>
                      </div>
                      {/* row 2: role | opponent vs position | player | TD% */}
                      <div className="mt-1.5 flex items-end gap-1.5">
                        <div className="w-9 text-center shrink-0">
                          <div className="text-[7px] font-semibold text-slate-400 tracking-wider">ROLE</div>
                          <div className="text-xs font-extrabold text-slate-900 dark:text-white">{c.role || c.pos}</div>
                        </div>
                        <div className="w-px h-7 bg-slate-200 dark:bg-slate-700 mx-0.5" />
                        <div className="flex-1 grid grid-cols-4 gap-1.5">
                          {[
                            [c.opp + " TD/G vs " + c.pos, c.oppTdAllowedPg != null ? c.oppTdAllowedPg.toFixed(1) : "—", rankTile(c.oppTdRank), c.oppTdRank ? ordinal(c.oppTdRank) : ""],
                            [c.opp + " YDS/G vs " + c.pos, c.oppYdsAllowedPg != null ? c.oppYdsAllowedPg : "—", rankTile(c.oppYdsRank), c.oppYdsRank ? ordinal(c.oppYdsRank) : ""],
                            ["TD SHARE", c.tdShare != null ? Math.round(c.tdShare * 100) + "%" : "—", valTile(c.tdShare, 0.22, 0.14), c.tdsLastSeason != null ? c.tdsLastSeason + " TD '" + String(board.baseSeason).slice(2) : ""],
                            ["IMP TOTAL", c.implTotal != null ? c.implTotal.toFixed(1) : "—", valTile(c.implTotal, 24, 20), c.spread != null ? (c.spread > 0 ? "+" + c.spread : String(c.spread)) : ""],
                          ].map(([lbl, val, cls, sub]) => (
                            <div key={lbl} className="text-center min-w-0">
                              <div className="text-[7px] font-semibold text-slate-400 tracking-wider truncate">{lbl}</div>
                              <div className={"mt-0.5 rounded-md py-0.5 text-[11px] font-extrabold tabular-nums " + cls}>{val}</div>
                              <div className="text-[8px] font-semibold text-slate-400 tabular-nums h-3">{sub}</div>
                            </div>
                          ))}
                        </div>
                        <div className="w-12 text-right shrink-0 pb-3">
                          <div className="text-[8px] font-semibold text-slate-400 tracking-wider">TD%</div>
                          <div className={"text-lg font-extrabold tabular-nums " + (pct >= 50 ? "text-emerald-500" : pct >= 35 ? "text-amber-500" : "text-slate-500")}>{pct}%</div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
            {/* how it's scored — one summary, not a sentence per player */}
            <div className="mt-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3">
              <div className="text-[10px] font-semibold tracking-widest uppercase text-slate-400 mb-1.5">How the board is scored</div>
              <div className="text-[11px] text-slate-600 dark:text-slate-300 space-y-1 leading-snug">
                <div><b>Opponent vs position</b> — TDs and yards this defense allowed per game to RBs / WRs / TEs last season, ranked 1st (toughest) to 32nd (softest). Green = soft matchup.</div>
                <div><b>TD share</b> — the slice of his team's touchdowns he scored last season. Blends toward this season 12% per week.</div>
                <div><b>Imp total</b> — points Vegas expects his team to score this week (from the spread and over/under). More points, more touchdowns to go around.</div>
                <div><b>TD%</b> — expected touchdowns = (imp total × 0.105) × share × matchup, converted to the chance of at least one. That's the ranking.</div>
                <div className="text-slate-400">Out / IR players and teams that already played this week are excluded. Questionable and doubtful are shown and flagged.</div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
// name normalizer local to the board (falls back gracefully if hrbNrm isn't in scope)
function hrbNrmSafe(s) {
  return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[.'’]/g, "").replace(/\s+(jr|sr|ii|iii|iv|v)$/i, "").trim().toLowerCase();
}

const TABS = [
  { id: "targets", label: "Week", icon: "🎯" }, // label becomes "Week N" from the live scoreboard
  { id: "teams", label: "Teams", icon: "🏈" },
  { id: "players", label: "Players", icon: "👤" },
  { id: "stats", label: "Stats", icon: "📊" },
];

export default function App() {
  const [tab, setTab] = useState("targets"); // land on the Week board
  const [sel, setSel] = useState(null);
  const [players, setPlayers] = useState(null);
  const [teams, setTeams] = useState([]);
  const [stand, setStand] = useState(null); // records + stat ranks from /api/standings
  const [nflWeek, setNflWeek] = useState(null); // current week, for the bottom-nav label
  const [seasonStats, setSeasonStats] = useState(null); // ESPN box-score aggregation (/api/season-stats)

  // Automated records/stats: merge ESPN data into the Airtable teams by abbr.
  // Airtable values still win when present; ESPN fills the blanks (and stx).
  const mergedTeams = useMemo(() => {
    if (!stand || !stand.teams) return teams;
    const find = (abbr) => stand.teams.find((s) => injTeamEq(s.abbr, abbr));
    return teams.map((t) => {
      const s = find(t.abbr || toAbbr(t.name)) || {};
      const bx = seasonStats && seasonStats.teams ? seasonStats.teams[t.abbr || toAbbr(t.name)] : null;
      const stx = {
        // defense splits from box scores (pass/rush yds & TDs allowed, ranked)
        defPassYpg: bx ? bx.defPg.passYds : null, defPassYpgRank: bx ? bx.ranks.defPassYds : null,
        defPassTd: bx ? bx.def.passTd : null, defPassTdRank: bx ? bx.ranks.defPassTd : null,
        defRushYpg: bx ? bx.defPg.rushYds : null, defRushYpgRank: bx ? bx.ranks.defRushYds : null,
        defRushTd: bx ? bx.def.rushTd : null, defRushTdRank: bx ? bx.ranks.defRushTd : null,
        defSeason: seasonStats ? seasonStats.season : null,
        passYpg: s.passYpg, passYpgRank: s.passYpgRank,
        rushYpg: s.rushYpg, rushYpgRank: s.rushYpgRank,
        offTd: s.offTd, offTdRank: s.offTdRank,
        passTd: s.passTd, passTdRank: s.passTdRank,
        rushTd: s.rushTd, rushTdRank: s.rushTdRank,
        sacks: s.sacks, sacksRank: s.sacksRank,
        takeaways: s.takeaways, takeawaysRank: s.takeawaysRank,
        toDiff: s.toDiff, toDiffRank: s.toDiffRank,
        paRank: s.paRank,
      };
      return stand.isCurrent
        ? { ...t, wins: t.wins ?? s.wins, losses: t.losses ?? s.losses, ties: t.ties ?? s.ties, pf: t.pf ?? s.pf, pa: t.pa ?? s.pa, stx }
        : { ...t, winsPrev: t.winsPrev ?? s.wins, lossesPrev: t.lossesPrev ?? s.losses, tiesPrev: t.tiesPrev ?? s.ties, pfPrev: t.pfPrev ?? s.pf, paPrev: t.paPrev ?? s.pa, stx };
    });
  }, [teams, stand, seasonStats]);
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
          const lk = String(p.team).toUpperCase() + "|" + lastNameKey(p.full_name);
          (INJ_BY_LAST[lk] = INJ_BY_LAST[lk] || []).push(p);
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
    fetch("/api/scoreboard").then((r) => r.json()).then((d) => { if (d && d.week) setNflWeek(d.week); }).catch(() => {});
  }, []);
  useEffect(() => {
    // Current season's box scores; until a week is final, show last season's so tiles aren't blank.
    const yr = new Date().getMonth() >= 8 ? new Date().getFullYear() : new Date().getFullYear() - 1;
    fetch(`/api/season-stats?season=${yr}`).then((r) => r.json())
      .then((d) => {
        if (d && d.weeksWithGames > 0) return setSeasonStats(d);
        return fetch(`/api/season-stats?season=${yr - 1}`).then((r) => r.json()).then((d2) => setSeasonStats(d2 && d2.players ? d2 : null));
      }).catch(() => {});
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
        backLabel={tab === "teams" ? (selTeam ? selTeam.name : "Teams") : "Players"}
        mode="full"
        seasonStats={seasonStats}
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
          team={mergedTeams.find((t) => t.id === selTeam.id) || selTeam} teams={mergedTeams} seasonStats={seasonStats}
          players={players}
          onBack={() => setSelTeam(null)}
          onSelectPlayer={setSel}
        />
      )}
      {players && tab === "targets" && <TdBoardTab players={players} teams={mergedTeams} onSelect={setSel} />}
      {players && tab === "players" && <PlayersHub players={players} onSelect={setSel} />}
      {players && tab === "stats" && <StatsTab players={players} onSelect={setSel} />}

      <div className="fixed bottom-0 inset-x-0 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex pb-[env(safe-area-inset-bottom)] z-20">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => { setTab(t.id); setSel(null); setSelTeam(null); }}
            className={"flex-1 py-2.5 text-center " + (tab === t.id ? "text-blue-600" : "text-slate-400")}
          >
            <div className="text-lg leading-none">{t.icon}</div>
            <div className="text-[10px] font-bold mt-1">{t.id === "targets" && nflWeek ? "Week " + nflWeek : t.label}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
