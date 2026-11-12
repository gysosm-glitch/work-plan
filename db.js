// DB 없이 이 브라우저(localStorage)에 저장한다. 같은 기기·같은 브라우저에서는 계속 유지된다.
// shortcut: 기기 간 동기화 없음, 폰과 PC를 같이 쓰게 되면 Firebase 같은 DB로 교체
navigator.storage?.persist?.(); // 저장 공간이 부족해도 브라우저가 임의로 지우지 않도록 요청

export function load(k, d) {
  try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; }
}

export function save(k, v) {
  try { localStorage.setItem(k, JSON.stringify(v)); }
  catch (e) { alert("저장하지 못했어요(시크릿 모드이거나 저장 공간이 꺼져 있을 수 있어요): " + e.message); }
}
