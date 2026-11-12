import { load, save, downloadBackup, backupReminder } from "./db.js";

// 앱에서 편집한 시간표·시험이 있으면 data.js 기본값보다 우선
let D = { ...window.SCHEDULE, ...load("wp.schedule", {}) };
const TODAY = WP.fmt(new Date());
const TYPE = {
  class: ["📚", "수업"], meeting: ["🤝", "회의"], club: ["🎸", "동아리"], work: ["💼", "아르바이트"],
  field: ["🚗", "현장"], cert: ["📝", "자격증"], etc: ["📌", "기타"], study: ["✏️", "공부"],
};
const TYPE_NAME = Object.fromEntries(Object.entries(TYPE).filter(([k]) => k !== "study").map(([k, [, n]]) => [k, n]));
const DOW = ["일", "월", "화", "수", "목", "금", "토"];
const H0 = 8, H1 = 23; // 화면에 그리는 시간 범위

let myEvents = load("wp.events", []);
let done = load("wp.weeks", {});  // { 과목: [완료한 주차] }
let logs = load("wp.logs", {});   // { 날짜: { memo, blocks: { "과목|주차": 블록 + done + note } } }
let tab = load("wp.tab", "day");
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

// 주간 자동 배분은 렌더마다 다시 계산하지 않도록 주 단위로 캐시
const planCache = {};
const plan = (weekStart) => (planCache[weekStart] ??= WP.planWeek(D, myEvents, done, logs, weekStart, TODAY, nowMin()));
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
  const day = (logs[date] ||= { memo: "", blocks: {} });
  day.blocks ||= {};
  const cur = day.blocks[b.key] || { key: b.key, course: b.course, week: b.week, start: b.start, end: b.end, type: "study", date };
  day.blocks[b.key] = { ...cur, ...patch };
  save("wp.logs", logs);
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
  const wk = plan(WP.mondayOf(TODAY)).blocks.length + Object.entries(logs).filter(([d]) => d >= WP.mondayOf(TODAY) && d <= WP.addDays(WP.mondayOf(TODAY), 6)).reduce((s, [, v]) => s + Object.keys(v.blocks || {}).length, 0);
  const cs = WP.courses(D, TODAY).filter((c) => c.deadline);
  const tot = cs.reduce((s, c) => s + WP.weekRange(c).length, 0);
  const fin = cs.reduce((s, c) => s + WP.weekRange(c).filter((w) => isDone(c.course, w)).length, 0);
  $("stats").innerHTML = [
    ["📌 오늘 일정", `${items(TODAY).length}건`, `${WP.busyHours(items(TODAY))}시간`],
    ["✏️ 오늘 공부", `${study.filter((b) => b.done).length} / ${study.length}`, "완료 / 계획 블록"],
    ["🗓️ 이번 주 공부", `${(wk * WP.STUDY_MIN) / 60}시간`, `${wk}블록 배분`],
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
          <div class="ttl">✏️ <b>${esc(it.course)}</b> ${it.week}주차 복습 ${isDone(it.course, it.week) ? '<span class="badge b-green">주차 완료</span>' : ""}</div>
          <div class="logrow">
            <label class="chk"><input type="checkbox" class="bdone"${it.done ? " checked" : ""}> 주차 완료</label>
            <input class="bnote" value="${esc(it.note)}" placeholder="${isPast ? "기록 없음" : "어디까지 했는지 적기 (예: 슬라이드 1~20p)"}" aria-label="${esc(it.course)} ${it.week}주차 기록">
          </div>
        </div></li>`);
    } else {
      const i = myEvents.indexOf(it);
      rows.push(`<li><span class="t">${it.start}–${it.end}</span><div class="body">${TYPE[it.type]?.[0] || "📌"} ${esc(it.title)} <span class="muted small">${TYPE_NAME[it.type] || ""}</span></div>${i >= 0 ? `<span class="acts"><button class="x ed" data-i="${i}" aria-label="수정">✎</button><button class="x del" data-i="${i}" aria-label="삭제">✕</button></span>` : ""}</li>`);
    }
  }
  $("dayList").innerHTML = rows.join("") || `<li class="empty">🌿 비어 있는 날이에요. 쉬거나 밀린 공부를 해 보세요.</li>`;
  $("memo").value = logs[sel]?.memo || "";
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
  const per = {};
  all.forEach((b) => (per[b.course] = (per[b.course] || 0) + 1));
  $("weekSum").innerHTML = (Object.keys(per).length
    ? Object.entries(per).map(([c, n]) => `<span class="chip">✏️ ${esc(c)} <b>${n}블록</b> · ${(n * WP.STUDY_MIN) / 60}시간</span>`).join("")
    : `<span class="muted">이번 주에 배분할 공부가 없어요. 🎉</span>`) +
    (p.overflow.length ? `<p class="warn">⚠️ 빈 시간이 부족해서 못 넣은 공부: ${p.overflow.map((t) => `${esc(t.course)} ${t.week}주차`).join(", ")}. 일정을 줄이거나 주말을 활용해 보세요.</p>` : "");
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
    const memo = logs[d]?.memo ? `<span class="memo" title="하루 기록 있음">📝</span>` : "";
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
    const pctv = weeks.length ? Math.round((fin / weeks.length) * 100) : 0;
    const exams = D.exams.filter((e) => e.course === c.course).sort((a, b) => a.date.localeCompare(b.date));
    const notes = Object.entries(logs).flatMap(([d, v]) => Object.values(v.blocks || {}).filter((b) => b.course === c.course && b.note).map((b) => ({ d, ...b })))
      .sort((a, b) => b.d.localeCompare(a.d)).slice(0, 4);
    return `<article class="card course">
      <header><h3>📘 ${esc(c.course)}</h3>
        <span class="badge ${c.noMidterm ? "b-red" : "b-blue"}">${c.noMidterm ? "중간고사 없음 · 1주차부터" : "중간고사 봄 · 9주차부터"}</span></header>
      <div class="exl">${exams.map((e) => `<span class="${e.date < TODAY ? "past" : ""}">🎯 ${esc(e.kind)} ${label(e.date)}${e.alt ? ` 또는 ${label(e.alt)}` : ""} <b>${e.date < TODAY ? "종료" : ddayTxt(WP.dday(TODAY, e.date))}</b></span>`).join("")}</div>
      <div class="pbar"><i style="width:${pctv}%"></i></div>
      <p class="small muted">${fin} / ${weeks.length} 주차 완료 (${pctv}%)${c.deadline ? "" : " · 남은 시험 없음"}</p>
      <div class="weeks">${weeks.map((w) => `<button class="wk${isDone(c.course, w) ? " on" : ""}${w > cw ? " future" : ""}" data-c="${esc(c.course)}" data-w="${w}" aria-pressed="${isDone(c.course, w)}" title="${w > cw ? "아직 진행 전인 주차" : ""}">${isDone(c.course, w) ? "✅" : ""}${w}주</button>`).join("")}</div>
      ${notes.length ? `<ul class="notes">${notes.map((n) => `<li><span class="muted small">${label(n.d)} · ${n.week}주차</span> ${esc(n.note)}</li>`).join("")}</ul>` : ""}
    </article>`;
  }).join("") || `<p class="muted">시험이 등록된 과목이 없어요. ⚙️ 시간표·시험 편집에서 추가해 주세요.</p>`;
}

function setTab(t) {
  tab = t; save("wp.tab", t);
  document.querySelectorAll(".tabs [role=tab]").forEach((b) => b.setAttribute("aria-selected", b.dataset.tab === t));
  ["day", "week", "month", "course"].forEach((k) => ($(`p-${k}`).hidden = k !== t));
  renderPanel();
}
function renderPanel() {
  if (tab === "day") renderDay();
  else if (tab === "week") renderWeek();
  else if (tab === "month") renderCal();
  else renderCourses();
}
function render() { renderBriefing(); renderPanel(); }
const refresh = () => { invalidate(); render(); };

/* ---------- 이벤트 ---------- */
document.querySelector(".tabs").onclick = (e) => { const b = e.target.closest("[data-tab]"); if (b) setTab(b.dataset.tab); };
const goDay = (d) => { sel = d; view = d.slice(0, 7); setTab("day"); };
$("cal").onclick = (e) => { const c = e.target.closest(".day"); if (c) goDay(c.dataset.d); };
$("tt").onclick = (e) => { const c = e.target.closest(".hd"); if (c) goDay(c.dataset.d); };
$("prev").onclick = () => { view = WP.addDays(`${view}-01`, -1).slice(0, 7); renderCal(); };
$("next").onclick = () => { view = WP.addDays(`${view}-28`, 7).slice(0, 7); renderCal(); };
document.querySelectorAll("[data-day]").forEach((b) => (b.onclick = () => { sel = +b.dataset.day ? WP.addDays(sel, +b.dataset.day) : TODAY; if (editing !== null) setEditing(null); renderDay(); }));
document.querySelectorAll("[data-week]").forEach((b) => (b.onclick = () => { sel = WP.addDays(sel, +b.dataset.week); renderWeek(); }));

// 공부 블록: 주차 완료 체크 / 진행 기록
$("dayList").addEventListener("change", (e) => {
  const li = e.target.closest("li.study"); if (!li) return;
  const b = studyFor(sel).find((x) => x.key === li.dataset.key); if (!b) return;
  if (e.target.classList.contains("bdone")) {
    logBlock(sel, b, { done: e.target.checked });
    setWeekDone(b.course, b.week, e.target.checked);
  } else if (e.target.classList.contains("bnote")) {
    logBlock(sel, b, { note: e.target.value.trim() });
  }
  refresh();
});
$("memo").onchange = (e) => {
  const day = (logs[sel] ||= { memo: "", blocks: {} });
  day.memo = e.target.value; save("wp.logs", logs);
};
$("courses").onclick = (e) => {
  const b = e.target.closest(".wk"); if (!b) return;
  setWeekDone(b.dataset.c, +b.dataset.w, !isDone(b.dataset.c, +b.dataset.w));
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
const exportAll = () => downloadBackup("work-plan", { events: myEvents, weeks: done, logs, schedule: load("wp.schedule", {}) });
$("export").onclick = exportAll;
$("import").onchange = async (e) => {
  const file = e.target.files[0]; e.target.value = "";
  if (!file) return;
  try {
    const d = JSON.parse(await file.text());
    if (!Array.isArray(d.events) || !d.events.every((x) => x.date && x.start && x.end && x.title)) throw new Error("형식이 맞지 않아요");
    if (!confirm(`백업으로 지금 기록을 바꿀까요? (일정 ${d.events.length}건) 현재 기록은 사라져요.`)) return;
    myEvents = d.events; done = d.weeks || {}; logs = d.logs || {};
    save("wp.events", myEvents); save("wp.weeks", done); save("wp.logs", logs);
    if (d.schedule) { save("wp.schedule", d.schedule); D = { ...window.SCHEDULE, ...d.schedule }; }
    refresh();
  } catch (err) { alert("백업 파일을 읽지 못했어요: " + err.message); }
};

setTab(["day", "week", "month", "course"].includes(tab) ? tab : "day");
renderBriefing();
backupReminder("work-plan", myEvents.length > 0 || Object.keys(logs).length > 0 || Object.keys(done).length > 0 || Object.keys(load("wp.schedule", {})).length > 0, exportAll);
