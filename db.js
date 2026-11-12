// 저장소: firebase-config.js에 값이 있으면 Google 로그인 + Firestore, 없으면 브라우저 저장소.
import { firebaseConfig } from "./firebase-config.js";

const local = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
let remote = null;
export const cloud = Boolean(firebaseConfig.apiKey);

// onUser(user): 로그인 시 user, 로그아웃 상태면 null. cloud가 아니면 즉시 onUser({ local: true })
export async function start(onUser, btn) {
  if (!cloud) return onUser({ local: true });
  const base = "https://www.gstatic.com/firebasejs/10.12.2/";
  const [{ initializeApp }, A, F] = await Promise.all(
    ["firebase-app.js", "firebase-auth.js", "firebase-firestore.js"].map((f) => import(base + f)));
  const app = initializeApp(firebaseConfig);
  const auth = A.getAuth(app), db = F.getFirestore(app);
  btn.hidden = false;
  btn.onclick = () => (auth.currentUser ? A.signOut(auth) : A.signInWithPopup(auth, new A.GoogleAuthProvider()).catch((e) => alert("로그인 실패: " + e.message)));
  A.onAuthStateChanged(auth, (u) => {
    btn.textContent = u ? `로그아웃 · ${u.displayName || u.email}` : "Google 로그인";
    remote = u ? { F, ref: (k) => F.doc(db, "users", u.uid, "data", k) } : null;
    onUser(u);
  });
}

// shortcut: 키 하나 = 문서 하나(최대 1MB), 가계부 내역이 수천 건을 넘으면 컬렉션으로 분리
export async function load(k, d) {
  if (!remote) return local.get(k, d);
  const s = await remote.F.getDoc(remote.ref(k));
  return s.exists() ? s.data().v : local.get(k, d); // 첫 로그인 때 브라우저에 있던 기록을 이어받음
}

export async function save(k, v) {
  local.set(k, v); // 오프라인·장애 대비 사본
  if (!remote) return;
  try { await remote.F.setDoc(remote.ref(k), { v }); }
  catch (e) { alert("클라우드 저장 실패(이 브라우저에는 저장됨): " + e.message); }
}
