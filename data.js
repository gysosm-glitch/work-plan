// 고정 일정·시험 데이터. 일정이 바뀌면 이 파일만 고치면 된다.
// day: 0=일 1=월 2=화 3=수 4=목 5=금 6=토
window.SCHEDULE = {
  // shortcut: 개강/종강일은 추정값, 학사일정 확정되면 수정
  semester: { start: "2026-09-01", end: "2026-12-18" },
  skip: [], // 휴강 등 고정 일정을 건너뛸 날짜 ["2026-11-20"]
  weekly: [
    { day: 1, start: "08:00", end: "09:00", title: "주간 회의", type: "meeting" },
    // shortcut: 종료 시간 미기재 → 3시간으로 가정
    { day: 1, start: "13:00", end: "16:00", title: "데이터분석프로그래밍", type: "class" },
    { day: 2, start: "10:00", end: "13:00", title: "프로젝트 관리", type: "class" },
    { day: 2, start: "14:00", end: "17:00", title: "공부에 대한 공부", type: "class" },
    { day: 2, start: "17:00", end: "18:00", title: "동아리 활동", type: "club" },
    { day: 2, start: "19:00", end: "21:00", title: "AX 프로젝트 회의", type: "meeting" },
    { day: 3, start: "18:00", end: "23:00", title: "아르바이트", type: "work" },
    { day: 4, start: "10:00", end: "13:00", title: "특강 한국사", type: "class" },
    { day: 4, start: "14:00", end: "17:00", title: "고급 비즈니스 프로그래밍", type: "class" },
    { day: 4, start: "19:00", end: "20:00", title: "AX 스터디", type: "meeting" },
    { day: 5, start: "13:00", end: "17:00", title: "AX 프로젝트 현장 방문", type: "field" },
    { day: 6, start: "18:00", end: "23:00", title: "아르바이트", type: "work" },
  ],
  // noMidterm: 중간고사가 없어 범위가 넓은 과목 → 준비를 더 일찍 시작
  exams: [
    { course: "데이터분석프로그래밍", kind: "기말고사", date: "2026-11-30", noMidterm: true },
    { course: "데이터분석프로그래밍", kind: "기말 발표", date: "2026-12-14" },
    { course: "프로젝트 관리", kind: "기말고사", date: "2026-12-08" },
    { course: "공부에 대한 공부", kind: "기말고사", date: "2026-12-08", noMidterm: true },
    { course: "고급 비즈니스 프로그래밍", kind: "기말 발표", date: "2026-12-10", alt: "2026-12-17" },
    { course: "특강 한국사", kind: "기말고사", date: "2026-12-17" },
  ],
  events: [], // 단발성 일정(자격증 시험 등): { date, start, end, title, type: "cert" }
};
