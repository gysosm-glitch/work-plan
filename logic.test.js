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

// until: 12/6까지만 반복 → 12/8(화)엔 동아리·AX 회의 없음, 12/1(화)엔 있음
assert.ok(!W.itemsForDate(D, "2026-12-08").some((i) => /AX|동아리/.test(i.title)));
assert.ok(W.itemsForDate(D, "2026-12-01").some((i) => i.title === "동아리 활동"));
// 진도 시작 주차(from)가 있으면 그 주차부터
assert.strictEqual(W.courses({ ...D, exams: [{ course: "X", kind: "마감", date: "2026-12-10", from: 5 }] }, "2026-11-12")[0].startWeek, 5);
// 같은 이름 마감이 여러 개면 가장 이른 시작 주차
assert.strictEqual(W.courses({ ...D, exams: [{ course: "Y", kind: "기말", date: "2026-11-30", from: 1 }, { course: "Y", kind: "발표", date: "2026-12-14", from: 9 }] }, "2026-11-12")[0].startWeek, 1);
// 주간 목표: 범위 + 회독
assert.deepStrictEqual(W.parseGoal("6~7, 9~10주차 1회독 완료(8주차 제외)"), { units: [6, 7, 9, 10], round: 1 });
assert.deepStrictEqual(W.parseGoal("CH 1~3 1회독: 목차 스캔"), { units: [1, 2, 3], round: 1 });
assert.deepStrictEqual(W.parseGoal("13주차 신규 수업 당일 1~2회독(이론+실습)"), { units: [13], round: 2 });
assert.deepStrictEqual(W.parseGoal("헬스 3번"), {}); // 회독 없음 → 직접 체크
// 기말 계획은 전부 과목 줄임말이 맞아야 한다
for (const t of window.STUDY_PLAN.items) for (const ab of t.match(/\[([^\]]+)\]/)[1].split("/")) assert.ok(window.STUDY_PLAN.subjects[ab], t);
console.log("ok");
