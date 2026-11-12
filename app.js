import { load, save } from "./db.js";

const D = window.SCHEDULE;
const TODAY = WP.fmt(new Date());
const TYPE_NAME = { class: "수업", meeting: "회의", club: "동아리", work: "아르바이트", field: "현장", cert: "자격증", etc: "기타" };
const DOW = ["일", "월", "화", "수", "목", "금", "토"];

let myEvents = [];
let progress = {};
let sel = TODAY;
let view = TODAY.slice(0, 7);

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const items = (date) => WP.itemsForDate(D, date, myEvents);
const hours = (date) => WP.busyHours(items(date));
const level = (h) => (h === 0 ? 0 : h <= 3 ? 1 : h <= 5 ? 2 : h <= 7 ? 3 : 4);
const label = (d) => { const x = WP.parse(d); return `${x.getMonth() + 1}/${x.getDate()}(${DOW[x.getDay()]})`; };
const ddayTxt = (n) => (n === 0 ? "D-DAY" : n > 0 ? `D-${n}` : `D+${-n}`);
const examKey = (e) => `${e.course}|${e.kind}`;
const upcoming = () => D.exams.filter((e) => e.date >= TODAY).sort((a, b) => a.date.localeCompare(b.date));
const H0 = 8, H1 = 23; // 화면에 그리는 시간 범위

function renderBriefing() {
  const t = WP.parse(TODAY);
  $("bDate").innerHTML = `<b>${t.getMonth() + 1}월 ${t.getDate()}일</b><span>${DOW[t.getDay()]}요일</span>`;
  const list = items(TODAY);
  const now = new Date(), nowH = now.getHours() + now.getMinutes() / 60;
  const pct = (h) => ((h - H0) / (H1 - H0)) * 100;
  $("strip").innerHTML =
    Array.from({ length: H1 - H0 + 1 }, (_, i) => `<span class="tick" style="left:${pct(H0 + i)}%">${H0 + i}</span>`).join("") +
    list.map((i) => `<div class="seg ty-${i.type}" style="left:${pct(WP.toMin(i.start) / 60)}%;width:${pct(WP.toMin(i.end) / 60) - pct(WP.toMin(i.start) / 60)}%" title="${esc(i.title)} ${i.start}–${i.end}"><span>${esc(i.title)}</span></div>`).join("") +
    (nowH >= H0 && nowH <= H1 ? `<div class="now" style="left:${pct(nowH)}%"></div>` : "");
  const nextItem = list.find((i) => WP.toMin(i.end) / 60 > nowH);
  $("bNext").textContent = list.length ? (nextItem ? `다음: ${nextItem.start} ${nextItem.title}` : "오늘 일정 모두 끝") : "오늘은 고정 일정이 없어요";

  const next = upcoming()[0];
  $("bCount").innerHTML = next
    ? `<div class="cd">${ddayTxt(WP.dday(TODAY, next.date))}</div><div>${esc(next.course)}<br><span>${next.kind} ${label(next.date)}</span></div>`
    : `<div class="cd">—</div><div>남은 시험 없음</div>`;

  const mon = WP.addDays(TODAY, -((t.getDay() + 6) % 7));
  let week = 0;
  for (let i = 0; i < 7; i++) week += hours(WP.addDays(mon, i));
  const ex = upcoming();
  const urgent = ex.filter((e) => TODAY >= WP.prepStart(e) && (progress[examKey(e)] || 0) < 100).length;
  $("stats").innerHTML = [
    ["오늘 일정", `${list.length}건`, `${WP.busyHours(list)}시간`],
    ["이번 주 일정", `${week}시간`, `${label(mon)}부터`],
    ["남은 시험·발표", `${ex.length}개`, "12월 17일까지"],
    ["지금 준비할 과목", `${urgent}개`, urgent ? "아래 표에서 진도 확인" : "여유 있음"],
  ].map(([l, v, n]) => `<div class="stat"><span class="l">${l}</span><b>${v}</b><span class="n">${n}</span></div>`).join("");
}

function renderCal() {
  const [y, m] = view.split("-").map(Number);
  $("month").textContent = `${y}년 ${m}월`;
  const first = `${view}-01`;
  const start0 = WP.addDays(first, -WP.parse(first).getDay());
  let html = DOW.map((d) => `<div class="dow">${d}</div>`).join("");
  for (let i = 0; i < 42; i++) {
    const d = WP.addDays(start0, i);
    const h = hours(d);
    const cls = ["day", `l${level(h)}`, d.slice(0, 7) !== view && "out", d === TODAY && "today", d === sel && "sel"].filter(Boolean).join(" ");
    const ex = WP.examsOn(D, d).map((e) => `<span class="ex" title="${esc(e.course)} ${e.kind}">${esc(e.course)}</span>`).join("");
    const alt = D.exams.filter((e) => e.alt === d).map((e) => `<span class="ex alt" title="후보일">${esc(e.course)}?</span>`).join("");
    html += `<button class="${cls}" data-d="${d}" aria-label="${label(d)} ${h}시간"><span class="n">${+d.slice(8)}</span>${h ? `<span class="h">${h}h</span>` : ""}${ex}${alt}</button>`;
  }
  $("cal").innerHTML = html;
}

function renderDay() {
  const list = items(sel);
  const ex = WP.examsOn(D, sel);
  $("dayTitle").innerHTML = `${label(sel)} <span class="right muted">${WP.busyHours(list)}h 일정 · 여유 ${Math.max(0, WP.DAY_HOURS - WP.busyHours(list))}h</span>`;
  const rows = ex.map((e) => `<li><span class="t">시험</span><span class="badge b-red">${esc(e.kind)}</span>${esc(e.course)}</li>`);
  for (const it of list) {
    const i = myEvents.indexOf(it);
    rows.push(`<li><span class="t">${it.start}–${it.end}</span><i class="dot ty-${it.type}"></i>${esc(it.title)} <span class="muted">${TYPE_NAME[it.type] || ""}</span>${i >= 0 ? `<button class="x" data-i="${i}" aria-label="삭제">✕</button>` : ""}</li>`);
  }
  $("agenda").innerHTML = rows.join("") || `<li class="muted">비어 있는 날이에요. 공부 일정을 넣어 보세요.</li>`;
}

function renderExams() {
  const all = [...D.exams].sort((a, b) => a.date.localeCompare(b.date));
  $("exams").innerHTML = `<tr><th>과목</th><th>구분</th><th>날짜</th><th>D-day</th><th>범위</th><th>준비 시작</th><th>진도</th><th>상태</th></tr>` +
    all.map((e) => {
      const n = WP.dday(TODAY, e.date);
      const p = progress[examKey(e)] || 0;
      const prep = WP.prepStart(e);
      const st = n < 0 ? ["b-gray", "종료"] : p >= 100 ? ["b-green", "준비 완료"] : TODAY >= prep ? ["b-red", "지금 준비"] : ["b-amber", "대기"];
      return `<tr><td><b>${esc(e.course)}</b></td><td>${e.kind}</td><td>${label(e.date)}${e.alt ? ` <span class="muted">또는 ${label(e.alt)}</span>` : ""}</td>
        <td class="num dd">${ddayTxt(n)}</td><td>${e.noMidterm ? '<span class="badge b-red">전 범위</span>' : '<span class="muted">기말 범위</span>'}</td>
        <td>${label(prep)}</td>
        <td><input class="prog" type="range" min="0" max="100" step="10" value="${p}" data-k="${esc(examKey(e))}" aria-label="${esc(e.course)} ${e.kind} 진도"> <span class="pv">${p}%</span></td>
        <td><span class="badge ${st[0]}">${st[1]}</span></td></tr>`;
    }).join("");
}

function renderFree() {
  $("free").innerHTML = `<tr><th>날짜</th><th>여유</th><th>그날 일정</th></tr>` +
    WP.freeDays(D, TODAY, 14, myEvents).slice(0, 6).map((f) =>
      `<tr><td>${label(f.date)}</td><td class="num"><b>${f.free}h</b></td><td class="muted">${items(f.date).map((i) => esc(i.title)).join(", ") || "-"}</td></tr>`).join("");
}

function renderTT() {
  const PX = 40;
  const order = [1, 2, 3, 4, 5, 6, 0];
  let html = `<div></div>` + order.map((d) => `<div class="hd">${DOW[d]}</div>`).join("");
  html += `<div class="hours">${Array.from({ length: H1 - H0 }, (_, i) => `<span style="top:${i * PX}px">${H0 + i}</span>`).join("")}</div>`;
  for (const d of order) {
    html += `<div class="col">` + D.weekly.filter((w) => w.day === d).map((w) => {
      const top = (WP.toMin(w.start) / 60 - H0) * PX, h = (WP.toMin(w.end) - WP.toMin(w.start)) / 60 * PX;
      return `<div class="blk ty-${w.type}" style="top:${top}px;height:${h - 2}px"><b>${esc(w.title)}</b><br>${w.start}–${w.end}</div>`;
    }).join("") + `</div>`;
  }
  $("tt").innerHTML = html;
}

function render() { renderBriefing(); renderCal(); renderDay(); renderExams(); renderFree(); }

$("cal").onclick = (e) => { const c = e.target.closest(".day"); if (c) { sel = c.dataset.d; render(); } };
$("prev").onclick = () => { view = WP.addDays(`${view}-01`, -1).slice(0, 7); renderCal(); };
$("next").onclick = () => { view = WP.addDays(`${view}-28`, 7).slice(0, 7); renderCal(); };
$("agenda").onclick = (e) => {
  const b = e.target.closest(".x"); if (!b) return;
  if (!confirm("이 일정을 삭제할까요?")) return;
  myEvents.splice(+b.dataset.i, 1); save("wp.events", myEvents); render();
};
$("addForm").onsubmit = (e) => {
  e.preventDefault();
  const f = Object.fromEntries(new FormData(e.target));
  if (f.end <= f.start) return alert("종료 시간이 시작 시간보다 늦어야 해요.");
  myEvents.push({ date: sel, start: f.start, end: f.end, title: f.title.trim(), type: f.type });
  save("wp.events", myEvents); e.target.title.value = ""; render();
};
$("exams").oninput = (e) => {
  if (!e.target.dataset.k) return;
  progress[e.target.dataset.k] = +e.target.value;
  e.target.nextElementSibling.textContent = `${e.target.value}%`;
};
$("exams").onchange = (e) => { if (e.target.dataset.k) { save("wp.progress", progress); renderExams(); renderBriefing(); } };

$("export").onclick = () => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify({ events: myEvents, progress }, null, 2)], { type: "application/json" }));
  a.download = `work-plan-backup-${TODAY}.json`; a.click(); URL.revokeObjectURL(a.href);
};
$("import").onchange = async (e) => {
  const file = e.target.files[0]; e.target.value = "";
  if (!file) return;
  try {
    const d = JSON.parse(await file.text());
    if (!Array.isArray(d.events) || !d.events.every((x) => x.date && x.start && x.end && x.title)) throw new Error("형식이 맞지 않아요");
    if (!confirm(`백업의 일정 ${d.events.length}건으로 지금 기록을 바꿀까요? 현재 추가한 일정은 사라져요.`)) return;
    myEvents = d.events; progress = d.progress || {};
    save("wp.events", myEvents); save("wp.progress", progress); render();
  } catch (err) { alert("백업 파일을 읽지 못했어요: " + err.message); }
};

myEvents = load("wp.events", []);
progress = load("wp.progress", {});
render(); renderTT();
