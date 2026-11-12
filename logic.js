// 날짜·부하·주차·공부 자동 배분 계산. 브라우저(window.WP)와 node 테스트 양쪽에서 쓴다.
(function (root) {
  const pad = (n) => String(n).padStart(2, "0");
  const parse = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return fmt(d); };
  const toMin = (t) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
  const hm = (min) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
  const dday = (from, to) => Math.round((parse(to) - parse(from)) / 864e5);
  const mondayOf = (s) => addDays(s, -((parse(s).getDay() + 6) % 7));
  const DAY_HOURS = 14; // 활동 가능 시간 09~23시

  // 공부 블록 배분 규칙
  const LEVEL_MIN = { 1: 60, 2: 90, 3: 120 };            // 난이도(하·중·상)별 한 주차 분량 공부 시간
  const LEVEL_NAME = { 1: "하", 2: "중", 3: "상" };
  const STUDY_MIN = 90;                                   // 난이도 미지정 기본값
  const CAP_MIN = 270;                                    // 하루 공부 최대 4.5시간
  const WIN = [9 * 60, 23 * 60];                          // 공부 가능 시간
  const BREAKS = [[12 * 60, 13 * 60], [18 * 60, 19 * 60]]; // 점심·저녁

  function itemsForDate(data, date, extra = []) {
    const dow = parse(date).getDay();
    const inSem = date >= data.semester.start && date <= data.semester.end && !data.skip.includes(date);
    const weekly = inSem ? data.weekly.filter((w) => w.day === dow) : [];
    const events = [...data.events, ...extra].filter((e) => e.date === date);
    return [...weekly, ...events].sort((a, b) => toMin(a.start) - toMin(b.start));
  }

  // shortcut: 겹치는 일정은 중복 합산됨, 겹침이 생기면 구간 병합으로 교체
  const busyHours = (items) => items.reduce((s, i) => s + (toMin(i.end) - toMin(i.start)) / 60, 0);
  const examsOn = (data, date) => data.exams.filter((e) => e.date === date);

  // 학기 주차: 개강일이 있는 주의 월요일 = 1주차 시작
  const weekOf = (data, date) => Math.floor(dday(mondayOf(data.semester.start), date) / 7) + 1;

  // 과목별 진도 범위: 중간고사 없음 → 1주차부터, 있음 → 9주차부터. 다가오는 시험 전 주까지.
  function courses(data, today) {
    const map = {};
    for (const e of data.exams) {
      const c = (map[e.course] ||= { course: e.course, noMidterm: false, dates: [] });
      if (e.noMidterm) c.noMidterm = true;
      c.level = Math.max(c.level || 0, +e.level || 2);
      c.dates.push(e.date);
    }
    return Object.values(map).map((c) => {
      const dates = c.dates.sort();
      const deadline = dates.find((d) => d >= today) || null;
      const lastWeek = weekOf(data, deadline || dates[dates.length - 1]) - 1;
      return { course: c.course, noMidterm: c.noMidterm, level: c.level, len: LEVEL_MIN[c.level], startWeek: c.noMidterm ? 1 : 9, lastWeek, deadline };
    }).sort((a, b) => (a.deadline || "9").localeCompare(b.deadline || "9"));
  }

  const weekRange = (c) => { const out = []; for (let w = c.startWeek; w <= c.lastWeek; w++) out.push(w); return out; };

  function freeSlots(items) {
    const busy = [...items.map((i) => [toMin(i.start), toMin(i.end)]), ...BREAKS].sort((a, b) => a[0] - b[0]);
    const out = [];
    let t = WIN[0];
    for (const [s, e] of busy) {
      if (s > t) out.push([t, Math.min(s, WIN[1])]);
      t = Math.max(t, e);
      if (t >= WIN[1]) break;
    }
    if (t < WIN[1]) out.push([t, WIN[1]]);
    return out.filter(([s, e]) => e > s);
  }

  // 주간 계획: 이번 주에 해야 할 주차 분량을 오늘 이후의 빈 시간에 나눠 넣는다.
  // done: { 과목: [완료 주차] }, logs: { 날짜: { blocks: { key: 블록 } } } (기록된 블록은 고정으로 취급)
  function planWeek(data, extra, done, logs, weekStart, today, nowMin = 0) {
    const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
    const thisWeek = weekOf(data, weekStart);
    const state = {};
    const logged = new Set();
    for (const d of days) {
      const lb = Object.values(logs[d]?.blocks || {});
      lb.forEach((b) => logged.add(b.key));
      if (d < today) continue;
      const past = d === today && nowMin > 0 ? [{ start: "00:00", end: hm(Math.ceil(nowMin / 30) * 30) }] : []; // 오늘은 지금 이후만
      const used = lb.reduce((x, b) => x + toMin(b.end) - toMin(b.start), 0);
      state[d] = { slots: freeSlots([...itemsForDate(data, d, extra), ...lb, ...past]), used, per: {} };
    }
    const tasks = [];
    for (const c of courses(data, today)) {
      if (!c.deadline) continue;
      const pending = weekRange(c).filter((w) => w <= thisWeek && !(done[c.course] || []).includes(w) && !logged.has(`${c.course}|${w}`));
      const weeksLeft = Math.max(1, weekOf(data, c.deadline) - thisWeek);
      pending.slice(0, Math.ceil(pending.length / weeksLeft)).forEach((w) => tasks.push({ course: c.course, week: w, deadline: c.deadline, len: c.len, level: c.level }));
    }
    // 시험이 가까운 순, 같으면 어려운 과목 먼저(긴 블록이 들어갈 자리를 먼저 확보)
    tasks.sort((a, b) => a.deadline.localeCompare(b.deadline) || b.level - a.level || a.week - b.week);
    const blocks = [], overflow = [];
    for (const t of tasks) {
      let best = null;
      for (const d of days) {
        const s = state[d];
        if (!s || d >= t.deadline || s.used + t.len > CAP_MIN) continue;
        const slot = s.slots.find(([a, b]) => b - a >= t.len);
        if (!slot) continue;
        // 여유 시간이 많은 날 우선, 같은 과목은 하루에 몰리지 않게
        const score = s.slots.reduce((x, [a, b]) => x + b - a, 0) - 300 * (s.per[t.course] || 0);
        if (!best || score > best.score) best = { d, slot, score };
      }
      if (!best) { overflow.push(t); continue; }
      const s = state[best.d];
      const a = best.slot[0];
      best.slot[0] = a + t.len;
      s.used += t.len; s.per[t.course] = (s.per[t.course] || 0) + 1;
      blocks.push({ key: `${t.course}|${t.week}`, date: best.d, start: hm(a), end: hm(a + t.len), course: t.course, week: t.week, level: t.level, type: "study" });
    }
    // 같은 과목은 날짜 순서대로 앞 주차부터 하도록 주차 번호를 다시 붙인다
    const byCourse = {};
    blocks.forEach((b) => (byCourse[b.course] ||= []).push(b));
    for (const list of Object.values(byCourse)) {
      const weeks = list.map((b) => b.week).sort((x, y) => x - y);
      list.sort((x, y) => (x.date + x.start).localeCompare(y.date + y.start)).forEach((b, i) => { b.week = weeks[i]; b.key = `${b.course}|${b.week}`; });
    }
    return { blocks, overflow };
  }

  const api = { pad, parse, fmt, addDays, toMin, hm, dday, mondayOf, itemsForDate, busyHours, examsOn, weekOf, courses, weekRange, freeSlots, planWeek, DAY_HOURS, STUDY_MIN, CAP_MIN, LEVEL_MIN, LEVEL_NAME };
  if (typeof module !== "undefined") module.exports = api; else root.WP = api;
})(this);
