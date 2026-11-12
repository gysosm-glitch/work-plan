import { load, save, downloadBackup, backupReminder } from "./db.js";

// 앱에서 편집한 시간표·시험이 있으면 data.js 기본값보다 우선
let D = { ...window.SCHEDULE, ...load("wp.schedule", {}) };
const TODAY = WP.fmt(new Date());
const TYPE = {
  class: ["📚", "수업"], meeting: ["🤝", "회의"], club: ["🎸", "동아리"], work: ["💼", "아르바이트"],
  field: ["🚗", "현장"], appt: ["📍", "약속"], cert: ["📝", "자격증"], etc: ["📌", "기타"], study: ["✏️", "공부"],
};
const TYPE_NAME = Object.fromEntries(Object.entries(TYPE).filter(([k]) => k !== "study").map(([k, [, n]]) => [k, n]));
const TYPE_COLOR = { class: "#4f7cff", meeting: "#8b5cf6", club: "#10b981", work: "#f59e0b", field: "#06b6d4", appt: "#ec4899", cert: "#f43f5e", etc: "#94a3b8" };
const DOW = ["일", "월", "화", "수", "목", "금", "토"];
const H0 = 8, H1 = 23; // 화면에 그리는 시간 범위

let myEvents = load("wp.events", []);
let done = load("wp.weeks", {});  // { 과목: [완료한 주차] }
let prog = load("wp.wprog", {}); // { 과목: { 주차: 진행률% } } — 100%면 done에도 들어간다
let logs = load("wp.logs", {});   // { 날짜: { snap, blocks: { "과목|주차": 블록 + done + note }, extra: [더 한 것] } }
let todos = load("wp.todos", {}); // { 주 월요일: [{ text, done }] }
let tabsCfg = load("wp.tabs", { course: true, custom: [] }); // 과목 진도 표시 여부 + 내가 만든 탭
let tab = load("wp.tab", "day");
const DEFAULT_TODOS = ["동아리 활동 준비", "AX 프로젝트 및 스터디 준비", "교과목 복습"];
let editing = null;               // 수정 중인 내 일정의 myEvents 인덱스
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
const byStart = (a, b) => WP.toMin(a.start) - WP.toMin(b.start);
const blockMin = (b) => WP.toMin(b.end) - WP.toMin(b.start);
const LV_CLS = { 1: "b-green", 2: "b-amber", 3: "b-red" };
const lvBadge = (course) => { const c = WP.courses(D, TODAY).find((x) => x.course === course); return c ? `<span class="badge ${LV_CLS[c.level]}">난이도 ${WP.LEVEL_NAME[c.level]}</span>` : ""; };

// 주간 자동 배분은 렌더마다 다시 계산하지 않도록 주 단위로 캐시
const planCache = {};
const plan = (weekStart) => (planCache[weekStart] ??= WP.planWeek(D, myEvents, done, logs, weekStart, TODAY, nowMin(), prog));
const invalidate = () => Object.keys(planCache).forEach((k) => delete planCache[k]);

// 그날의 공부 블록 = 기록된 블록 + (오늘 이후라면) 자동 배분된 블록
function studyFor(date) {
  const logged = Object.values(logs[date]?.blocks || {});
  if (date < TODAY) return logged;
  const keys = new Set(logged.map((b) => b.key));
  return [...logged, ...plan(WP.mondayOf(date)).blocks.filter((b) => b.date === date && !keys.has(b.key))].sort(byStart);
}
const dayAll = (date) => [...items(date), ...studyFor(date)].sort(byStart);
const hours = (date) => WP.busyHours(dayAll(date));

function logBlock(date, b, patch) {
  const day = (logs[date] ||= { blocks: {} });
  day.blocks ||= {};
  const cur = day.blocks[b.key] || { key: b.key, course: b.course, week: b.week, start: b.start, end: b.end, type: "study", date };
  day.blocks[b.key] = { ...cur, ...patch };
  save("wp.logs", logs);
}

const pctOf = (c, w) => (isDone(c, w) ? 100 : (prog[c] || {})[w] || 0);
// 주차 진행률 저장: 100%면 완료, 아니면 완료 해제
function setPct(course, week, v) {
  (prog[course] ||= {})[week] = v;
  save("wp.wprog", prog);
  setWeekDone(course, week, v === 100);
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
  const list = dayAll(TODAY);
  const nm = nowMin() / 60;
  const pct = (h) => ((h - H0) / (H1 - H0)) * 100;
  $("strip").innerHTML =
    Array.from({ length: H1 - H0 + 1 }, (_, i) => `<span class="tick" style="left:${pct(H0 + i)}%">${H0 + i}</span>`).join("") +
    list.map((i) => `<div class="seg ty-${i.type}${i.done ? " fin" : ""}" style="left:${pct(WP.toMin(i.start) / 60)}%;width:${pct(WP.toMin(i.end) / 60) - pct(WP.toMin(i.start) / 60)}%" title="${esc(i.title || i.course)} ${i.start}–${i.end}"><span>${TYPE[i.type][0]} ${esc(i.title || i.course)}</span></div>`).join("") +
    (nm >= H0 && nm <= H1 ? `<div class="now" style="left:${pct(nm)}%"></div>` : "");
  const next = list.find((i) => WP.toMin(i.end) / 60 > nm);
  $("bNext").textContent = list.length ? (next ? `⏭️ 다음: ${next.start} ${next.title || `${next.course} ${next.week}주차 공부`}` : "✅ 오늘 일정 모두 끝") : "☕ 오늘은 일정이 없어요";

  const ex = D.exams.filter((e) => e.date >= TODAY).sort((a, b) => a.date.localeCompare(b.date));
  $("bCount").innerHTML = ex[0]
    ? `<div class="cd">${ddayTxt(WP.dday(TODAY, ex[0].date))}</div><div>🎯 ${esc(ex[0].course)}<br><span>${esc(ex[0].kind)} ${label(ex[0].date)}</span></div>`
    : `<div class="cd">—</div><div>🎉 남은 시험 없음</div>`;

  const study = studyFor(TODAY);
  const mon0 = WP.mondayOf(TODAY);
  const wkBlocks = [...plan(mon0).blocks, ...Object.entries(logs).filter(([d]) => d >= mon0 && d <= WP.addDays(mon0, 6)).flatMap(([, v]) => Object.values(v.blocks || {}))];
  const wk = wkBlocks.length, wkMin = wkBlocks.reduce((x, b) => x + blockMin(b), 0);
  const cs = WP.courses(D, TODAY).filter((c) => c.deadline);
  const tot = cs.reduce((s, c) => s + WP.weekRange(c).length, 0);
  const fin = cs.reduce((s, c) => s + WP.weekRange(c).filter((w) => isDone(c.course, w)).length, 0);
  $("stats").innerHTML = [
    ["📌 오늘 일정", `${items(TODAY).length}건`, `${WP.busyHours(items(TODAY))}시간`],
    ["✏️ 오늘 공부", `${study.filter((b) => b.done).length} / ${study.length}`, "완료 / 계획 블록"],
    ["🗓️ 이번 주 공부", `${wkMin / 60}시간`, `${wk}블록 배분`],
    ["📚 전체 진도", `${tot ? Math.round((fin / tot) * 100) : 0}%`, `${fin} / ${tot} 주차 완료`],
  ].map(([l, v, n]) => `<div class="stat"><span class="l">${l}</span><b>${v}</b><span class="n">${n}</span></div>`).join("");
}

/* ---------- 일간 ---------- */
function renderDay() {
  const list = dayAll(sel);
  const ex = WP.examsOn(D, sel);
  $("dayTitle").textContent = `${label(sel)}${sel === TODAY ? " · 오늘" : ""}`;
  const h = WP.busyHours(list);
  $("dayLoad").textContent = `⏱️ ${h}시간 · 여유 ${Math.max(0, WP.DAY_HOURS - h)}시간`;
  const rows = ex.map((e) => `<li class="exam"><span class="t">🎯 시험</span><div class="body"><b>${esc(e.course)}</b> <span class="badge b-red">${esc(e.kind)}</span></div></li>`);
  for (const it of list) {
    if (it.type === "study") {
      const isPast = sel < TODAY;
      rows.push(`<li class="study${it.done ? " fin" : ""}" data-key="${esc(it.key)}">
        <span class="t">${it.start}–${it.end}</span>
        <div class="body">
          <div class="ttl">✏️ <b>${esc(it.course)}</b> ${it.week}주차 복습 ${lvBadge(it.course)} ${isDone(it.course, it.week) ? '<span class="badge b-green">주차 완료</span>' : ""}</div>
          <div class="logrow">
            <label class="chk pct">진행률 <input type="range" class="bpct" min="0" max="100" step="10" value="${pctOf(it.course, it.week)}" aria-label="${esc(it.course)} ${it.week}주차 진행률"> <b class="pv">${pctOf(it.course, it.week)}%</b></label>
            <input class="bnote" value="${esc(it.note)}" placeholder="${isPast ? "기록 없음" : "어디까지 했는지 적기 (예: 슬라이드 1~20p)"}" aria-label="${esc(it.course)} ${it.week}주차 기록">
          </div>
        </div></li>`);
    } else {
      const i = myEvents.indexOf(it);
      rows.push(`<li style="--c:${TYPE_COLOR[it.type] || "#94a3b8"}"><span class="t">${it.start}–${it.end}</span><div class="body">${TYPE[it.type]?.[0] || "📌"} ${esc(it.title)} <span class="muted small">${TYPE_NAME[it.type] || ""}</span></div>${i >= 0 ? `<span class="acts"><button class="x ed" data-i="${i}" aria-label="수정">✎</button><button class="x del" data-i="${i}" aria-label="삭제">✕</button></span>` : ""}</li>`);
    }
  }
  $("dayList").innerHTML = rows.join("") || `<li class="empty">🌿 비어 있는 날이에요. 쉬거나 밀린 공부를 해 보세요.</li>`;
  renderExtras();
  if (editing === null) $("addForm").date.value = sel;
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
    html += `<div class="col${d === TODAY ? " today" : ""}">` + dayAll(d).map((w) => {
      const top = (WP.toMin(w.start) / 60 - H0) * PX, h = ((WP.toMin(w.end) - WP.toMin(w.start)) / 60) * PX;
      const title = w.type === "study" ? `${w.course} ${w.week}주차` : w.title;
      return `<div class="blk ty-${w.type}${w.done ? " fin" : ""}" style="top:${top}px;height:${h - 2}px" title="${esc(title)} ${w.start}–${w.end}">${TYPE[w.type]?.[0] || ""} <b>${esc(title)}</b><br>${w.start}–${w.end}</div>`;
    }).join("") + `</div>`;
  }
  $("tt").innerHTML = html;

  // 이번 주 공부 배분 요약
  const p = plan(mon);
  const loggedWeek = days.flatMap((d) => Object.values(logs[d]?.blocks || {}));
  const all = [...loggedWeek, ...p.blocks];
  const per = {}, mins = {};
  all.forEach((b) => { per[b.course] = (per[b.course] || 0) + 1; mins[b.course] = (mins[b.course] || 0) + blockMin(b); });
  $("weekSum").innerHTML = (Object.keys(per).length
    ? Object.entries(per).map(([c, n]) => `<span class="chip">✏️ ${esc(c)} <b>${n}블록</b> · ${mins[c] / 60}시간</span>`).join("")
    : `<span class="muted">이번 주에 배분할 공부가 없어요. 🎉</span>`) +
    (p.overflow.length ? `<p class="warn">⏩ 이번 주 빈 시간에 다 못 넣은 공부: ${p.overflow.map((t) => `${esc(t.course)} ${t.week}주차`).join(", ")} → 체크하지 않으면 다음 주 계획에 자동으로 들어가요.</p>` : "");
  renderReview(mon, days);
}

// 🔁 이번 주 정리: 못 한 공부 / 이월된 준비할 것 / 이번 주·지난주에 더 한 것
function renderReview(mon, days) {
  const miss = missed();
  const carried = todosFor(mon).filter((t) => t.carry && !t.done);
  const extrasIn = (ds) => ds.flatMap((d) => (logs[d]?.extra || []).map((x) => ({ d, ...x })));
  const thisEx = extrasIn(days), lastEx = extrasIn(Array.from({ length: 7 }, (_, i) => WP.addDays(mon, i - 7)));
  const exLi = (x) => `<li><span class="muted small">${label(x.d)}</span> ${esc(x.course)}${x.week ? ` ${x.week}주차` : ""}${x.note ? ` · ${esc(x.note)}` : ""}</li>`;
  const box = (cls, title, body, empty) => `<div class="rv ${cls}"><h3>${title}</h3>${body || `<p class="muted small">${empty}</p>`}</div>`;
  $("review").innerHTML =
    box("miss", `❌ 못 한 공부 <span class="muted small">${miss.length}개</span>`, miss.length ? `<ul>${miss.map((b) => `<li><span class="muted small">${label(b.date)}</span> ${esc(b.course)} ${b.week}주차${b.pct ? ` (${b.pct}%)` : ""}</li>`).join("")}</ul><p class="muted small">남은 분량만큼 다음 빈 시간에 자동으로 다시 들어가요.</p>` : "", "밀린 공부가 없어요 👏") +
    box("carry", `⏩ 이월된 준비할 것 <span class="muted small">${carried.length}개</span>`, carried.length ? `<ul>${carried.map((t) => `<li>${esc(t.text)}</li>`).join("")}</ul>` : "", "지난주에서 넘어온 항목이 없어요") +
    box("extra", `➕ 이번 주에 더 한 것 <span class="muted small">${thisEx.length}개</span>`, thisEx.length ? `<ul>${thisEx.map(exLi).join("")}</ul><p class="muted small">주가 끝나면(다음 월요일) 집계해서 다음 주 계획에 반영해요.</p>` : "", "일간 계획에서 기록할 수 있어요") +
    box("last", `📌 지난주에 더 한 것 <span class="muted small">${lastEx.length}개</span>`, lastEx.length ? `<ul>${lastEx.map(exLi).join("")}</ul>` : "", "기록 없음");
}

// 지난 날 확정된 공부 블록 중 완료하지 못했고, 아직 시험이 남은 과목의 주차
function missed() {
  const live = new Map(WP.courses(D, TODAY).filter((c) => c.deadline).map((c) => [c.course, c]));
  const m = new Map();
  for (const [d, v] of Object.entries(logs)) {
    if (d >= TODAY) continue;
    for (const b of Object.values(v.blocks || {})) {
      if (!b.done && !isDone(b.course, b.week) && live.get(b.course)?.lastWeek >= b.week) m.set(b.key, { ...b, date: d, pct: pctOf(b.course, b.week) });
    }
  }
  return [...m.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/* ---------- ➕ 계획보다 더 한 것 ---------- */
function extraWeeks() {
  const c = WP.courses(D, TODAY).find((x) => x.course === $("extraCourse").value);
  $("extraWeek").innerHTML = `<option value="">주차 선택 안 함</option>` + (c ? WP.weekRange(c).filter((w) => !isDone(c.course, w)).map((w) => `<option value="${w}">${w}주차</option>`).join("") : "");
}
function renderExtras() {
  const keep = $("extraCourse").value;
  const cs = WP.courses(D, TODAY).filter((c) => c.deadline).map((c) => c.course);
  $("extraCourse").innerHTML = cs.map((c) => `<option${c === keep ? " selected" : ""}>${esc(c)}</option>`).join("") + `<option value="기타"${keep === "기타" ? " selected" : ""}>기타 (과목 외)</option>`;
  extraWeeks();
  const list = logs[sel]?.extra || [];
  $("extraList").innerHTML = list.map((x, i) => `<li>➕ <b>${esc(x.course)}</b>${x.week ? ` ${x.week}주차` : ""}${x.note ? ` · ${esc(x.note)}` : ""}<button class="x" data-i="${i}" aria-label="삭제">✕</button></li>`).join("");
}
$("extraCourse").onchange = extraWeeks;
$("extraForm").onsubmit = (e) => {
  e.preventDefault();
  const course = $("extraCourse").value, week = +$("extraWeek").value || 0, note = e.target.note.value.trim();
  if (!week && !note) return alert("주차를 고르거나 내용을 적어 주세요.");
  const day = (logs[sel] ||= { blocks: {} });
  (day.extra ||= []).push({ course, week, note });
  save("wp.logs", logs);
  // 이번 주 계획은 그대로 두고, 다음 월요일에 집계해서 반영한다
  e.target.note.value = "";
  refresh();
};
$("extraList").onclick = (e) => {
  const b = e.target.closest(".x"); if (!b) return;
  const x = logs[sel].extra.splice(+b.dataset.i, 1)[0];
  save("wp.logs", logs);
  if (x.week && x.applied) setPct(x.course, x.week, 0); // 이미 집계된 기록을 지우면 완료 처리도 되돌림
  refresh();
};

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
    const memo = logs[d]?.extra?.length ? `<span class="memo" title="계획보다 더 한 것 있음">➕</span>` : "";
    html += `<button class="${cls}" data-d="${d}" aria-label="${label(d)} ${h}시간"><span class="n">${+d.slice(8)}</span>${h ? `<span class="h">${h}h</span>` : ""}${memo}${ex}${alt}</button>`;
  }
  $("cal").innerHTML = html;
}

/* ---------- 과목 진도 ---------- */
function renderCourses() {
  const cw = WP.weekOf(D, TODAY);
  $("courses").innerHTML = WP.courses(D, TODAY).map((c) => {
    const weeks = WP.weekRange(c);
    const fin = weeks.filter((w) => isDone(c.course, w)).length;
    const pctv = weeks.length ? Math.round(weeks.reduce((x, w) => x + pctOf(c.course, w), 0) / weeks.length) : 0;
    const exams = D.exams.filter((e) => e.course === c.course).sort((a, b) => a.date.localeCompare(b.date));
    const notes = Object.entries(logs).flatMap(([d, v]) => Object.values(v.blocks || {}).filter((b) => b.course === c.course && b.note).map((b) => ({ d, ...b })))
      .sort((a, b) => b.d.localeCompare(a.d)).slice(0, 4);
    return `<article class="card course">
      <header><h3>📘 ${esc(c.course)}</h3>
        <span class="badge ${c.noMidterm ? "b-red" : "b-blue"}">${c.noMidterm ? "중간고사 없음 · 1주차부터" : "중간고사 봄 · 9주차부터"}</span> ${lvBadge(c.course)}</header>
      <div class="exl">${exams.map((e) => `<span class="${e.date < TODAY ? "past" : ""}">🎯 ${esc(e.kind)} ${label(e.date)}${e.alt ? ` 또는 ${label(e.alt)}` : ""} <b>${e.date < TODAY ? "종료" : ddayTxt(WP.dday(TODAY, e.date))}</b></span>`).join("")}</div>
      <div class="pbar"><i style="width:${pctv}%"></i></div>
      <p class="small muted">${fin} / ${weeks.length} 주차 완료 (${pctv}%)${c.deadline ? "" : " · 남은 시험 없음"}</p>
      <div class="weeks">${weeks.map((w) => `<button class="wk${isDone(c.course, w) ? " on" : ""}${w > cw ? " future" : ""}" data-c="${esc(c.course)}" data-w="${w}" aria-pressed="${isDone(c.course, w)}" style="--p:${pctOf(c.course, w)}%" title="${w > cw ? "아직 진행 전인 주차 · " : ""}눌러서 완료/취소">${isDone(c.course, w) ? "✅" : ""}${w}주${pctOf(c.course, w) && !isDone(c.course, w) ? ` <small>${pctOf(c.course, w)}%</small>` : ""}</button>`).join("")}</div>
      ${notes.length ? `<ul class="notes">${notes.map((n) => `<li><span class="muted small">${label(n.d)} · ${n.week}주차</span> ${esc(n.note)}</li>`).join("")}</ul>` : ""}
    </article>`;
  }).join("") || `<p class="muted">시험이 등록된 과목이 없어요. ⚙️ 시간표·시험 편집에서 추가해 주세요.</p>`;
}

$("dayList").addEventListener("input", (e) => {
  if (e.target.classList.contains("bpct")) e.target.nextElementSibling.textContent = `${e.target.value}%`;
});

/* ---------- 이번 주 준비할 것 ---------- */
// 주간 계획에서 뽑은 이번 주 할 일: 공부(과목별 주차 묶음), 2주 안의 시험, 이번 주 특이사항
const weeksTxt = (ws) => {
  const consecutive = ws.every((w, i) => !i || w === ws[i - 1] + 1);
  return ws.length > 1 && consecutive ? `${ws[0]}~${ws[ws.length - 1]}주차` : `${ws.join("·")}주차`;
};
function autoTodos(mon) {
  const days = Array.from({ length: 7 }, (_, i) => WP.addDays(mon, i)), end = days[6];
  const blocks = [...days.flatMap((d) => Object.values(logs[d]?.blocks || {})), ...plan(mon).blocks];
  const byC = {};
  blocks.forEach((b) => (byC[b.course] ||= new Set()).add(b.week));
  const study = Object.entries(byC).map(([c, ws]) => `✏️ ${c} ${weeksTxt([...ws].sort((a, b) => a - b))} 복습`);
  const exams = D.exams.filter((e) => e.date >= mon && e.date <= WP.addDays(mon, 13)).sort((a, b) => a.date.localeCompare(b.date))
    .map((e) => `🎯 ${e.course} ${e.kind} ${label(e.date)} 대비`);
  const events = myEvents.filter((e) => e.date >= mon && e.date <= end).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start))
    .map((e) => `📍 ${label(e.date)} ${e.start} ${e.title}`);
  return [...study, ...exams, ...events].map((text) => ({ text, done: false, auto: true }));
}

// 저장된 목록이 없는 주: 주간 계획에서 자동으로 뽑은 할 일 + 지난주에 직접 적은 항목(못 한 것은 ⏩ 이월)
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
  $("tabs").innerHTML = btn("day", "📋 일간 계획") + btn("week", "🗓️ 주간 계획") + btn("month", "📆 월간") +
    (tabsCfg.course ? btn("course", "📚 과목 진도", true) : "") +
    tabsCfg.custom.map((c) => btn(c.id, `${c.emoji} ${c.name}`, true)).join("") +
    `<button class="addtab" id="addTab">＋ 탭 추가</button>`;
}
function setTab(t) {
  tab = validTab(t) ? t : "day"; save("wp.tab", tab);
  renderTabs();
  ["day", "week", "month", "course"].forEach((k) => ($(`p-${k}`).hidden = k !== tab));
  $("p-custom").hidden = !customTab(tab);
  renderPanel();
}
function renderPanel() {
  renderTodos();
  if (tab === "day") renderDay();
  else if (tab === "week") renderWeek();
  else if (tab === "month") renderCal();
  else if (tab === "course") renderCourses();
  else renderCustom(customTab(tab));
}

// 체크리스트 한 줄(준비할 것·내가 만든 탭 공용)
const checkItems = (list, empty) => list.map((t, i) => `<li class="${t.done ? "fin" : ""}">
    <input type="checkbox" data-i="${i}"${t.done ? " checked" : ""} aria-label="${esc(t.text)} 완료">
    <input class="tx" data-i="${i}" value="${esc(t.text)}" aria-label="항목 내용">
    ${t.carry ? '<span class="badge b-amber" title="지난주에 못 해서 넘어온 항목">⏩ 이월</span>' : ""}${t.auto ? '<span class="badge b-blue" title="주간 계획에서 자동으로 뽑은 항목">🗓️ 주간 계획</span>' : ""}
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
      if (!confirm("📚 과목 진도 탭을 숨길까요? 진도 기록은 그대로 남고, ＋ 탭 추가에서 다시 켤 수 있어요.")) return;
      tabsCfg.course = false;
    } else {
      const c = customTab(k);
      if (!confirm(`"${c.name}" 탭을 삭제할까요? 안에 있는 항목 ${c.items.length}개와 메모도 함께 지워져요.`)) return;
      tabsCfg.custom = tabsCfg.custom.filter((x) => x.id !== k);
    }
    saveTabs(); return setTab(tab === k ? "day" : tab);
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
const refresh = () => { invalidate(); render(); };

/* ---------- 이벤트 ---------- */
const goDay = (d) => { sel = d; view = d.slice(0, 7); setTab("day"); };
$("cal").onclick = (e) => { const c = e.target.closest(".day"); if (c) goDay(c.dataset.d); };
$("tt").onclick = (e) => { const c = e.target.closest(".hd"); if (c) goDay(c.dataset.d); };
$("prev").onclick = () => { view = WP.addDays(`${view}-01`, -1).slice(0, 7); renderCal(); };
$("next").onclick = () => { view = WP.addDays(`${view}-28`, 7).slice(0, 7); renderCal(); };
document.querySelectorAll("[data-day]").forEach((b) => (b.onclick = () => { sel = +b.dataset.day ? WP.addDays(sel, +b.dataset.day) : TODAY; if (editing !== null) setEditing(null); renderDay(); renderTodos(); }));
document.querySelectorAll("[data-week]").forEach((b) => (b.onclick = () => { sel = WP.addDays(sel, +b.dataset.week); renderWeek(); renderTodos(); }));

// 공부 블록: 주차 완료 체크 / 진행 기록
$("dayList").addEventListener("change", (e) => {
  const li = e.target.closest("li.study"); if (!li) return;
  const b = studyFor(sel).find((x) => x.key === li.dataset.key); if (!b) return;
  if (e.target.classList.contains("bpct")) {
    const v = +e.target.value;
    setPct(b.course, b.week, v);
    logBlock(sel, b, { done: v === 100, pct: v });
  } else if (e.target.classList.contains("bnote")) {
    logBlock(sel, b, { note: e.target.value.trim() });
  }
  refresh();
});
$("courses").onclick = (e) => {
  const b = e.target.closest(".wk"); if (!b) return;
  setPct(b.dataset.c, +b.dataset.w, isDone(b.dataset.c, +b.dataset.w) ? 0 : 100);
  refresh();
};

// 내 일정 추가·수정·삭제
function setEditing(i) {
  editing = i;
  const f = $("addForm");
  $("addBtn").textContent = i === null ? "일정 추가" : "수정 저장";
  $("cancelEdit").hidden = i === null;
  f.classList.toggle("editing", i !== null);
  if (i === null) { f.title.value = ""; f.date.value = sel; return; }
  const ev = myEvents[i];
  for (const k of ["title", "date", "type", "start", "end"]) f[k].value = ev[k];
  f.title.focus();
}
$("dayList").addEventListener("click", (e) => {
  const b = e.target.closest(".x"); if (!b) return;
  const i = +b.dataset.i;
  if (b.classList.contains("ed")) return setEditing(i);
  if (!confirm("이 일정을 삭제할까요?")) return;
  myEvents.splice(i, 1); save("wp.events", myEvents);
  if (editing !== null) setEditing(null);
  refresh();
});
$("cancelEdit").onclick = () => setEditing(null);
$("addForm").onsubmit = (e) => {
  e.preventDefault();
  const f = Object.fromEntries(new FormData(e.target));
  if (f.end <= f.start) return alert("종료 시간이 시작 시간보다 늦어야 해요.");
  const ev = { date: f.date, start: f.start, end: f.end, title: f.title.trim(), type: f.type };
  if (editing === null) myEvents.push(ev); else myEvents[editing] = ev;
  save("wp.events", myEvents);
  sel = f.date; view = sel.slice(0, 7);
  setEditing(null); refresh();
};

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
  <td><select name="level" aria-label="난이도">${opts([[3, "상 (120분)"], [2, "중 (90분)"], [1, "하 (60분)"]], e.level || 2)}</select></td>
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
    x.level = +v(tr, "level").value;
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
const exportAll = () => downloadBackup("work-plan", { events: myEvents, weeks: done, wprog: prog, logs, todos, tabs: tabsCfg, schedule: load("wp.schedule", {}) });
$("export").onclick = exportAll;
$("import").onchange = async (e) => {
  const file = e.target.files[0]; e.target.value = "";
  if (!file) return;
  try {
    const d = JSON.parse(await file.text());
    if (!Array.isArray(d.events) || !d.events.every((x) => x.date && x.start && x.end && x.title)) throw new Error("형식이 맞지 않아요");
    if (!confirm(`백업으로 지금 기록을 바꿀까요? (일정 ${d.events.length}건) 현재 기록은 사라져요.`)) return;
    myEvents = d.events; done = d.weeks || {}; prog = d.wprog || {}; save("wp.wprog", prog); logs = d.logs || {}; todos = d.todos || {}; if (d.tabs) { tabsCfg = d.tabs; saveTabs(); }
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
    myEvents = myEvents.filter((e) => e.date >= START); done = {}; prog = {}; save("wp.wprog", prog); logs = after(logs); todos = after(todos);
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

const hasData = myEvents.length > 0 || Object.keys(logs).length > 0 || Object.keys(done).length > 0 || Object.keys(todos).length > 0 || tabsCfg.custom.length > 0 || Object.keys(load("wp.schedule", {})).length > 0;

// 주간 집계: 지난주까지 기록한 "더 한 것"의 주차를 완료로 처리해서 이번 주 계획에 반영한다(주마다 한 번)
const thisMon = WP.mondayOf(TODAY);
let tallied = false;
for (const [d, v] of Object.entries(logs)) {
  if (d >= thisMon) continue;
  for (const x of v.extra || []) if (x.week && !x.applied) { setPct(x.course, x.week, 100); x.applied = true; tallied = true; }
}
if (tallied) { save("wp.logs", logs); invalidate(); }

// 오늘 공부 계획은 그날 처음 열 때 확정한다. 날이 지나도 완료 체크가 없으면 "못 한 공부"로 남고 다음 주로 넘어간다.
if (!logs[TODAY]?.snap) {
  plan(WP.mondayOf(TODAY)).blocks.filter((b) => b.date === TODAY).forEach((b) => logBlock(TODAY, b, { done: false }));
  (logs[TODAY] ||= { blocks: {} }).snap = true;
  save("wp.logs", logs); invalidate();
}

setTab(tab);
renderBriefing();
backupReminder("work-plan", hasData, exportAll);
