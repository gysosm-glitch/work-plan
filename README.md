# Work Plan

학기 시간표, 시험, 자격증, 고정 일정을 한 화면에서 관리하는 일정 대시보드.

- 고정 시간표, 시험 날짜, 종강일 수정: `data.js`
- 단발성 일정(자격증 시험 등)과 시험 진도: 화면에서 입력
- 로직 테스트: `node logic.test.js`

## Firebase 연결 (로그인 + 클라우드 저장)

설정 전에는 로그인 없이 이 브라우저에만 저장된다. 연결하면 처음 로그인할 때 브라우저에 있던 기록을 그대로 이어받는다.
work-plan과 FEE는 **같은 Firebase 프로젝트 하나**를 같이 써도 된다.

1. https://console.firebase.google.com 에서 프로젝트를 만든다. (Analytics는 꺼도 된다)
2. 빌드 > Authentication > 시작하기 > 로그인 방법에서 **Google**을 사용 설정한다.
3. 빌드 > Firestore Database > 데이터베이스 만들기(프로덕션 모드)를 진행한 뒤, 규칙 탭에 `firestore.rules` 내용을 붙여넣고 게시한다.
4. 프로젝트 설정 > 내 앱 > 웹 앱 추가에서 나온 `firebaseConfig` 값을 `firebase-config.js`에 붙여넣는다.
5. Vercel 배포 뒤에는 Authentication > 설정 > **승인된 도메인**에 `xxx.vercel.app` 주소를 추가한다.

## Vercel 배포

빌드 과정이 없는 정적 사이트다. Vercel에서 이 저장소를 Import하고, Framework는 **Other**로 둔 채 그대로 Deploy하면 된다.

## 로컬 실행

```bash
python -m http.server 5501
```
