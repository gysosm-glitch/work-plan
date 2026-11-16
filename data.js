// 기본 일정 데이터(앱의 ⚙️ 일정 편집에서 바꾸면 그쪽이 우선). 학교·회사 어디서나 같은 구조로 쓴다.
// day: 0=일 1=월 2=화 3=수 4=목 5=금 6=토
window.SCHEDULE = {
  // 기간: 시작일이 있는 주가 1주차. 이 기간에만 매주 반복 일정이 나온다. shortcut: 2026-2학기 날짜는 추정값
  semester: { start: "2026-09-01", end: "2026-12-18" },
  skip: [], // 쉬는 날: 반복 일정을 건너뛸 날짜 ["2026-11-20"]
  weekly: [
    { day: 1, start: "08:00", end: "09:00", title: "주간 회의", type: "meeting" },
    // shortcut: 종료 시간 미기재 → 3시간으로 가정
    { day: 1, start: "13:00", end: "16:00", title: "데이터분석프로그래밍", type: "class" },
    { day: 2, start: "10:00", end: "13:00", title: "프로젝트 관리", type: "class" },
    { day: 2, start: "14:00", end: "17:00", title: "공부에 대한 공부", type: "class" },
    { day: 2, start: "17:00", end: "18:00", title: "동아리 활동", type: "club", until: "2026-12-06" },
    { day: 2, start: "19:00", end: "21:00", title: "AX 프로젝트 회의", type: "meeting", until: "2026-12-06" },
    { day: 3, start: "18:00", end: "23:00", title: "아르바이트", type: "work" },
    { day: 4, start: "10:00", end: "13:00", title: "특강 한국사", type: "class" },
    { day: 4, start: "14:00", end: "17:00", title: "고급 비즈니스 프로그래밍", type: "class" },
    { day: 4, start: "19:00", end: "20:00", title: "AX 스터디", type: "meeting", until: "2026-12-06" },
    { day: 5, start: "13:00", end: "17:00", title: "AX 프로젝트 현장 방문", type: "field", until: "2026-12-06" },
    { day: 6, start: "18:00", end: "23:00", title: "아르바이트", type: "work" },
  ],
  // 마감·시험(D-day). 학습 탭 진도 칸은 from(진도 시작 주차)부터 마감 전 주까지. from이 없으면 noMidterm ? 1 : 9
  exams: [
    { course: "데이터분석프로그래밍", kind: "기말고사", date: "2026-11-30", noMidterm: true },
    { course: "데이터분석프로그래밍", kind: "기말 발표", date: "2026-12-14" },
    { course: "프로젝트 관리", kind: "기말고사", date: "2026-12-08" },
    { course: "공부에 대한 공부", kind: "기말고사", date: "2026-12-08", noMidterm: true },
    { course: "특강 한국사", kind: "기말고사", date: "2026-12-17" },
  ],
  events: [], // 한 번만 있는 일정: { date, start, end, title, type }
};
