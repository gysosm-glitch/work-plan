// 날짜·부하 계산. 브라우저(window.WP)와 node 테스트 양쪽에서 쓴다.
(function (root) {
  const pad = (n) => String(n).padStart(2, "0");
  const parse = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return fmt(d); };
  const toMin = (t) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
  const dday = (from, to) => Math.round((parse(to) - parse(from)) / 864e5);
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
  const prepStart = (e) => addDays(e.date, e.noMidterm ? -21 : -10);

  // from부터 n일 중 여유 시간이 많은 순
  function freeDays(data, from, n, extra = []) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const date = addDays(from, i);
      if (examsOn(data, date).length) continue;
      out.push({ date, free: Math.max(0, DAY_HOURS - busyHours(itemsForDate(data, date, extra))) });
    }
    return out.sort((a, b) => b.free - a.free || a.date.localeCompare(b.date));
  }

  const api = { pad, parse, fmt, addDays, toMin, dday, itemsForDate, busyHours, examsOn, prepStart, freeDays, DAY_HOURS };
  if (typeof module !== "undefined") module.exports = api; else root.WP = api;
})(this);
