// 엑셀 파일(.xlsx)을 DB처럼 쓴다.
// - 앱은 브라우저 저장소(localStorage)에서 바로 읽고 쓰고, 바뀔 때마다 연결된 엑셀 파일에 통째로 다시 저장한다.
// - "_data" 시트: 앱 데이터 원본(키·JSON). 다른 기기에서 이 파일을 불러오면 그대로 복원된다.
// - 나머지 시트: 사람이 엑셀로 보기 좋게 만든 표(앱이 sheets()로 넘겨줌). 엑셀에서 고쳐도 앱에는 반영되지 않는다.
// - 파일에 바로 저장하는 기능(File System Access)은 PC의 Chrome·Edge만 된다. 그 밖에서는 내보내기·불러오기로 동작한다.
import { onSave } from "./db.js";

const XLSX_URL = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
let xlsxReady = null;
const loadXLSX = () => (xlsxReady ??= new Promise((ok, fail) => {
  const s = document.createElement("script");
  s.src = XLSX_URL; s.onload = () => ok(window.XLSX); s.onerror = () => fail(new Error("엑셀 라이브러리를 불러오지 못했어요(인터넷 연결 확인)"));
  document.head.appendChild(s);
}));

// 파일 핸들은 IndexedDB에 보관(다음에 열어도 같은 파일로 저장)
function idb(mode, fn) {
  return new Promise((ok, fail) => {
    const r = indexedDB.open("excel-db", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("h");
    r.onerror = () => fail(r.error);
    r.onsuccess = () => { const q = fn(r.result.transaction("h", mode).objectStore("h")); q.onsuccess = () => ok(q.result); q.onerror = () => fail(q.error); };
  });
}

const canFile = "showSaveFilePicker" in window;
const stamp = () => new Date().toTimeString().slice(0, 5);

export function initExcel({ prefix, appName, sheets, el }) {
  let handle = null, timer = null, state = "off", last = "";
  const keys = () => Object.keys(localStorage).filter((k) => k.startsWith(`${prefix}.`) && !k.endsWith(".session"));

  async function build() {
    const X = await loadXLSX();
    const wb = X.utils.book_new();
    for (const [name, rows] of Object.entries(sheets())) {
      X.utils.book_append_sheet(wb, rows.length ? X.utils.json_to_sheet(rows) : X.utils.aoa_to_sheet([["(비어 있음)"]]), name.slice(0, 31));
    }
    X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([["key", "json"], ...keys().map((k) => [k, localStorage.getItem(k)])]), "_data");
    return new Blob([X.write(wb, { bookType: "xlsx", type: "array" })], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  }

  async function writeNow() {
    if (!handle) return;
    try {
      const w = await handle.createWritable(); await w.write(await build()); await w.close();
      state = "on"; last = stamp();
    } catch (e) { state = "error"; console.warn(e); }
    paint();
  }
  const schedule = () => { if (handle && state !== "need") { clearTimeout(timer); state = "saving"; paint(); timer = setTimeout(writeNow, 800); } };
  onSave(schedule);

  // 파일에서 불러오기: _data 시트의 키를 그대로 브라우저 저장소에 넣고 새로고침
  async function restore(file) {
    const X = await loadXLSX();
    const wb = X.read(await file.arrayBuffer(), { type: "array" });
    const ws = wb.Sheets._data;
    if (!ws) throw new Error(`"_data" 시트가 없어요. ${appName}에서 만든 엑셀 파일인지 확인해 주세요.`);
    const rows = X.utils.sheet_to_json(ws, { header: 1 }).slice(1).filter((r) => String(r[0] || "").startsWith(`${prefix}.`));
    if (!rows.length) throw new Error(`${appName} 기록이 들어 있지 않은 파일이에요.`);
    if (!confirm(`엑셀 파일의 기록(${rows.length}개 항목)으로 지금 기록을 바꿀까요? 지금 브라우저의 기록은 파일 내용으로 덮어써져요.`)) return false;
    keys().forEach((k) => localStorage.removeItem(k));
    rows.forEach(([k, v]) => localStorage.setItem(k, v));
    return true;
  }

  async function connectNew() {
    handle = await window.showSaveFilePicker({ suggestedName: `${appName}-DB.xlsx`, types: [{ description: "엑셀 파일", accept: { "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"] } }] });
    await idb("readwrite", (s) => s.put(handle, prefix));
    await writeNow();
  }
  async function connectExisting() {
    const [h] = await window.showOpenFilePicker({ types: [{ description: "엑셀 파일", accept: { "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"] } }] });
    if (await h.requestPermission({ mode: "readwrite" }) !== "granted") return;
    if (await restore(await h.getFile()) === false) return;
    await idb("readwrite", (s) => s.put(h, prefix));
    location.reload();
  }
  async function reconnect() {
    if (await handle.requestPermission({ mode: "readwrite" }) === "granted") { state = "on"; await writeNow(); }
  }
  async function disconnect() {
    if (!confirm("엑셀 파일 연결을 끊을까요? 파일은 그대로 남고, 앞으로 자동 저장만 멈춰요.")) return;
    handle = null; state = "off"; await idb("readwrite", (s) => s.delete(prefix)); paint();
  }
  async function exportFile() {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(await build());
    a.download = `${appName}-DB-${new Date().toISOString().slice(0, 10)}.xlsx`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function importFile() {
    const inp = Object.assign(document.createElement("input"), { type: "file", accept: ".xlsx" });
    inp.onchange = async () => { try { if (await restore(inp.files[0])) location.reload(); } catch (e) { alert(e.message); } };
    inp.click();
  }

  // 헤더의 상태 버튼 + 누르면 뜨는 메뉴
  const run = (fn) => async () => { menu.hidden = true; try { await fn(); } catch (e) { if (e.name !== "AbortError") alert("엑셀 작업에 실패했어요: " + e.message); } paint(); };
  el.innerHTML = `<button type="button" class="xl-btn" aria-haspopup="true"></button><div class="xl-menu" hidden></div>`;
  const btn = el.firstElementChild, menu = el.lastElementChild;
  btn.onclick = () => { menu.hidden = !menu.hidden; paint(); };
  addEventListener("click", (e) => { if (!el.contains(e.target)) menu.hidden = true; });

  function paint() {
    btn.textContent = { off: "📗 엑셀 DB 연결", on: `📗 엑셀 저장됨 ${last}`, saving: "📗 저장 중…", need: "📗 엑셀 다시 연결", error: "⚠️ 엑셀 저장 실패" }[state];
    btn.dataset.state = state;
    const item = (label, fn, cls = "") => { const b = document.createElement("button"); b.type = "button"; b.className = cls; b.textContent = label; b.onclick = run(fn); return b; };
    menu.replaceChildren(...(canFile
      ? handle
        ? [state === "need" || state === "error" ? item("🔗 이 파일 다시 연결(권한 허용)", reconnect, "primary") : item("💾 지금 엑셀에 저장", writeNow), item("📤 엑셀 사본 내보내기", exportFile), item("✂️ 연결 끊기", disconnect)]
        : [item("📗 새 엑셀 파일 만들어 연결", connectNew, "primary"), item("📂 기존 엑셀 파일 열어 연결", connectExisting), item("📤 엑셀로 내보내기만", exportFile)]
      : [item("📤 엑셀로 내보내기", exportFile, "primary"), item("📂 엑셀에서 불러오기", importFile)]));
    if (!canFile) { const p = document.createElement("p"); p.textContent = "이 브라우저는 파일에 바로 저장할 수 없어서 내보내기·불러오기로 써요(PC의 Chrome·Edge는 자동 저장 가능)."; menu.append(p); }
  }

  // 시작할 때: 예전에 연결한 파일이 있으면 권한 확인(이미 허용이면 바로 자동 저장, 아니면 "다시 연결" 표시)
  (async () => {
    if (canFile) {
      try {
        handle = (await idb("readonly", (s) => s.get(prefix))) || null;
        if (handle) state = (await handle.queryPermission({ mode: "readwrite" })) === "granted" ? "on" : "need";
      } catch { handle = null; }
    }
    paint();
  })();
}
