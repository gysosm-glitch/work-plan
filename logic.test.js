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

console.log("ok");
