// 가계부 계산. 브라우저(window.FEE)와 node 테스트 양쪽에서 쓴다.
(function (root) {
  const pad = (n) => String(n).padStart(2, "0");
  const parse = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const daysIn = (ym) => { const [y, m] = ym.split("-").map(Number); return new Date(y, m, 0).getDate(); };
  const shiftMonth = (ym, n) => { const [y, m] = ym.split("-").map(Number); const d = new Date(y, m - 1 + n, 1); return fmt(d).slice(0, 7); };
  const won = (n) => `₩${Math.round(n).toLocaleString("ko-KR")}`;

  const inMonth = (entries, ym) => entries.filter((e) => e.date.startsWith(ym));

  function summary(list) {
    const s = { out: 0, inc: 0, wants: 0, byCat: {}, byDay: {} };
    for (const e of list) {
      if (e.type === "in") { s.inc += e.amount; continue; }
      s.out += e.amount;
      if (!e.need) s.wants += e.amount;
      s.byCat[e.category] = (s.byCat[e.category] || 0) + e.amount;
      s.byDay[e.date] = (s.byDay[e.date] || 0) + e.amount;
    }
    return s;
  }

  // 남은 예산을 오늘 포함 남은 날수로 나눈 하루 사용 가능액
  function allowance(budget, spent, today, ym) {
    const cur = today.slice(0, 7);
    if (ym < cur) return 0;
    const left = ym > cur ? daysIn(ym) : daysIn(ym) - parse(today).getDate() + 1;
    return Math.max(0, Math.floor((budget - spent) / left));
  }

  // 통장식 내역: 오래된 순으로 남은 예산을 누적 계산(수입은 예산을 늘리지 않음 = 저축)
  function ledger(list, budget) {
    let bal = budget;
    return [...list].sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id)
      .map((e) => ({ ...e, bal: e.type === "out" ? (bal -= e.amount) : bal }));
  }

  const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return fmt(d); };
  const mondayOf = (s) => addDays(s, -((parse(s).getDay() + 6) % 7));

  // endYm까지 최근 n개월의 수입·지출 합계 (오래된 달부터)
  function monthly(entries, endYm, n) {
    return Array.from({ length: n }, (_, i) => {
      const ym = shiftMonth(endYm, i - n + 1);
      const s = summary(inMonth(entries, ym));
      return { ym, out: s.out, inc: s.inc };
    });
  }

  // endDate가 속한 주까지 최근 n주(월~일)의 지출 합계. from(월요일)보다 앞선 주는 뺀다.
  function weekly(entries, endDate, n, from = "") {
    const last = mondayOf(endDate);
    return Array.from({ length: n }, (_, i) => {
      const start = addDays(last, (i - n + 1) * 7), end = addDays(start, 6);
      const out = entries.filter((e) => e.type === "out" && e.date >= start && e.date <= end).reduce((s, e) => s + e.amount, 0);
      return { start, end, out };
    }).filter((w) => w.start >= from);
  }
  const WEEK_START = "2026-11-30"; // 주별 기록 시작(월요일)

  // 줄일 수 있는 돈: "꼭 필요하지 않았던" 지출을 분류별로
  function wantsByCat(list) {
    const m = {};
    for (const e of list) if (e.type === "out" && !e.need) m[e.category] = (m[e.category] || 0) + e.amount;
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }

  // 지금 속도로 쓰면 월말까지 예상 지출
  function projection(spent, today, ym) {
    if (ym !== today.slice(0, 7)) return spent;
    const day = parse(today).getDate();
    return Math.round((spent / day) * daysIn(ym));
  }

  // 본격 사용 시작: 2027년. 그 전 기록은 연습으로 보고 2027년 첫 실행 때 정리한다.
  const START = "2027-01-01";
  function splitPractice(entries, budgets) {
    const keep = entries.filter((e) => e.date >= START), old = entries.filter((e) => e.date < START);
    const kb = {}, ob = {};
    for (const [ym, v] of Object.entries(budgets)) (ym >= START.slice(0, 7) ? kb : ob)[ym] = v;
    return { keep, old, keepBudgets: kb, oldBudgets: ob };
  }
  // 월별 그래프에 그릴 달: 2027년부터, 보고 있는 해의 1~12월
  const yearMonths = (ym) => { const y = Math.max(+START.slice(0, 4), +ym.slice(0, 4)); return Array.from({ length: 12 }, (_, i) => `${y}-${pad(i + 1)}`); };

  // 고정 지출·수입: 등록한 달부터(등록일이 그 달 지정일보다 늦으면 다음 달부터) 지정일이 지난 달마다 한 번씩 기록할 것
  // fixed: [{ id, day, since }], posted: { "id|YYYY-MM": true } → [{ f, ym, date }]
  function dueFixed(fixed, posted, today) {
    const out = [];
    for (const f of fixed) {
      let ym = f.since.slice(0, 7);
      if (+f.since.slice(8) > f.day) ym = shiftMonth(ym, 1);
      for (; ; ym = shiftMonth(ym, 1)) {
        const date = `${ym}-${pad(Math.min(f.day, daysIn(ym)))}`; // 31일 지정 → 짧은 달은 말일
        if (date > today) break;
        if (!posted[`${f.id}|${ym}`]) out.push({ f, ym, date });
      }
    }
    return out;
  }

  const api = { dueFixed, pad, parse, fmt, daysIn, shiftMonth, won, inMonth, summary, allowance, ledger, addDays, mondayOf, monthly, weekly, wantsByCat, projection, START, splitPractice, yearMonths, WEEK_START };
  if (typeof module !== "undefined") module.exports = api; else root.FEE = api;
})(this);
