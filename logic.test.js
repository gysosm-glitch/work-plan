// 실행: node logic.test.js
const assert = require("assert");
global.window = {};
require("./data.js");
const W = require("./logic.js");
const D = window.SCHEDULE;

assert.strictEqual(W.dday("2026-11-12", "2026-11-30"), 18);
assert.strictEqual(W.addDays("2026-11-30", 1), "2026-12-01");
// 2026-11-17은 화요일: 수업 2 + 동아리 + 회의 = 3+3+1+2
assert.strictEqual(W.busyHours(W.itemsForDate(D, "2026-11-17")), 9);
assert.strictEqual(W.itemsForDate(D, "2026-11-15").length, 0); // 일요일
assert.strictEqual(W.itemsForDate(D, "2026-12-21").length, 0); // 종강 후

// 주차: 개강 주 월요일(8/31)부터 1주차
assert.strictEqual(W.weekOf(D, "2026-08-31"), 1);
assert.strictEqual(W.weekOf(D, "2026-11-12"), 11);
assert.strictEqual(W.weekOf(D, "2026-11-30"), 14);

const C = W.courses(D, "2026-11-12");
const dap = C.find((c) => c.course === "데이터분석프로그래밍");
assert.deepStrictEqual([dap.startWeek, dap.lastWeek, dap.deadline], [1, 13, "2026-11-30"]); // 중간 없음 → 1주차부터
const pm = C.find((c) => c.course === "프로젝트 관리");
assert.deepStrictEqual([pm.startWeek, pm.lastWeek], [9, 14]); // 중간 봄 → 9주차부터
// 11/30 기말이 지나면 다음 마감(12/14 발표) 기준으로 바뀜
assert.strictEqual(W.courses(D, "2026-12-01").find((c) => c.course === "데이터분석프로그래밍").deadline, "2026-12-14");

// 빈 시간: 화요일은 09~10, 13~14(수업 사이), 21~23
assert.deepStrictEqual(W.freeSlots(W.itemsForDate(D, "2026-11-17")), [[540, 600], [780, 840], [1260, 1380]]);

// 주간 자동 배분
const week = W.mondayOf("2026-11-12");
const { blocks } = W.planWeek(D, [], {}, {}, week, "2026-11-12");
assert.ok(blocks.length > 0);
for (const b of blocks) {
  assert.ok(b.date >= "2026-11-12", "지난 날에는 배분하지 않음");
  const busy = W.itemsForDate(D, b.date).map((i) => [W.toMin(i.start), W.toMin(i.end)]);
  const s = W.toMin(b.start), e = W.toMin(b.end);
  assert.ok(busy.every(([a, z]) => e <= a || s >= z), `고정 일정과 겹치지 않음: ${b.date} ${b.start}`);
  assert.ok(s >= 540 && e <= 1380);
}
const perDay = {};
blocks.forEach((b) => (perDay[b.date] = (perDay[b.date] || 0) + 1));
assert.ok(Object.values(perDay).every((n) => n <= W.CAP));
// 완료한 주차는 다시 배분하지 않음
const done = { 데이터분석프로그래밍: Array.from({ length: 13 }, (_, i) => i + 1) };
assert.ok(W.planWeek(D, [], done, {}, week, "2026-11-12").blocks.every((b) => b.course !== "데이터분석프로그래밍"));
// 오늘은 지금 시각 이후에만 배분
assert.ok(W.planWeek(D, [], {}, {}, week, "2026-11-12", 20 * 60).blocks.filter((b) => b.date === "2026-11-12").every((b) => b.start >= "20:00"));
console.log("ok");
