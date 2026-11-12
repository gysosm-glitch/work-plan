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

const pad = (n) => String(n).padStart(2, "0");
const localDate = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

// 백업 파일(JSON)을 내려받고, 이번 달에 백업했다고 기록한다
export function downloadBackup(prefix, data) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
  a.download = `${prefix}-backup-${localDate()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  save(`${prefix}.lastBackup`, localDate().slice(0, 7));
}

// 한 달에 한 번 백업 알림: 기록이 있는데 이번 달에 아직 백업하지 않았으면 #backupBar를 띄운다.
// 브라우저는 사용자 동작 없이 파일을 저장할 수 없어서 알림 + 한 번 누르기로 처리한다.
export function backupReminder(prefix, hasData, onBackup) {
  const el = document.getElementById("backupBar");
  el.hidden = !hasData || load(`${prefix}.lastBackup`, "") === localDate().slice(0, 7);
  el.querySelector(".now").onclick = () => { onBackup(); el.hidden = true; };
  el.querySelector(".later").onclick = () => { el.hidden = true; };
}
