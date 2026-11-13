import { load, save, downloadBackup, backupReminder } from "./db.js";

// 앱에서 편집한 시간표·시험이 있으면 data.js 기본값보다 우선
let D = { ...window.SCHEDULE, ...load("wp.schedule", {}) };
const TODAY = WP.fmt(new Date());
const TYPE = {
  class: ["📚", "수업"], meeting: ["🤝", "회의"], club: ["🎸", "동아리"], work: ["💼", "아르바이트"],
  field: ["🚗", "현장"], appt: ["📍", "약속"], cert: ["📝", "자격증"], etc: ["📌", "기타"], study: ["✏️", "공부"], prep: ["🗂️", "스터디 준비"],
};
const TYPE_NAME = Object.fromEntries(Object.entries(TYPE).map(([k, [, n]]) => [k, n]));
const TYPE_COLOR = { class: "#4f7cff", meeting: "#8b5cf6", club: "#10b981", work: "#f59e0b", field: "#06b6d4", appt: "#ec4899", cert: "#f43f5e", etc: "#94a3b8", study: "#f5b301", prep: "#14b8a6" };
const DOW = ["일", "월", "화", "수", "목", "금", "토"];
const H0 = 8, H1 = 23; // 화면에 그리는 시간 범위

let myEvents = load("wp.events", []);
let done = load("wp.weeks", {});  // { 과목: [완료한 주차] }
let prog = load("wp.wprog", {}); // { 과목 또는 "t:항목id": { 주차·단위: 복습 진도% } } — 100%면 done에도 들어간다
let rounds = load("wp.rounds", {}); // { 항목키: { 단위: 회독 수 } }
let notes = load("wp.notes", {});   // { 항목키: { 단위: "어디까지 했는지" } }
let trackers = load("wp.trackers", []);
// 진도 항목: 단원식 { id, name, emoji, unit, count } 또는 칸을 직접 만드는 활동 { id, name, emoji, flex: true, entries: [{ id, title }] }
if (!load("wp.actsSeeded", false)) {
  [["AX 프로젝트·스터디", "🤖"], ["동아리", "🎸"]].forEach(([name, emoji], i) => {
    if (!trackers.some((t) => t.name === name)) trackers.push({ id: String(Date.now() + i), name, emoji, flex: true, entries: [] });
  });
  save("wp.trackers", trackers); save("wp.actsSeeded", true);
}
for (const t of trackers) if (t.flex && t.match === undefined) { t.match = t.name.includes("AX") ? "AX" : t.name.includes("동아리") ? "동아리" : ""; save("wp.trackers", trackers); }
for (const t of trackers.filter((x) => x.weekly)) {
  const k = `t:${t.id}`, P = JSON.parse(localStorage.getItem("wp.wprog") || "{}")[k] || {}, N = JSON.parse(localStorage.getItem("wp.notes") || "{}")[k] || {};
  t.entries = [...new Set([...Object.keys(P), ...Object.keys(N)])].filter((w) => P[w] || N[w]).sort((a, b) => a - b).map((w) => ({ id: w, title: `${w}주차` }));
  t.flex = true; delete t.weekly; delete t.unit; delete t.count;
  save("wp.trackers", trackers);
}
let logs = load("wp.logs", {});   // 예전 자동 배분 기록(지금은 백업·초기화용으로만 보관)
let todos = load("wp.todos", {}); // { 주 월요일: [{ text, done }] }
let tabsCfg = load("wp.tabs", { course: true, custom: [] }); // 과목 진도 표시 여부 + 내가 만든 탭
let tab = load("wp.tab", "week");
const DEFAULT_TODOS = ["동아리 활동 준비", "AX 프로젝트 및 스터디 준비", "교과목 복습"];
let sel = TODAY;
let view = TODAY.slice(0, 7);

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const items = (date) => WP.itemsForDate(D, date, myEvents);
const level = (h) => (h === 0 ? 0 : h <= 3 ? 1 : h <= 5 ? 2 : h <= 7 ? 3 : 4);
const label = (d) => { const x = WP.parse(d); return `${x.getMonth() + 1}/${x.getDate()}(${DOW[x.getDay()]})`; };
const ddayTxt = (n) => (n === 0 ? "D-DAY" : n > 0 ? `D-${n}` : `D+${-n}`);
const isDone = (c, w) => (done[c] || []).includes(w);
const nowMin = () => { const n = new Date(); return n.getHours() * 60 + n.getMinutes(); };
const hours = (date) => WP.busyHours(items(date));

const roundsOf = (k, u) => (rounds[k] || {})[u] || 0;
const occPassed = (u) => { const [, d, h, m] = String(u).split(":"); return d < TODAY || (d === TODAY && WP.toMin(`${h}:${m}`) <= nowMin()); };
const curPct = (k, u) => (prog[k] || {})[u] ?? (String(u).startsWith("a:") && occPassed(u) ? 100 : isDone(k, u) && !roundsOf(k, u) ? 100 : 0); // 이번 회독 진도
// 활동 카드와 연결된 이번 주 고정 일정: 회의·동아리 종류 중 제목에 카드 키워드가 있는 것(예: AX 회의·스터디, 동아리 활동)
const linkedTracker = (w) => ["meeting", "club"].includes(w.type) && trackers.find((t) => t.flex && t.match && w.title.includes(t.match));
function weekOcc(t) {
  const mon = WP.mondayOf(TODAY);
  return Array.from({ length: 7 }, (_, i) => WP.addDays(mon, i)).flatMap((d) => items(d).filter((w) => linkedTracker(w) === t)
    .map((w) => ({ id: `a:${d}:${w.end}`, title: `${label(d)} ${w.title}` })));
}
// 막대·평균용: 한 번이라도 끝냈으면(1회독 이상) 100으로 본다
const pctOf = (k, u) => (roundsOf(k, u) >= 1 ? 100 : curPct(k, u));
// 이번 회독 진도 저장: 100%이거나 1회독 이상이면 완료
function setPct(course, week, v) {
  (prog[course] ||= {})[week] = v;
  save("wp.wprog", prog);
  setWeekDone(course, week, v === 100 || roundsOf(course, week) >= 1);
}

function setWeekDone(course, week, on) {
  const s = new Set(done[course] || []);
  on ? s.add(week) : s.delete(week);
  done[course] = [...s].sort((a, b) => a - b);
  save("wp.weeks", done);
}

/* ---------- 상단 브리핑 ---------- */
function renderBriefing() {
  const t = WP.parse(TODAY);
  $("bDate").innerHTML = `<b>${t.getMonth() + 1}월 ${t.getDate()}일</b><span>${DOW[t.getDay()]}요일</span>`;
  $("semWeek").textContent = `🎓 ${WP.weekOf(D, TODAY)}주차`;
  const list = items(TODAY);
  const nm = nowMin() / 60;
  const pct = (h) => ((h - H0) / (H1 - H0)) * 100;
  $("strip").innerHTML =
    Array.from({ length: H1 - H0 + 1 }, (_, i) => `<span class="tick" style="left:${pct(H0 + i)}%">${H0 + i}</span>`).join("") +
    list.map((i) => `<div class="seg ty-${i.type}" style="left:${pct(WP.toMin(i.start) / 60)}%;width:${pct(WP.toMin(i.end) / 60) - pct(WP.toMin(i.start) / 60)}%" title="${esc(i.title)} ${i.start}–${i.end}"><span>${TYPE[i.type]?.[0] || "📌"} ${esc(i.title)}</span></div>`).join("") +
    (nm >= H0 && nm <= H1 ? `<div class="now" style="left:${pct(nm)}%"></div>` : "");
  const next = list.find((i) => WP.toMin(i.end) / 60 > nm);
  $("bNext").textContent = list.length ? (next ? `⏭️ 다음: ${next.start} ${next.title}` : "✅ 오늘 일정 모두 끝") : "☕ 오늘은 일정이 없어요";

  const ex = D.exams.filter((e) => e.date >= TODAY).sort((a, b) => a.date.localeCompare(b.date));
  $("bCount").innerHTML = ex[0]
    ? `<div class="cd">${ddayTxt(WP.dday(TODAY, ex[0].date))}</div><div>🎯 ${esc(ex[0].course)}<br><span>${esc(ex[0].kind)} ${label(ex[0].date)}</span></div>`
    : `<div class="cd">—</div><div>🎉 남은 시험 없음</div>`;

  const mon0 = WP.mondayOf(TODAY);
  const wkH = Array.from({ length: 7 }, (_, i) => hours(WP.addDays(mon0, i))).reduce((a, b) => a + b, 0);
  const td = todosFor(mon0), tracks = trackList();
  const avg = tracks.length ? Math.round(tracks.reduce((a, x) => a + x.pct, 0) / tracks.length) : 0;
  $("stats").innerHTML = [
    ["📌 오늘 일정", `${list.length}건`, `${WP.busyHours(list)}시간`],
    ["🗓️ 이번 주 일정", `${wkH}시간`, `${label(mon0)}부터`],
    ["✅ 준비할 것", `${td.filter((t) => t.done).length} / ${td.length}`, "이번 주 완료"],
    ["📊 진도", `${avg}%`, `교과·활동 ${tracks.length}개 평균`],
  ].map(([l, v, n]) => `<div class="stat"><span class="l">${l}</span><b>${v}</b><span class="n">${n}</span></div>`).join("");
}

/* ---------- 일간 ---------- */
function renderDay() {
  const list = items(sel);
  const ex = WP.examsOn(D, sel);
  $("dayTitle").textContent = `${label(sel)}${sel === TODAY ? " · 오늘" : ""}`;
  const h = WP.busyHours(list);
  $("dayLoad").textContent = `⏱️ ${h}시간 · 여유 ${Math.max(0, WP.DAY_HOURS - h)}시간`;
  const rows = ex.map((e) => `<li class="exam"><span class="t">🎯 시험</span><div class="body"><b>${esc(e.course)}</b> <span class="badge b-red">${esc(e.kind)}</span></div></li>`);
  for (const it of list) {
    {
      const i = myEvents.indexOf(it);
      rows.push(`<li style="--c:${TYPE_COLOR[it.type] || "#94a3b8"}"><span class="t">${it.start}–${it.end}</span><div class="body">${TYPE[it.type]?.[0] || "📌"} ${esc(it.title)} <span class="muted small">${TYPE_NAME[it.type] || ""}</span></div>${i >= 0 ? `<span class="acts"><button class="x del" data-i="${i}" aria-label="삭제">✕</button></span>` : ""}</li>`);
    }
  }
  $("dayList").innerHTML = rows.join("") || `<li class="empty">🌿 비어 있는 날이에요.</li>`;
}

/* ---------- 주간 ---------- */
function renderWeek() {
  const mon = WP.mondayOf(sel);
  const days = Array.from({ length: 7 }, (_, i) => WP.addDays(mon, i));
  $("weekTitle").textContent = `${WP.weekOf(D, mon)}주차 · ${label(mon)} ~ ${label(days[6])}`;
  const PX = 40;
  let html = `<div></div>` + days.map((d) => {
    const ex = WP.examsOn(D, d);
    return `<button class="hd${d === TODAY ? " today" : ""}${d === sel ? " sel" : ""}" data-d="${d}">${DOW[WP.parse(d).getDay()]} <b>${+d.slice(8)}</b>${ex.map((e) => `<span class="exd" title="${esc(e.course)} ${esc(e.kind)}">🎯 ${esc(e.course)}</span>`).join("")}</button>`;
  }).join("");
  html += `<div class="hours">${Array.from({ length: H1 - H0 }, (_, i) => `<span style="top:${i * PX}px">${H0 + i}</span>`).join("")}</div>`;
  for (const d of days) {
    html += `<div class="col${d === TODAY ? " today" : ""}">` + items(d).map((w) => {
      const top = (WP.toMin(w.start) / 60 - H0) * PX, h = ((WP.toMin(w.end) - WP.toMin(w.start)) / 60) * PX;
      const t = linkedTracker(w), p = t && curPct(`t:${t.id}`, `a:${d}:${w.end}`);
      const badge = t && d >= WP.mondayOf(TODAY) && d <= WP.addDays(WP.mondayOf(TODAY), 6) ? `<span class="pbadge">${p === 100 ? "✅ 준비 끝" : `준비 ${p}%`}</span>` : "";
      return `<div class="blk ty-${w.type}" style="top:${top}px;height:${h - 2}px" title="${esc(w.title)} ${w.start}–${w.end}">${TYPE[w.type]?.[0] || ""} <b>${esc(w.title)}</b><br>${w.start}–${w.end}${badge}</div>`;
    }).join("") + `</div>`;
  }
  $("tt").innerHTML = html;

}

/* ---------- 월간 ---------- */
function renderCal() {
  const [y, m] = view.split("-").map(Number);
  $("month").textContent = `${y}년 ${m}월`;
  const first = `${view}-01`;
  const start0 = WP.addDays(first, -WP.parse(first).getDay());
  let html = DOW.map((d) => `<div class="dow">${d}</div>`).join("");
  for (let i = 0; i < 42; i++) {
    const d = WP.addDays(start0, i);
    const h = WP.busyHours(items(d));
    const cls = ["day", `l${level(h)}`, d.slice(0, 7) !== view && "out", d === TODAY && "today", d === sel && "sel"].filter(Boolean).join(" ");
    const ex = WP.examsOn(D, d).map((e) => `<span class="ex" title="${esc(e.course)} ${esc(e.kind)}">🎯 ${esc(e.course)}</span>`).join("");
    const alt = D.exams.filter((e) => e.alt === d).map((e) => `<span class="ex alt" title="후보일">${esc(e.course)}?</span>`).join("");
    html += `<button class="${cls}" data-d="${d}" aria-label="${label(d)} ${h}시간"><span class="n">${+d.slice(8)}</span>${h ? `<span class="h">${h}h</span>` : ""}${ex}${alt}</button>`;
  }
  $("cal").innerHTML = html;
}

/* ---------- 📊 진도·복습: 과목(주차) + 자격증·책 등(단원) ---------- */
const PCTS = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
function trackList() {
  const cs = WP.courses(D, TODAY).map((c) => ({ key: c.course, name: c.course, emoji: "📘", unit: "주", units: WP.weekRange(c), course: c }));
  const ts = trackers.map((t) => ({ key: `t:${t.id}`, name: t.name, emoji: t.emoji, id: t.id, flex: !!t.flex, unit: t.flex ? "칸" : t.unit,
    ...(t.flex
      ? (() => { const all = [...weekOcc(t), ...t.entries]; return { units: all.map((e) => e.id), labels: Object.fromEntries(all.map((e) => [e.id, e.title])) }; })()
      : { units: Array.from({ length: t.count }, (_, i) => i + 1), labels: null }) }));
  return [...cs, ...ts].map((x) => ({ ...x, pct: x.units.length ? Math.round(x.units.reduce((a, u) => a + pctOf(x.key, u), 0) / x.units.length) : 0 }));
}
// list: 그릴 항목들, el: 넣을 곳
function renderTracks(list, el, empty) {
  const cw = WP.weekOf(D, TODAY);
  el.innerHTML = list.map((x) => {
    const c = x.course;
    const fin = x.units.filter((u) => pctOf(x.key, u) === 100).length;
    const exams = c ? D.exams.filter((e) => e.course === x.name).sort((a, b) => a.date.localeCompare(b.date)) : [];
    const head = c
      ? `<span class="badge ${c.noMidterm ? "b-red" : "b-blue"}">${c.noMidterm ? "중간고사 없음 · 1주차부터" : "중간고사 봄 · 9주차부터"}</span>`
      : `<button class="x tdel" data-id="${x.id}" aria-label="${esc(x.name)} 항목 삭제" title="항목 삭제">✕</button>`;
    const cells = x.units.map((u) => {
      const p = curPct(x.key, u), r = roundsOf(x.key, u), n = (notes[x.key] || {})[u] || "";
      const lab = x.flex ? x.labels[u] : `${u}${x.unit}`;
      return `<button class="wk${r || (x.flex && p === 100) ? " on" : ""}${c && u > cw ? " future" : ""}${x.flex ? " flex" : ""}${String(u).startsWith("a:") ? " auto" : ""}" style="--p:${p}%" data-k="${esc(x.key)}" data-u="${esc(u)}" data-name="${esc(x.name)}" data-label="${esc(lab)}"${x.flex ? ` data-flex="${esc(x.id)}"` : ""}
        title="${n ? esc(n) : String(u).startsWith("a:") ? "주간 계획의 일정이에요. 일정이 끝나면 자동으로 준비 끝(100%)이 돼요" : x.flex ? "눌러서 준비 % · 어디까지 했는지 기록" : "눌러서 진도·회독·메모 기록"}"><span>${x.flex && p === 100 ? "✅ " : ""}${esc(lab)}</span>${r ? `<b class="rd">${r}회독</b>` : ""}<small>${p}%</small>${n ? '<i class="nt">📝</i>' : ""}</button>`;
    }).join("");
    const rs = x.units.map((u) => roundsOf(x.key, u)), avgR = rs.length ? (rs.reduce((a, b) => a + b, 0) / rs.length).toFixed(1) : 0;
    return `<article class="card course">
      <header><h3>${x.emoji} ${esc(x.name)}</h3>${head}</header>
      ${exams.length ? `<div class="exl">${exams.map((e) => `<span class="${e.date < TODAY ? "past" : ""}">🎯 ${esc(e.kind)} ${label(e.date)}${e.alt ? ` 또는 ${label(e.alt)}` : ""} <b>${e.date < TODAY ? "종료" : ddayTxt(WP.dday(TODAY, e.date))}</b></span>`).join("")}</div>` : ""}
      <div class="pbar"><i style="width:${x.pct}%"></i></div>
      ${x.flex
        ? `<p class="small muted">준비 끝낸 칸 <b>${fin} / ${x.units.length}</b> · 평균 <b>${x.pct}%</b></p>`
        : `<p class="small muted">진도 <b>${x.pct}%</b> · ${fin} / ${x.units.length}${esc(x.unit)} 끝냄 · 평균 <b>${avgR}회독</b></p>`}
      <div class="weeks">${cells || (x.flex ? '<span class="muted small">아직 칸이 없어요. 아래에서 이번 활동 준비 칸을 만들어 보세요.</span>' : "")}</div>
      ${x.flex ? `<form class="addcell" data-id="${esc(x.id)}"><input name="t" required maxlength="30" placeholder="예: 11/20 발표 준비, 2차 미팅 자료" aria-label="${esc(x.name)} 새 칸 이름"><button class="primary">＋ 칸 추가</button></form>` : ""}
    </article>`;
  }).join("") || `<p class="muted">${empty}</p>`;
}
const renderCourses = () => renderTracks(trackList().filter((x) => x.course), $("courses"), "시험이 등록된 과목이 없어요. ⚙️ 시간표·시험 편집에서 추가해 주세요.");
const renderActs = () => renderTracks(trackList().filter((x) => !x.course), $("acts"), "아직 활동 항목이 없어요. 위에서 자격증·동아리 등을 추가해 보세요.");
// 칸을 누르면 편집 창: 이번 회독 진도 %, 회독 수, 어디까지 했는지
let unitSel = null, roundTmp = 0;
const showRound = () => ($("roundV").textContent = roundTmp);
const onCell = (e) => {
  const b = e.target.closest(".wk"); if (!b) return;
  unitSel = { k: b.dataset.k, u: b.dataset.flex ? b.dataset.u : +b.dataset.u, flex: b.dataset.flex };
  roundTmp = roundsOf(unitSel.k, unitSel.u);
  const flex = !!b.dataset.flex;
  $("unitForm").classList.toggle("flex", flex);
  $("pctLabel").textContent = flex ? "준비 진도" : "이번 회독 진도";
  $("unitTitle").textContent = `${b.dataset.name} · ${b.dataset.label}`;
  $("unitForm").pct.innerHTML = PCTS.map((v) => `<option value="${v}">${v}%</option>`).join("");
  $("unitForm").pct.value = curPct(unitSel.k, unitSel.u);
  $("unitForm").note.value = (notes[unitSel.k] || {})[unitSel.u] || "";
  showRound();
  $("unitDlg").showModal();
};
$("courses").addEventListener("click", onCell);
$("acts").addEventListener("click", onCell);
$("unitForm").addEventListener("click", (e) => {
  const r = e.target.closest("[data-r]"); if (r) { roundTmp = Math.max(0, roundTmp + +r.dataset.r); showRound(); }
});
function saveUnit(pct) {
  const { k, u } = unitSel;
  (rounds[k] ||= {})[u] = roundTmp; save("wp.rounds", rounds);
  (notes[k] ||= {})[u] = $("unitForm").note.value.trim(); save("wp.notes", notes);
  setPct(k, u, pct);
  $("unitDlg").close(); render();
}
$("unitForm").onsubmit = (e) => { e.preventDefault(); saveUnit(+e.target.pct.value); };
// 한 바퀴 끝: 회독 +1, 진도는 0%로 돌려 다음 회독 시작
$("roundDone").onclick = () => { roundTmp += 1; saveUnit(0); };
$("unitCancel").onclick = () => $("unitDlg").close();
// 활동 칸 삭제
$("cellDel").onclick = () => {
  const { k, u, flex } = unitSel, t = trackers.find((x) => x.id === flex);
  if (String(u).startsWith("a:")) return alert("주간 계획의 고정 일정으로 자동으로 생긴 칸이라 지울 수 없어요.");
  if (!t || !confirm("이 칸을 삭제할까요? 적어 둔 준비 %와 메모도 함께 지워져요.")) return;
  t.entries = t.entries.filter((e) => e.id !== u);
  for (const m of [prog, rounds, notes]) if (m[k]) delete m[k][u];
  if (done[k]) done[k] = done[k].filter((x) => x !== u);
  save("wp.trackers", trackers); save("wp.wprog", prog); save("wp.rounds", rounds); save("wp.notes", notes); save("wp.weeks", done);
  $("unitDlg").close(); render();
};
// 활동 카드 안에서 칸 만들기
$("acts").addEventListener("submit", (e) => {
  const f = e.target.closest(".addcell"); if (!f) return;
  e.preventDefault();
  const t = trackers.find((x) => x.id === f.dataset.id), title = f.t.value.trim(); if (!t || !title) return;
  t.entries.push({ id: `e${Date.now()}`, title });
  save("wp.trackers", trackers); render();
});
$("acts").addEventListener("click", (e) => {
  const b = e.target.closest(".tdel"); if (!b) return;
  const t = trackers.find((x) => x.id === b.dataset.id);
  if (!confirm(`"${t.name}" 진도 항목을 삭제할까요? 기록한 %도 함께 지워져요.`)) return;
  trackers = trackers.filter((x) => x.id !== t.id);
  for (const m of [prog, done, rounds, notes]) delete m[`t:${t.id}`];
  save("wp.trackers", trackers); save("wp.wprog", prog); save("wp.weeks", done); save("wp.rounds", rounds); save("wp.notes", notes);
  render();
});
$("trackForm").onsubmit = (e) => {
  e.preventDefault();
  const f = e.target.elements, flex = f.flex.checked, count = Math.round(+f.count.value);
  if (!flex && !(count >= 1 && count <= 60)) return alert("개수는 1~60 사이로 적어 주세요.");
  const id = String(Date.now()), name = f.name.value.trim(), emoji = f.emoji.value;
  trackers.push(flex ? { id, name, emoji, flex: true, entries: [] } : { id, name, emoji, unit: f.unit.value.trim() || "단원", count });
  save("wp.trackers", trackers);
  e.target.reset();
  render();
};

/* ---------- 이번 주 준비할 것 ---------- */
// 이번 주 할 일 자동 항목: 2주 안의 시험, 이번 주에 직접 넣은 일정(공부·준비·약속 등)
function autoTodos(mon) {
  const end = WP.addDays(mon, 6);
  const exams = D.exams.filter((e) => e.date >= mon && e.date <= WP.addDays(mon, 13)).sort((a, b) => a.date.localeCompare(b.date))
    .map((e) => `🎯 ${e.course} ${e.kind} ${label(e.date)} 대비`);
  const events = myEvents.filter((e) => e.date >= mon && e.date <= end).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start))
    .map((e) => `${TYPE[e.type]?.[0] || "📌"} ${label(e.date)} ${e.start} ${e.title}`);
  return [...exams, ...events].map((text) => ({ text, done: false, auto: true }));
}

// 저장된 목록이 없는 주: 시험·일정에서 자동으로 뽑은 할 일 + 지난주에 직접 적은 항목(못 한 것은 ⏩ 이월)
// 이번 주(오늘이 속한 주) 목록은 처음 만들 때 저장해서 고정한다. 필요 없는 건 지우면 된다.
function todosFor(mon) {
  if (todos[mon]) return todos[mon].map((t) => ({ ...t }));
  const prev = Object.keys(todos).filter((k) => k < mon).sort().pop();
  const mine = prev ? todos[prev].filter((t) => !t.auto).map((t) => ({ text: t.text, done: false, carry: !t.done })) : DEFAULT_TODOS.map((text) => ({ text, done: false }));
  const list = [...autoTodos(mon), ...mine];
  if (mon === WP.mondayOf(TODAY)) { todos[mon] = list; save("wp.todos", todos); }
  return list.map((t) => ({ ...t }));
}
function renderTodos() {
  const mon = WP.mondayOf(sel), list = todosFor(mon);
  $("todoTitle").textContent = `✅ ${WP.weekOf(D, mon)}주차 준비할 것 (${label(mon)} ~ ${label(WP.addDays(mon, 6))})`;
  const n = list.filter((t) => t.done).length;
  $("todoCount").textContent = list.length ? `${n} / ${list.length} 완료${n === list.length ? " 🎉" : ""}` : "";
  $("todos").innerHTML = checkItems(list, "이번 주 준비할 것이 없어요.");
}
const saveTodos = (list) => { todos[WP.mondayOf(sel)] = list; save("wp.todos", todos); renderTodos(); };
$("todos").onchange = (e) => {
  const i = +e.target.dataset.i, list = todosFor(WP.mondayOf(sel));
  if (e.target.type === "checkbox") list[i].done = e.target.checked;
  else { const v = e.target.value.trim(); v ? (list[i].text = v) : list.splice(i, 1); }
  saveTodos(list);
};
$("todos").onclick = (e) => {
  const b = e.target.closest(".x"); if (!b) return;
  const list = todosFor(WP.mondayOf(sel)); list.splice(+b.dataset.i, 1); saveTodos(list);
};
$("todoForm").onsubmit = (e) => {
  e.preventDefault();
  const v = e.target.t.value.trim(); if (!v) return;
  const list = todosFor(WP.mondayOf(sel)); list.push({ text: v, done: false }); saveTodos(list);
  e.target.reset();
};

/* ---------- 탭: 일간·주간·월간은 고정, 과목 진도와 내가 만든 탭은 추가·삭제 ---------- */
const customTab = (id) => tabsCfg.custom.find((c) => c.id === id);
const validTab = (t) => ["day", "week", "month"].includes(t) || (t === "course" && tabsCfg.course) || !!customTab(t);
const saveTabs = () => save("wp.tabs", tabsCfg);
function renderTabs() {
  const btn = (k, n, rm) => `<span class="tabw"><button role="tab" data-tab="${k}" aria-selected="${tab === k}">${esc(n)}</button>${rm ? `<button class="tabx" data-rm="${k}" aria-label="${esc(n)} 탭 삭제" title="탭 삭제">✕</button>` : ""}</span>`;
  $("tabs").innerHTML = btn("week", "🗓️ 주간 계획") + btn("month", "📆 월간") +
    (tabsCfg.course ? btn("course", "📚 교과", true) : "") + btn("day", "🎯 활동") +
    tabsCfg.custom.map((c) => btn(c.id, `${c.emoji} ${c.name}`, true)).join("") +
    `<button class="addtab" id="addTab">＋ 탭 추가</button>`;
}
function setTab(t) {
  tab = validTab(t) ? t : "week"; save("wp.tab", tab);
  renderTabs();
  ["day", "week", "month", "course"].forEach((k) => ($(`p-${k}`).hidden = k !== tab));
  $("p-custom").hidden = !customTab(tab);
  renderPanel();
}
function renderPanel() {
  renderTodos();
  if (tab === "day") { renderDay(); renderActs(); }
  else if (tab === "week") renderWeek();
  else if (tab === "month") renderCal();
  else if (tab === "course") renderCourses();
  else renderCustom(customTab(tab));
}

// 체크리스트 한 줄(준비할 것·내가 만든 탭 공용)
const checkItems = (list, empty) => list.map((t, i) => `<li class="${t.done ? "fin" : ""}">
    <input type="checkbox" data-i="${i}"${t.done ? " checked" : ""} aria-label="${esc(t.text)} 완료">
    <input class="tx" data-i="${i}" value="${esc(t.text)}" aria-label="항목 내용">
    ${t.carry ? '<span class="badge b-amber" title="지난주에 못 해서 넘어온 항목">⏩ 이월</span>' : ""}${t.auto ? '<span class="badge b-blue" title="시험·일정에서 자동으로 뽑은 항목">🗓️ 자동</span>' : ""}
    <button class="x" data-i="${i}" aria-label="${esc(t.text)} 삭제">✕</button></li>`).join("") || `<li class="muted">${empty}</li>`;

function renderCustom(c) {
  const n = c.items.filter((t) => t.done).length;
  $("p-custom").innerHTML = `<section class="card custom">
    <h2>${esc(c.emoji)} ${esc(c.name)} <span class="right muted small">${c.items.length ? `${n} / ${c.items.length} 완료${n === c.items.length ? " 🎉" : ""}` : ""}</span></h2>
    <ul class="todos">${checkItems(c.items, "아직 항목이 없어요. 아래에서 추가해 보세요.")}</ul>
    <form class="todo-add cform"><input name="t" placeholder="할 일 추가" required maxlength="60" aria-label="할 일 추가"><button class="primary">추가</button></form>
    <h2 class="mt">📝 메모</h2>
    <textarea class="cmemo" rows="6" placeholder="자유롭게 적어요." aria-label="${esc(c.name)} 메모">${esc(c.memo)}</textarea>
  </section>`;
}
$("p-custom").addEventListener("change", (e) => {
  const c = customTab(tab); if (!c) return;
  if (e.target.classList.contains("cmemo")) { c.memo = e.target.value; return saveTabs(); }
  const i = +e.target.dataset.i;
  if (e.target.type === "checkbox") c.items[i].done = e.target.checked;
  else if (e.target.classList.contains("tx")) { const v = e.target.value.trim(); v ? (c.items[i].text = v) : c.items.splice(i, 1); }
  else return;
  saveTabs(); renderCustom(c);
});
$("p-custom").addEventListener("click", (e) => {
  const b = e.target.closest(".x"); const c = customTab(tab); if (!b || !c) return;
  c.items.splice(+b.dataset.i, 1); saveTabs(); renderCustom(c);
});
$("p-custom").addEventListener("submit", (e) => {
  e.preventDefault();
  const c = customTab(tab), v = e.target.t.value.trim(); if (!c || !v) return;
  c.items.push({ text: v, done: false }); saveTabs(); renderCustom(c);
});

$("tabs").onclick = (e) => {
  const rm = e.target.closest("[data-rm]");
  if (rm) {
    const k = rm.dataset.rm;
    if (k === "course") {
      if (!confirm("📚 교과 탭을 숨길까요? 기록은 그대로 남고, ＋ 탭 추가에서 다시 켤 수 있어요.")) return;
      tabsCfg.course = false;
    } else {
      const c = customTab(k);
      if (!confirm(`"${c.name}" 탭을 삭제할까요? 안에 있는 항목 ${c.items.length}개와 메모도 함께 지워져요.`)) return;
      tabsCfg.custom = tabsCfg.custom.filter((x) => x.id !== k);
    }
    saveTabs(); return setTab(tab === k ? "week" : tab);
  }
  if (e.target.closest("#addTab")) {
    $("tabForm").reset();
    $("restoreRow").hidden = tabsCfg.course;
    return $("tabDlg").showModal();
  }
  const b = e.target.closest("[data-tab]"); if (b) setTab(b.dataset.tab);
};
$("tabCancel").onclick = () => $("tabDlg").close();
$("tabForm").onsubmit = (e) => {
  e.preventDefault();
  const f = e.target, name = f.elements.name.value.trim(), restore = !tabsCfg.course && f.elements.course.checked;
  if (!name && !restore) return alert("탭 이름을 적어 주세요.");
  let go = tab;
  if (restore) { tabsCfg.course = true; go = "course"; }
  if (name) { const id = `c${Date.now()}`; tabsCfg.custom.push({ id, name, emoji: f.elements.emoji.value, items: [], memo: "" }); go = id; }
  saveTabs(); $("tabDlg").close(); setTab(go);
};
function render() { renderBriefing(); renderPanel(); }
const refresh = render;

/* ---------- 이벤트 ---------- */
const goDay = (d) => { sel = d; view = d.slice(0, 7); setTab("day"); };
$("cal").onclick = (e) => { const c = e.target.closest(".day"); if (c) goDay(c.dataset.d); };
$("tt").onclick = (e) => { const c = e.target.closest(".hd"); if (c) goDay(c.dataset.d); };
$("prev").onclick = () => { view = WP.addDays(`${view}-01`, -1).slice(0, 7); renderCal(); };
$("next").onclick = () => { view = WP.addDays(`${view}-28`, 7).slice(0, 7); renderCal(); };
document.querySelectorAll("[data-day]").forEach((b) => (b.onclick = () => { sel = +b.dataset.day ? WP.addDays(sel, +b.dataset.day) : TODAY; renderDay(); renderTodos(); }));
document.querySelectorAll("[data-week]").forEach((b) => (b.onclick = () => { sel = WP.addDays(sel, +b.dataset.week); renderWeek(); renderTodos(); }));

// 넣어 둔 일정 지우기
$("dayList").addEventListener("click", (e) => {
  const b = e.target.closest(".x"); if (!b) return;
  if (!confirm("이 일정을 삭제할까요?")) return;
  myEvents.splice(+b.dataset.i, 1); save("wp.events", myEvents);
  refresh();
});

/* ---------- 시간표·시험·학기 편집 창 ---------- */
const opts = (pairs, v) => pairs.map(([k, n]) => `<option value="${k}"${String(k) === String(v) ? " selected" : ""}>${n}</option>`).join("");
const weeklyRow = (w = { day: 1, start: "09:00", end: "10:00", title: "", type: "class" }) => `<tr>
  <td><select name="day" aria-label="요일">${opts([1, 2, 3, 4, 5, 6, 0].map((d) => [d, DOW[d]]), w.day)}</select></td>
  <td><input type="time" name="start" value="${w.start}" required aria-label="시작"></td>
  <td><input type="time" name="end" value="${w.end}" required aria-label="종료"></td>
  <td><input name="title" value="${esc(w.title)}" required aria-label="이름"></td>
  <td><select name="type" aria-label="종류">${opts(Object.entries(TYPE_NAME), w.type)}</select></td>
  <td><button type="button" class="x rm" aria-label="이 줄 삭제">✕</button></td></tr>`;
const examRow = (e = { course: "", kind: "기말고사", date: "" }) => `<tr>
  <td><input name="course" value="${esc(e.course)}" required aria-label="과목"></td>
  <td><input name="kind" value="${esc(e.kind)}" list="kinds" required aria-label="구분"></td>
  <td><input type="date" name="date" value="${e.date}" required aria-label="날짜"></td>
  <td><input type="date" name="alt" value="${e.alt || ""}" aria-label="후보 날짜"></td>
  <td class="c"><input type="checkbox" name="noMidterm"${e.noMidterm ? " checked" : ""} aria-label="중간고사 없음"></td>
  <td><button type="button" class="x rm" aria-label="이 줄 삭제">✕</button></td></tr>`;

function openSetup() {
  $("semStart").value = D.semester.start;
  $("semEnd").value = D.semester.end;
  $("skip").value = D.skip.join(", ");
  $("wRows").innerHTML = [...D.weekly].sort((a, b) => ((a.day + 6) % 7) - ((b.day + 6) % 7) || a.start.localeCompare(b.start)).map((w) => weeklyRow(w)).join("");
  $("eRows").innerHTML = [...D.exams].sort((a, b) => a.date.localeCompare(b.date)).map((e) => examRow(e)).join("");
  $("setup").showModal();
}
document.querySelectorAll(".openSetup").forEach((b) => (b.onclick = openSetup));
$("setup").addEventListener("click", (e) => { if (e.target.classList.contains("rm")) e.target.closest("tr").remove(); });
$("addW").onclick = () => $("wRows").insertAdjacentHTML("beforeend", weeklyRow());
$("addE").onclick = () => $("eRows").insertAdjacentHTML("beforeend", examRow());
$("closeSetup").onclick = () => $("setup").close();
$("setupForm").onsubmit = (e) => {
  e.preventDefault();
  const rows = (id) => [...$(id).querySelectorAll("tr")];
  const v = (tr, n) => tr.querySelector(`[name=${n}]`);
  const weekly = rows("wRows").map((tr) => ({ day: +v(tr, "day").value, start: v(tr, "start").value, end: v(tr, "end").value, title: v(tr, "title").value.trim(), type: v(tr, "type").value }));
  const bad = weekly.find((w) => w.end <= w.start);
  if (bad) return alert(`"${bad.title}"의 종료 시간이 시작 시간보다 늦어야 해요.`);
  const exams = rows("eRows").map((tr) => {
    const x = { course: v(tr, "course").value.trim(), kind: v(tr, "kind").value.trim(), date: v(tr, "date").value };
    if (v(tr, "alt").value) x.alt = v(tr, "alt").value;
    if (v(tr, "noMidterm").checked) x.noMidterm = true;
    return x;
  });
  const skip = $("skip").value.split(/[,\s]+/).filter(Boolean);
  if (skip.some((s) => !/^\d{4}-\d{2}-\d{2}$/.test(s))) return alert("휴강일은 2026-11-20 형식으로, 쉼표로 구분해 주세요.");
  const semester = { start: $("semStart").value, end: $("semEnd").value };
  if (semester.end < semester.start) return alert("종강일이 개강일보다 늦어야 해요.");
  const schedule = { semester, skip, weekly, exams };
  D = { ...D, ...schedule };
  save("wp.schedule", schedule);
  $("setup").close(); refresh();
};
$("resetSetup").onclick = () => {
  if (!confirm("편집한 시간표·시험을 지우고 처음(data.js) 상태로 되돌릴까요?")) return;
  save("wp.schedule", {});
  D = { ...window.SCHEDULE };
  $("setup").close(); refresh();
};

/* ---------- 백업 ---------- */
const exportAll = () => downloadBackup("work-plan", { events: myEvents, weeks: done, wprog: prog, rounds, notes, trackers, logs, todos, tabs: tabsCfg, schedule: load("wp.schedule", {}) });
$("export").onclick = exportAll;
$("import").onchange = async (e) => {
  const file = e.target.files[0]; e.target.value = "";
  if (!file) return;
  try {
    const d = JSON.parse(await file.text());
    if (!Array.isArray(d.events) || !d.events.every((x) => x.date && x.start && x.end && x.title)) throw new Error("형식이 맞지 않아요");
    if (!confirm(`백업으로 지금 기록을 바꿀까요? (일정 ${d.events.length}건) 현재 기록은 사라져요.`)) return;
    myEvents = d.events; done = d.weeks || {}; prog = d.wprog || {}; save("wp.wprog", prog); trackers = d.trackers || []; save("wp.trackers", trackers); rounds = d.rounds || {}; save("wp.rounds", rounds); notes = d.notes || {}; save("wp.notes", notes); logs = d.logs || {}; todos = d.todos || {}; if (d.tabs) { tabsCfg = d.tabs; saveTabs(); }
    save("wp.events", myEvents); save("wp.weeks", done); save("wp.logs", logs); save("wp.todos", todos);
    if (d.schedule) { save("wp.schedule", d.schedule); D = { ...window.SCHEDULE, ...d.schedule }; }
    refresh();
  } catch (err) { alert("백업 파일을 읽지 못했어요: " + err.message); }
};

// 2027년 첫 실행 때 한 번만: 2026년 연습 기록(일정·공부 기록·준비할 것·주차 체크·편집한 시간표)을 정리한다.
// 지우기 전에 사본(wp.practice)을 보관해 파일로 받을 수 있게 한다. 내가 만든 탭은 날짜와 무관한 메모장이라 남긴다.
const START = "2027-01-01";
const before = (obj) => Object.fromEntries(Object.entries(obj).filter(([d]) => d < START));
const after = (obj) => Object.fromEntries(Object.entries(obj).filter(([d]) => d >= START));
if (TODAY >= START) {
  if (!load("wp.practiceDone", false)) {
    const sched = load("wp.schedule", {});
    save("wp.practice", { events: myEvents.filter((e) => e.date < START), weeks: done, wprog: prog, logs: before(logs), todos: before(todos), schedule: sched });
    myEvents = myEvents.filter((e) => e.date >= START); const flexKeys = trackers.filter((t) => t.flex).map((t) => `t:${t.id}`); trackers.forEach((t) => { if (t.flex) t.entries = []; }); save("wp.trackers", trackers); const keepT = (o) => Object.fromEntries(Object.entries(o).filter(([k]) => k.startsWith("t:") && !flexKeys.includes(k)));
    done = keepT(done); prog = keepT(prog); rounds = keepT(rounds); notes = keepT(notes); save("wp.wprog", prog); save("wp.rounds", rounds); save("wp.notes", notes); logs = after(logs); todos = after(todos);
    save("wp.events", myEvents); save("wp.weeks", done); save("wp.logs", logs); save("wp.todos", todos); save("wp.schedule", {});
    D = { ...window.SCHEDULE };
    save("wp.practiceDone", true); save("wp.practiceNotice", true);
  }
  if (load("wp.practiceNotice", false)) {
    $("newYear").hidden = false;
    $("practiceDl").onclick = () => downloadBackup("work-plan-2026-연습기록", load("wp.practice", {}));
    $("newYearClose").onclick = () => { $("newYear").hidden = true; save("wp.practiceNotice", false); };
  }
} else {
  $("trial").hidden = false;
}

const hasData = myEvents.length > 0 || Object.keys(logs).length > 0 || Object.keys(done).length > 0 || Object.keys(todos).length > 0 || tabsCfg.custom.length > 0 || trackers.length > 0 || Object.keys(load("wp.schedule", {})).length > 0;

setTab(tab);
renderBriefing();
backupReminder("work-plan", hasData, exportAll);
