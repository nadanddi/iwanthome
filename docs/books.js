/* 독서감상문(JBNU 독서인증제 보고서) 작성 도우미
 * 도서 목록: data/books.json (매뉴얼의 공개 목록)
 * 감상문: app.js의 상태 S.books.list 에 저장 → 이 기기 localStorage에만 남고, 내보내기/불러오기에 함께 포함
 * 글은 학생 본인이 써요. 이 화면은 분량 확인·체크리스트·복사만 도와요.
 */
(() => {
  "use strict";
  const BG = window.BeltGrad;
  if (!BG) return;
  const { $, esc } = BG;
  const S = () => BG.S;

  const STATUS = { draft: "작성 중", submitted: "제출함", certified: "인증됨" };
  const BELT_STEPS = [["WHITE", 3, "#9aa0ad"], ["YELLOW", 6, "#d4a514"], ["BLUE", 9, "#2f6fdb"], ["RED", 12, "#d64545"]];
  const RULES = { total: 1300, feeling: 300, why: 300, issue: 500 };
  const OASIS = "오아시스 › 학사정보 › 학생상담 › 독서인증제 관리 › 인증신청";
  const CHECKS = [
    { id: "form", t: "독서인증제 보고서(양식2) HWP 파일에 옮겨 적었어요", how: "HWP로 제출해요. 아래 각 칸의 ‘복사’로 붙여넣으면 편해요." },
    { id: "name", t: "파일명을 학번_이름_책제목 으로 바꿨어요", how: "", fileName: true },
    { id: "font", t: "휴먼명조 10pt · 검은색 · 기울임 없음 · 줄간격 160%", how: "붙여넣은 뒤 전체 선택해서 한 번에 맞추세요." },
    { id: "consent", t: "개인정보 동의서 날짜가 신청일 1주 이내예요", how: "", consent: true },
    { id: "own", t: "직접 쓴 글이고, 전에 인증받은 책이 아니에요", how: "표절·대필은 인정되지 않고 같은 책은 다시 인증받을 수 없어요." },
    { id: "apply", t: "오아시스에서 인증신청을 마쳤어요", how: `${OASIS} — 동의서와 감상문 파일을 함께 첨부` },
  ];

  let BOOKS = [], POINTS = { 일반: 15, 챌린지: 20 }, picking = false, query = "", group = "all";

  // ------------------------------------------------------------ state
  function store() {
    const s = S();
    if (!s.books || !Array.isArray(s.books.list)) s.books = { list: [] };
    return s.books;
  }
  const list = () => store().list;
  const cur = () => list().find((r) => r.id === S().ui.book) || null;
  let saveT = 0;
  const saveSoon = () => { clearTimeout(saveT); saveT = setTimeout(BG.save, 300); };
  window.addEventListener("pagehide", () => { clearTimeout(saveT); BG.save(); });

  // 띄어쓰기 포함, 줄바꿈 제외 글자 수
  const count = (s) => [...String(s || "").replace(/\r?\n/g, "")].length;
  const fmt = (n) => Number(n).toLocaleString("ko-KR");
  const ptsOf = (r) => (/챌린지/.test(r.group) ? POINTS.챌린지 : POINTS.일반);

  function measure(r) {
    const sum = count(r.summary), feel = count(r.feeling), why = count(r.why), issue = count(r.issue);
    const parts = [
      { k: "total", ok: sum + feel >= RULES.total && feel >= RULES.feeling },
      { k: "quote", ok: count(r.quote) > 0 && count(r.src) > 0 && why >= RULES.why },
      { k: "issue", ok: issue >= RULES.issue },
    ];
    return { sum, feel, why, issue, total: sum + feel, parts, ok: parts.every((p) => p.ok), chars: sum + feel + why + issue };
  }

  // ------------------------------------------------------------ 요약 카드 + 내 감상문 목록
  function renderList() {
    const L = list();
    const cert = L.filter((r) => r.status === "certified");
    const sub = L.filter((r) => r.status === "submitted").length;
    const next = BELT_STEPS.find(([, n]) => cert.length < n);
    const pts = cert.reduce((a, r) => a + ptsOf(r), 0);
    $("#booksSummary").innerHTML = `
      <div class="big-total"><b>${cert.length}<small style="font-size:16px">권 인증</small></b>
        <span>${sub ? `제출 후 대기 ${sub}권 · ` : ""}독서감상문 포인트 ${fmt(pts)}점</span></div>
      <div class="bk-steps">${BELT_STEPS.map(([b, n, c]) => {
        const done = Math.min(cert.length, n);
        return `<div class="bk-step${cert.length >= n ? " ok" : ""}"><span class="b belt" style="background:${c}">${b}</span><small>누적 ${n}권</small>
          <div class="bar${cert.length >= n ? " good" : ""}"><i style="width:${Math.round((done / n) * 100)}%"></i></div></div>`;
      }).join("")}</div>
      <p class="hint" style="margin-bottom:0">${next ? `${next[0]} 벨트까지 인증 <b>${next[1] - cert.length}권</b> 더 필요해요 (벨트마다 3권씩, 누적 기준).` : "RED 벨트 기준 12권을 모두 채웠어요."}
        권장도서 160선은 권당 ${POINTS.일반}점, 챌린지 도서는 ${POINTS.챌린지}점이에요. 인증되면 상태를 ‘인증됨’으로 바꿔 주세요.</p>`;

    $("#bookList").innerHTML = L.length
      ? L.map((r) => {
        const m = measure(r);
        return `<li class="${r.id === S().ui.book ? "on" : ""}"><button class="bk-item" data-bk-open="${r.id}">
          <span class="bk-title">${esc(r.title)}</span>
          <span class="bk-meta"><span class="pill ${r.status === "certified" ? "ok" : r.status === "submitted" ? "sub" : "no"}">${STATUS[r.status]}</span>
          ${m.ok ? `<span class="b pt">분량 충족</span>` : `<span class="b bk-short">분량 ${fmt(m.chars)}자</span>`}
          <span>${esc(r.group)} · ${new Date(r.updated).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" })} 수정</span></span></button></li>`;
      }).join("")
      : `<li class="empty">아직 감상문이 없어요. ‘새 감상문’으로 책을 골라 시작하세요.</li>`;
  }

  // ------------------------------------------------------------ 책 고르기
  const norm = (s) => String(s).toLowerCase().replace(/[\s·:,.\-()_]/g, "");
  function renderPicker() {
    $("#bookPicker").hidden = !picking;
    if (!picking) return;
    $("#bookGroups").innerHTML = [["all", "전체 160"], ["일반", "권장도서 1~137"], ["챌린지", "챌린지 138~160"]]
      .map(([g, l]) => `<button data-bk-group="${g}" class="${group === g ? "on" : ""}">${l}</button>`).join("");
    const q = norm(query);
    const used = new Set(list().map((r) => r.no));
    const hits = BOOKS.filter((b) => (group === "all" || b.group.startsWith(group)) &&
      (!q || norm(`${b.no} ${b.title} ${b.author} ${b.alias || ""}`).includes(q)));
    $("#bookResults").innerHTML = hits.length
      ? hits.map((b) => `<li><button data-bk-pick="${b.no}" ${used.has(b.no) ? "disabled" : ""}>
          <span class="no">${b.no}</span><span class="bk-body"><b>${esc(b.title)}</b><small>${esc(b.author)}${b.group !== "일반" ? ` · <span class="b req">${b.group} ${POINTS.챌린지}점</span>` : ""}</small></span>
          ${used.has(b.no) ? `<span class="b login">이미 있음</span>` : ""}</button></li>`).join("")
      : `<li class="empty">‘${esc(query)}’에 맞는 권장도서가 없어요. 권장도서 목록에 있는 책만 인증돼요.</li>`;
    $("#bookCount").textContent = `${hits.length}권`;
  }
  function pick(no) {
    const b = BOOKS.find((x) => x.no === no);
    if (!b || list().some((r) => r.no === no)) return;
    const now = new Date().toISOString();
    const r = { id: "r" + Date.now().toString(36), no: b.no, title: b.title, author: b.author, group: b.group, status: "draft",
      summary: "", feeling: "", quote: "", src: "", why: "", issue: "", checks: {}, created: now, updated: now };
    list().push(r); S().ui.book = r.id; picking = false; query = ""; $("#bookSearch").value = "";
    BG.save(); renderAll();
    $("#bookEditor").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // ------------------------------------------------------------ 작성 칸
  const FIELDS = {
    summary: { label: "내용 요약", ph: "책의 줄거리나 핵심 내용을 내 말로 정리해요." },
    feeling: { label: "감상", ph: "읽으면서 느낀 점, 생각이 바뀐 점을 써요. (300자 이상)" },
    quote: { label: "인상 깊은 문장", ph: "책에서 그대로 옮겨 적어요. (분량에 들어가지 않아요)", rows: 3 },
    src: { label: "출판사 · 쪽수", ph: "예: 민음사, 123쪽", input: true },
    why: { label: "그 문장을 고른 이유", ph: "왜 이 문장이 마음에 남았는지 써요. (300자 이상)" },
    issue: { label: "사회 이슈·경험담과 내 의견", ph: "책 내용과 이어지는 사회 이슈나 내 경험을 들고, 내 의견과 평가를 써요. (500자 이상)", rows: 9 },
  };
  const field = (r, k) => {
    const f = FIELDS[k];
    const ctl = f.input
      ? `<input type="text" data-bk-f="${k}" value="${esc(r[k])}" placeholder="${esc(f.ph)}">`
      : `<textarea data-bk-f="${k}" rows="${f.rows || 7}" placeholder="${esc(f.ph)}">${esc(r[k])}</textarea>`;
    return `<label class="bk-field"><span class="row-between"><span class="lb">${f.label}</span><span class="bk-n" data-bk-n="${k}"></span></span>${ctl}</label>`;
  };
  const copyBtn = (what, label = "복사") => `<button type="button" class="ghost bk-copy" data-bk-copy="${what}">${label}</button>`;

  function renderEditor() {
    const r = cur();
    $("#bookEditor").hidden = !r;
    if (!r) return;
    $("#bookEditor").innerHTML = `
      <div class="card">
        <div class="bk-head">
          <div><span class="hint" style="margin:0">${r.no}. ${esc(r.group)} · ${esc(r.author)}</span><h2 style="margin:2px 0 0">${esc(r.title)}</h2></div>
          <button class="ghost" data-bk-del>삭제</button>
        </div>
        <div class="chips bk-status">${Object.entries(STATUS).map(([k, l]) => `<button data-bk-status="${k}" class="${r.status === k ? "on" : ""}">${l}</button>`).join("")}</div>
        <div class="bk-meter" id="bkMeter"></div>
      </div>

      <div class="card">
        <div class="row-between"><h3 class="bk-sec">가. 내용 요약 및 감상</h3>${copyBtn("ga")}</div>
        <p class="hint">요약과 감상을 합쳐 <b>1,300자 이상</b>, 그중 감상은 <b>300자 이상</b> (띄어쓰기 포함).</p>
        ${field(r, "summary")}${field(r, "feeling")}
        <div class="bk-sum" data-bk-n="ga"></div>
      </div>

      <div class="card">
        <div class="row-between"><h3 class="bk-sec">나. 인상 깊은 문장과 그 이유</h3>${copyBtn("na")}</div>
        <p class="hint">문장은 분량에서 빠지고, 출판사·쪽수는 꼭 적어야 해요. 이유는 <b>300자 이상</b>.</p>
        ${field(r, "quote")}${field(r, "src")}${field(r, "why")}
      </div>

      <div class="card">
        <div class="row-between"><h3 class="bk-sec">다. 관련 사회 이슈·경험담과 본인 의견</h3>${copyBtn("da")}</div>
        <p class="hint">책 내용과 관련된 사회 이슈나 경험담을 들고 본인 의견·평가를 <b>500자 이상</b>.</p>
        ${field(r, "issue")}
      </div>

      <div class="card">
        <div class="row-between"><h2>제출 전 체크리스트</h2>${copyBtn("all", "전체 복사")}</div>
        <div id="bkChecks"></div>
      </div>`;
    updateCounts();
  }

  function nTag(n, need, label = "") {
    const ok = n >= need;
    return `<span class="${ok ? "ok" : "no"}">${label}${fmt(n)}${need ? ` / ${fmt(need)}자` : "자"} ${ok ? "✓" : ""}</span>`;
  }
  function updateCounts() {
    const r = cur(); if (!r) return;
    const m = measure(r), ed = $("#bookEditor");
    const set = (k, html) => { const el = $(`[data-bk-n="${k}"]`, ed); if (el) el.innerHTML = html; };
    set("summary", `<span class="muted">${fmt(m.sum)}자</span>`);
    set("feeling", nTag(m.feel, RULES.feeling));
    set("quote", `<span class="muted">분량 제외 · ${fmt(count(r.quote))}자</span>`);
    set("src", count(r.src) ? `<span class="ok">✓</span>` : `<span class="no">필수</span>`);
    set("why", nTag(m.why, RULES.why));
    set("issue", nTag(m.issue, RULES.issue));
    set("ga", `요약 ${fmt(m.sum)} + 감상 ${fmt(m.feel)} = ${nTag(m.total, RULES.total, "합계 ")}
      ${m.total < RULES.total ? `<small>${fmt(RULES.total - m.total)}자 더</small>` : ""}`);
    const rows = [
      ["가. 요약+감상", m.total, RULES.total, m.parts[0].ok, m.feel < RULES.feeling ? `감상 ${fmt(RULES.feeling - m.feel)}자 더` : ""],
      ["나. 이유", m.why, RULES.why, m.parts[1].ok, !count(r.quote) ? "문장 비어 있음" : !count(r.src) ? "출판사·쪽수 필요" : ""],
      ["다. 의견", m.issue, RULES.issue, m.parts[2].ok, ""],
    ];
    $("#bkMeter").innerHTML = rows.map(([l, n, need, ok, extra]) => `<div class="meter"><div class="lbl"><b>${l}</b><span>${fmt(n)} / ${fmt(need)}자${ok ? " ✓" : ""}</span></div>
      <div class="bar${ok ? " good" : ""}"><i style="width:${Math.min(100, Math.round((n / need) * 100))}%"></i></div>${extra ? `<small class="bk-warn">${esc(extra)}</small>` : ""}</div>`).join("");
    renderChecks(r, m);
  }

  function renderChecks(r, m) {
    const d = new Date(), wk = new Date(d.getTime() - 6 * 86400000);
    const ds = (x) => x.toLocaleDateString("ko-KR", { month: "long", day: "numeric" });
    const fname = `학번_이름_${r.title.replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, "")}.hwp`;
    const auto = [
      { t: "가·나·다 분량 기준을 모두 채웠어요", ok: m.ok, how: m.ok ? "" : "위 막대가 모두 초록색이 되면 자동으로 체크돼요." },
      { t: "인상 깊은 문장에 출판사·쪽수를 적었어요", ok: count(r.quote) > 0 && count(r.src) > 0, how: "" },
    ];
    $("#bkChecks").innerHTML =
      auto.map((c) => `<div class="check ${c.ok ? "done" : ""}"><input type="checkbox" disabled ${c.ok ? "checked" : ""}><span class="t">${c.t}<span class="auto">자동</span>${c.how ? `<span class="how">${c.how}</span>` : ""}</span></div>`).join("") +
      CHECKS.map((c) => {
        const how = c.fileName ? `예: <code>${esc(fname)}</code>` : c.consent ? `오늘 신청하면 ${ds(wk)} ~ ${ds(d)} 날짜여야 해요.` : esc(c.how);
        const on = !!(r.checks || {})[c.id];
        return `<label class="check ${on ? "done" : ""}"><input type="checkbox" data-bk-check="${c.id}" ${on ? "checked" : ""}><span class="t">${esc(c.t)}<span class="how">${how}</span></span></label>`;
      }).join("");
  }

  // ------------------------------------------------------------ 복사
  function textOf(r, what) {
    const ga = [r.summary, r.feeling].filter((x) => x.trim()).join("\n\n");
    const na = [r.quote && `“${r.quote.trim()}”${r.src ? ` (${r.src.trim()})` : ""}`, r.why].filter((x) => x && x.trim()).join("\n\n");
    if (what === "ga") return ga;
    if (what === "na") return na;
    if (what === "da") return r.issue;
    return `${r.title} / ${r.author}\n\n가. 내용 요약 및 감상\n${ga}\n\n나. 인상 깊은 문장과 그 이유\n${na}\n\n다. 관련 사회 이슈·경험담과 본인 의견\n${r.issue}`;
  }
  async function copy(text, btn) {
    let ok = false;
    try { await navigator.clipboard.writeText(text); ok = true; } catch (_) {
      const ta = document.createElement("textarea"); ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      try { ok = document.execCommand("copy"); } catch (_) {}
      ta.remove();
    }
    const old = btn.dataset.label || (btn.dataset.label = btn.textContent);
    btn.textContent = ok ? "복사됨 ✓" : "복사 실패"; btn.classList.toggle("on", ok);
    setTimeout(() => { btn.textContent = old; btn.classList.remove("on"); }, 1400);
  }

  // ------------------------------------------------------------ 이벤트
  document.addEventListener("click", (e) => {
    const t = e.target;
    if (!t.closest || !t.closest('[data-panel="books"]')) return;
    let el;
    if (t.closest("#bookNew")) { picking = !picking; renderPicker(); if (picking) $("#bookSearch").focus(); return; }
    if ((el = t.closest("[data-bk-group]"))) { group = el.dataset.bkGroup; renderPicker(); return; }
    if ((el = t.closest("[data-bk-pick]"))) { pick(Number(el.dataset.bkPick)); return; }
    if ((el = t.closest("[data-bk-open]"))) {
      S().ui.book = S().ui.book === el.dataset.bkOpen ? null : el.dataset.bkOpen; picking = false; BG.save(); renderAll();
      if (S().ui.book) $("#bookEditor").scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    const r = cur(); if (!r) return;
    if ((el = t.closest("[data-bk-status]"))) { r.status = el.dataset.bkStatus; r.updated = new Date().toISOString(); BG.save(); renderList(); renderEditor(); return; }
    if ((el = t.closest("[data-bk-copy]"))) { copy(textOf(r, el.dataset.bkCopy), el); return; }
    if (t.closest("[data-bk-del]")) {
      if (!confirm(`‘${r.title}’ 감상문을 지울까요? 이 기기에서 지우면 되돌릴 수 없어요.`)) return;
      store().list = list().filter((x) => x.id !== r.id); S().ui.book = null; BG.save(); renderAll();
    }
  });
  document.addEventListener("input", (e) => {
    const t = e.target;
    if (t.id === "bookSearch") { query = t.value; renderPicker(); return; }
    const r = cur(); if (!r) return;
    if (t.dataset.bkF) { r[t.dataset.bkF] = t.value; r.updated = new Date().toISOString(); saveSoon(); updateCounts(); }
  });
  document.addEventListener("change", (e) => {
    const t = e.target, r = cur();
    if (r && t.dataset.bkCheck) { r.checks = r.checks || {}; r.checks[t.dataset.bkCheck] = t.checked; BG.save(); updateCounts(); }
    if (r && t.dataset.bkF) renderList();
  });

  // ------------------------------------------------------------ boot
  function renderAll() { store(); renderList(); renderPicker(); renderEditor(); }
  BG.hooks.push(renderAll);
  fetch("data/books.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : Promise.reject(new Error("books.json"))))
    .then((d) => {
      BOOKS = d.books; POINTS = d.points || POINTS;
      $("#booksSource").href = d.sourceUrl; $("#oasisPath").textContent = OASIS;
      renderAll();
    })
    .catch((err) => { $("#bookList").innerHTML = `<li class="empty">도서 목록을 불러오지 못했어요: ${esc(err.message)}</li>`; });
})();
