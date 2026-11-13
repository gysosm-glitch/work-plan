// 날짜·부하·주차 계산. 브라우저(window.WP)와 node 테스트 양쪽에서 쓴다.
(function (root) {
  const pad = (n) => String(n).padStart(2, "0");
  const parse = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return fmt(d); };
  const toMin = (t) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
  const dday = (from, to) => Math.round((parse(to) - parse(from)) / 864e5);
  const mondayOf = (s) => addDays(s, -((parse(s).getDay() + 6) % 7));
  const DAY_HOURS = 14; // 활동 가능 시간 09~23시


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
      c.dates.push(e.date);
    }
    return Object.values(map).map((c) => {
      const dates = c.dates.sort();
      const deadline = dates.find((d) => d >= today) || null;
      const lastWeek = weekOf(data, deadline || dates[dates.length - 1]) - 1;
      return { course: c.course, noMidterm: c.noMidterm, startWeek: c.noMidterm ? 1 : 9, lastWeek, deadline };
    }).sort((a, b) => (a.deadline || "9").localeCompare(b.deadline || "9"));
  }

  const weekRange = (c) => { const out = []; for (let w = c.startWeek; w <= c.lastWeek; w++) out.push(w); return out; };


  const api = { pad, parse, fmt, addDays, toMin, dday, mondayOf, itemsForDate, busyHours, examsOn, weekOf, courses, weekRange, DAY_HOURS };
  if (typeof module !== "undefined") module.exports = api; else root.WP = api;
})(this);
