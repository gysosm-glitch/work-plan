// 로그인(앱 잠금). 서버가 없어서 계정은 이 브라우저(와 연결한 엑셀 파일)에 저장된다.
// 비밀번호는 그대로 두지 않고 salt + SHA-256 해시로만 보관한다.
// shortcut: 기기 안에서만 확인하는 잠금이라 남이 화면을 여는 것을 막는 수준. 진짜 보안이 필요하면 서버 로그인으로 바꿔야 함.
import { load, save } from "./db.js";

const enc = (s) => new TextEncoder().encode(s);
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const hash = async (salt, pw) => hex(await crypto.subtle.digest("SHA-256", enc(`${salt}:${pw}`)));

// 로그인될 때까지 기다린다. 로그인 유지(체크)면 다음에 바로 통과, 아니면 브라우저를 닫을 때까지 유지.
export async function requireLogin(prefix, appName) {
  const sKey = `${prefix}.session`;
  const acc = load(`${prefix}.account`, null);
  if (acc && (sessionStorage.getItem(sKey) === acc.hash || localStorage.getItem(sKey) === acc.hash)) return acc.id;

  return new Promise((done) => {
    const box = document.createElement("div");
    box.className = "lock";
    box.innerHTML = `<form class="lock-card" autocomplete="on">
      <h1>${appName}</h1>
      <p class="lock-sub">${acc ? "로그인해 주세요" : "처음 오셨네요! 이 앱에서 쓸 아이디와 비밀번호를 만들어 주세요"}</p>
      <label>아이디 <input name="id" required maxlength="30" autocomplete="username" value="${acc ? acc.id.replace(/"/g, "&quot;") : ""}"></label>
      <label>비밀번호 <input name="pw" type="password" required minlength="4" maxlength="64" autocomplete="${acc ? "current-password" : "new-password"}"></label>
      ${acc ? "" : `<label>비밀번호 확인 <input name="pw2" type="password" required minlength="4" maxlength="64" autocomplete="new-password"></label>`}
      <label class="lock-keep"><input type="checkbox" name="keep" checked> 이 기기에서 로그인 유지</label>
      <p class="lock-err" role="alert"></p>
      <button class="lock-go">${acc ? "로그인" : "계정 만들고 시작하기"}</button>
      ${acc ? `<button type="button" class="lock-forgot">비밀번호를 잊었어요</button>` : ""}
      <p class="lock-note">🔒 계정은 이 기기(와 연결한 엑셀 파일)에만 저장돼요.</p>
    </form>`;
    document.body.appendChild(box);
    const f = box.querySelector("form"), err = box.querySelector(".lock-err");
    f.elements[acc ? "pw" : "id"].focus();

    f.onsubmit = async (e) => {
      e.preventDefault();
      const id = f.elements.id.value.trim(), pw = f.elements.pw.value;
      let a = acc;
      if (!a) {
        if (pw !== f.elements.pw2.value) return (err.textContent = "비밀번호 두 개가 서로 달라요.");
        const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
        a = { id, salt, hash: await hash(salt, pw) };
        save(`${prefix}.account`, a);
      } else if (id !== a.id || (await hash(a.salt, pw)) !== a.hash) {
        f.elements.pw.value = "";
        return (err.textContent = "아이디 또는 비밀번호가 맞지 않아요.");
      }
      sessionStorage.setItem(sKey, a.hash);
      if (f.elements.keep.checked) localStorage.setItem(sKey, a.hash); else localStorage.removeItem(sKey);
      box.remove();
      done(a.id);
    };
    box.querySelector(".lock-forgot")?.addEventListener("click", () => {
      if (!confirm("계정(아이디·비밀번호)만 지우고 새로 만들까요? 기록은 그대로 남아요.")) return;
      localStorage.removeItem(`${prefix}.account`); localStorage.removeItem(sKey); sessionStorage.removeItem(sKey);
      location.reload();
    });
  });
}

export function logout(prefix) {
  localStorage.removeItem(`${prefix}.session`);
  sessionStorage.removeItem(`${prefix}.session`);
  location.reload();
}
