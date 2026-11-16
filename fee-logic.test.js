// 실행: node fee-logic.test.js
const assert = require("assert");
const F = require("./fee-logic.js");

const E = [
  { id: 1, date: "2026-11-13", type: "out", amount: 5000, category: "식비", need: true },
  { id: 2, date: "2026-11-13", type: "out", amount: 4500, category: "카페·간식", need: false },
  { id: 3, date: "2026-11-14", type: "in", amount: 300000, category: "아르바이트" },
  { id: 4, date: "2026-12-01", type: "out", amount: 1000, category: "교통", need: true },
];
const nov = F.inMonth(E, "2026-11");
const s = F.summary(nov);
assert.deepStrictEqual([s.out, s.inc, s.wants], [9500, 300000, 4500]);
assert.strictEqual(s.byDay["2026-11-13"], 9500);
assert.strictEqual(F.daysIn("2026-11"), 30);
assert.strictEqual(F.shiftMonth("2026-12", 1), "2027-01");
// 11/13 포함 18일 남음: (100000-9500)/18 = 5027
assert.strictEqual(F.allowance(100000, 9500, "2026-11-13", "2026-11"), 5027);
assert.strictEqual(F.allowance(100000, 0, "2026-11-13", "2026-10"), 0);
assert.strictEqual(F.allowance(31000, 0, "2026-11-13", "2026-12"), 1000);
assert.deepStrictEqual(F.ledger(nov, 100000).map((e) => e.bal), [95000, 90500, 90500]);
// 월별·주별 합계
const m = F.monthly(E, "2026-12", 3);
assert.deepStrictEqual(m.map((x) => [x.ym, x.out, x.inc]), [["2026-10", 0, 0], ["2026-11", 9500, 300000], ["2026-12", 1000, 0]]);
const w = F.weekly(E, "2026-11-13", 2); // 11/13(금) → 11/9 주
assert.deepStrictEqual(w.map((x) => [x.start, x.out]), [["2026-11-02", 0], ["2026-11-09", 9500]]);
assert.deepStrictEqual(F.wantsByCat(nov), [["카페·간식", 4500]]);
assert.strictEqual(F.projection(9000, "2026-11-10", "2026-11"), 27000); // 하루 900원 × 30일
// 주별은 12월 첫 주(11/30 월)부터: 12/9 기준 최근 8주 중 11/30, 12/7만
assert.deepStrictEqual(F.weekly(E, "2026-12-09", 8, F.WEEK_START).map((x) => x.start), ["2026-11-30", "2026-12-07"]);
assert.strictEqual(F.weekly(E, "2026-11-13", 8, F.WEEK_START).length, 0);
// 2026년 연습 기록 분리
const sp = F.splitPractice([...E, { id: 9, date: "2027-01-02", type: "out", amount: 3000, category: "식비", need: true }], { "2026-11": 400000, "2027-01": 500000 });
assert.deepStrictEqual([sp.old.length, sp.keep.length, Object.keys(sp.oldBudgets), Object.keys(sp.keepBudgets)], [4, 1, ["2026-11"], ["2027-01"]]);
assert.deepStrictEqual([F.yearMonths("2026-11")[0], F.yearMonths("2026-11")[11], F.yearMonths("2028-03")[0]], ["2027-01", "2027-12", "2028-01"]);
// 고정 지출: 11/20 등록·매달 5일 → 11월은 이미 지나서 12/5부터, 1/5까지 두 번
const fx = [{ id: "a", day: 5, since: "2026-11-20" }];
assert.deepStrictEqual(F.dueFixed(fx, {}, "2027-01-10").map((x) => x.date), ["2026-12-05", "2027-01-05"]);
assert.deepStrictEqual(F.dueFixed(fx, { "a|2026-12": true }, "2027-01-10").map((x) => x.date), ["2027-01-05"]); // 이미 기록한 달은 건너뜀
assert.deepStrictEqual(F.dueFixed([{ id: "b", day: 31, since: "2026-11-01" }], {}, "2026-11-30").map((x) => x.date), ["2026-11-30"]); // 말일 보정
assert.strictEqual(F.dueFixed(fx, {}, "2026-12-04").length, 0); // 아직 지정일 전
console.log("ok");
