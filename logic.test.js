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
assert.strictEqual(W.prepStart(D.exams[0]), "2026-11-09"); // 중간 없음 → 21일 전
assert.strictEqual(W.freeDays(D, "2026-11-12", 7)[0].date, "2026-11-15"); // 일요일이 가장 한가
console.log("ok");
