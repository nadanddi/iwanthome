/* 벨트를 따자 졸업을 하자 — 정적 대시보드
 * 데이터: data/belts.json, data/graduation.json, data/notices.json
 * 내 입력값: 이 기기 localStorage (내보내기/불러오기로 다른 기기와 맞춤)
 */
(() => {
  "use strict";
  const KEY = "beltgrad:v1";
  const MY_BELTS = ["BLUE", "RED", "ORANGE", "BLACK"];
  const BELT_COLORS = { WHITE: "#9aa0ad", YELLOW: "#d4a514", ORANGE: "#e8862a", BLUE: "#2f6fdb", RED: "#d64545", BLACK: "#1f1f24" };
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // ------------------------------------------------------------ state
  const blank = () => ({
    my: { points: null, gpa: null, toeic: null, violence: false, held: {} },
    belt: { items: {}, elective: {}, beltPts: {} },
    grad: { done: {}, req: {}, checks: {} },
    notices: { mark: {}, lastVisit: null },
    ui: { tab: "home", belt: null, filter: "mine" },
  });
  let S = blank();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) S = deepMerge(blank(), JSON.parse(raw));
  } catch (_) { /* 저장소를 못 쓰는 환경이면 기본값으로 */ }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (_) {} }
  function deepMerge(a, b) {
    for (const k in b) {
      if (b[k] && typeof b[k] === "object" && !Array.isArray(b[k]) && a[k] && typeof a[k] === "object") deepMerge(a[k], b[k]);
      else a[k] = b[k];
    }
    return a;
  }

  let BELTS, GRAD, NOTICES = { notices: [], updated: null };
  const prevVisit = S.notices.lastVisit;

  // ------------------------------------------------------------ helpers
  const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
  function dday(iso) {
    const d = new Date(iso.length <= 10 ? iso + "T00:00:00+09:00" : iso); d.setHours(0, 0, 0, 0);
    return Math.round((d - today()) / 86400000);
  }
  const ddLabel = (n) => (n === 0 ? "D-day" : n > 0 ? `D-${n}` : `D+${-n}`);
  const pct = (a, b) => (b > 0 ? Math.max(0, Math.min(100, Math.round((a / b) * 100))) : 0);
  const num = (v) => (v === null || v === "" || isNaN(v) ? 0 : Number(v));
  const fmt = (n) => Number(n).toLocaleString("ko-KR");
  function langGrade(toeic) {
    if (!toeic) return 0;
    const g = BELTS.languageGrades.find((x) => toeic >= x.toeic && x.toeic > 0);
    return g ? g.grade : 1;
  }
  const bar = (p, good) => `<div class="bar${good || p >= 100 ? " good" : ""}"><i style="width:${p}%"></i></div>`;
  const beltBadge = (b) => `<span class="b belt" style="background:${BELT_COLORS[b] || "#888"}">${b}</span>`;

  // 벨트 진행 상황 계산
  function beltProgress(b) {
    if (b.black) {
      const lg = langGrade(num(S.my.toeic));
      const t = b.tracks[1];
      const conds = [
        { label: "RED BELT 취득", ok: !!S.my.held.RED },
        { label: `포인트 총점 ${fmt(t.points)}점`, ok: num(S.my.points) >= t.points, cur: `${fmt(num(S.my.points))}점` },
        { label: `직전학기 성적 ${t.gpa}`, ok: num(S.my.gpa) >= t.gpa, cur: S.my.gpa ? `${S.my.gpa}` : "미입력" },
        { label: `외국어 ${t.langGrade}등급 (TOEIC ${BELTS.languageGrades[0].toeic})`, ok: lg >= t.langGrade, cur: lg ? `${lg}등급` : "미입력" },
      ];
      const done = conds.filter((c) => c.ok).length;
      return { conds, done, total: conds.length, overall: pct(done, conds.length), ok: done === conds.length };
    }
    const lg = langGrade(num(S.my.toeic));
    const reqDone = b.required.filter((r) => isItemDone(b, r, lg)).length;
    const el = num(S.belt.elective[b.id]);
    const bp = num(S.belt.beltPts[b.id]);
    const cum = num(S.my.points);
    const parts = [pct(reqDone, b.required.length), pct(el, b.electiveMin), pct(bp, b.beltTotal), pct(cum, b.cumulative)];
    return {
      reqDone, reqTotal: b.required.length, el, bp, cum,
      overall: Math.round(parts.reduce((a, c) => a + c, 0) / parts.length),
      ok: !!S.my.held[b.id] || parts.every((p) => p >= 100),
    };
  }
  function isItemDone(b, r, lg) {
    if (S.belt.items[`${b.id}.${r.id}`]) return true;
    return !!(r.langGrade && lg >= r.langGrade);
  }
  // 지금 노릴 벨트: BLUE → RED → BLACK 순서로 아직 안 딴 것
  function targetBelt() {
    for (const id of ["BLUE", "RED", "BLACK"]) if (!S.my.held[id]) return BELTS.belts.find((b) => b.id === id);
    return BELTS.belts.find((b) => b.id === "BLACK");
  }

  // ------------------------------------------------------------ tabs
  function setTab(t) {
    S.ui.tab = t; save();
    document.querySelectorAll(".tabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === t));
    document.querySelectorAll("[data-panel]").forEach((p) => (p.hidden = p.dataset.panel !== t));
    if (t === "notice") { S.notices.lastVisit = new Date().toISOString(); save(); }
    window.scrollTo({ top: 0 });
  }
  document.addEventListener("click", (e) => {
    const tab = e.target.closest("[data-tab]"); if (tab) setTab(tab.dataset.tab);
    const go = e.target.closest("[data-goto]"); if (go) setTab(go.dataset.goto);
  });

  // ------------------------------------------------------------ 요약
  function renderHome() {
    // 마감
    $("#deadlineBar").innerHTML = BELTS.schedule
      .filter((s) => dday(s.date) >= -1)
      .map((s) => `<div class="dl"><div class="dd">${ddLabel(dday(s.date))}</div><div><div class="lb">${esc(s.label)} · ${new Date(s.date).toLocaleString("ko-KR", { month: "numeric", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit" })}</div>${s.note ? `<div class="nt">${esc(s.note)}</div>` : ""}</div></div>`)
      .join("");

    // KPI
    const tot = GRAD.credits.find((c) => c.total);
    const totReq = reqOf(tot), totDone = num(S.grad.done[tot.id]);
    const tb = targetBelt();
    const tp = beltProgress(tb);
    const red = BELTS.belts.find((b) => b.id === "RED");
    const cum = num(S.my.points);
    const ac = activeNotices();
    $("#kpis").innerHTML = [
      { k: "졸업 학점", v: `${totDone}<small> / ${totReq}</small>`, s: totDone >= totReq ? "총 학점 충족" : `${totReq - totDone}학점 남음`, p: pct(totDone, totReq), go: "grad" },
      { k: `${tb.name.split(" ")[0]} 진행률`, v: `${tp.overall}<small>%</small>`, s: tb.black ? `조건 ${tp.done}/${tp.total} 충족` : `필수지정 ${tp.reqDone}/${tp.reqTotal}`, p: tp.overall, go: "belt" },
      { k: "누적 큰사람 포인트", v: `${fmt(cum)}<small> / ${fmt(red.cumulative)}</small>`, s: cum >= red.cumulative ? "RED 누적 기준 충족" : `RED까지 ${fmt(red.cumulative - cum)}점`, p: pct(cum, red.cumulative), go: "belt" },
      { k: "열린 포인트 공지", v: `${ac.length}<small>건</small>`, s: `내 벨트 필수 ${ac.filter((n) => n.required && (n.belts || []).some((b) => MY_BELTS.includes(b))).length}건`, p: null, go: "notice" },
    ].map((x) => `<div class="kpi" data-goto="${x.go}"><div class="k">${x.k}</div><div class="v">${x.v}</div>${x.p !== null ? bar(x.p) : ""}<div class="s" style="margin-top:6px">${x.s}</div></div>`).join("");

    // 할 일
    const todo = [];
    const lg = langGrade(num(S.my.toeic));
    if (!S.my.violence) todo.push({ tag: "장학", color: "#666b78", t: "2026년 폭력예방교육(LMS) 1회 이수", how: "장학생 선발 필수 조건이에요" });
    for (const b of BELTS.belts.filter((x) => !x.black && !x.optional && !S.my.held[x.id])) {
      for (const r of b.required) if (!isItemDone(b, r, lg)) todo.push({ tag: b.id, color: b.color, t: r.label, how: r.how });
      const p = beltProgress(b);
      if (p.el < b.electiveMin) todo.push({ tag: b.id, color: b.color, t: `필수선택 포인트 ${fmt(b.electiveMin - p.el)}점 더`, how: b.electives.slice(0, 5).join(", ") + " 등" });
      if (p.bp < b.beltTotal) todo.push({ tag: b.id, color: b.color, t: `${b.id} 포인트 합계 ${fmt(b.beltTotal - p.bp)}점 더 (기준 ${b.beltTotal}점)`, how: "필수지정 + 필수선택 합계" });
      break; // 지금 단계 벨트만
    }
    if (S.my.held.RED && !S.my.held.BLACK) {
      const p = beltProgress(BELTS.belts.find((b) => b.id === "BLACK"));
      p.conds.filter((c) => !c.ok).forEach((c) => todo.push({ tag: "BLACK", color: BELT_COLORS.BLACK, t: c.label, how: c.cur ? `현재 ${c.cur}` : "" }));
    }
    $("#todo").innerHTML = todo.length
      ? todo.slice(0, 8).map((x) => `<li><span class="tag" style="background:${x.color}">${esc(x.tag)}</span>${esc(x.t)}${x.how ? `<span class="how">${esc(x.how)}</span>` : ""}</li>`).join("")
      : `<li class="empty">지금 단계에서 남은 항목이 없어요 🎉</li>`;

    // 추천 공지
    const pick = ac
      .filter((n) => (n.belts || []).some((b) => [tb.id, "RED", "BLUE"].includes(b)) || n.points)
      .sort((a, b) => (b.required - a.required) || ((a.deadline || "9") < (b.deadline || "9") ? -1 : 1))
      .slice(0, 5);
    $("#homeNotices").innerHTML = pick.length ? pick.map(miniNotice).join("") : `<li class="empty">지금 열린 관련 공지가 없어요.</li>`;
  }

  // ------------------------------------------------------------ 벨트
  function renderMyStatus() {
    const lg = langGrade(num(S.my.toeic));
    $("#myStatus").innerHTML = `
      <label class="field">누적 큰사람 포인트<input type="number" inputmode="numeric" data-my="points" value="${S.my.points ?? ""}" placeholder="예: 1180"></label>
      <label class="field">직전학기 성적 (평점)<input type="number" step="0.01" inputmode="decimal" data-my="gpa" value="${S.my.gpa ?? ""}" placeholder="예: 3.85"></label>
      <label class="field">TOEIC 최고점 (정규)<input type="number" inputmode="numeric" data-my="toeic" value="${S.my.toeic ?? ""}" placeholder="예: 765"><span class="hint" style="margin:0">${lg ? `외국어 ${lg}등급` : "다른 시험이면 아래 체크로 대신"}</span></label>
      <label class="toggle"><input type="checkbox" data-my="violence" ${S.my.violence ? "checked" : ""}> 폭력예방교육 이수</label>
      <div class="field" style="grid-column:1/-1">취득한 벨트
        <div class="field-inline" style="flex-wrap:wrap;gap:14px;margin-top:4px">
          ${["WHITE", "YELLOW", "BLUE", "RED", "ORANGE", "BLACK"].map((b) => `<label class="toggle" style="padding:0"><input type="checkbox" data-held="${b}" ${S.my.held[b] ? "checked" : ""}> ${beltBadge(b)}</label>`).join("")}
        </div>
      </div>`;
  }
  $("#myStatus") && document.addEventListener("input", (e) => {
    const t = e.target;
    if (t.dataset.my) {
      S.my[t.dataset.my] = t.type === "checkbox" ? t.checked : t.value === "" ? null : Number(t.value);
      save(); if (t.dataset.my === "toeic") renderMyStatus(); renderBelt(); renderHome();
      if (t.dataset.my === "toeic") { const el = $(`[data-my="toeic"]`); el.focus(); el.setSelectionRange?.(el.value.length, el.value.length); }
    } else if (t.dataset.held) {
      S.my.held[t.dataset.held] = t.checked; save(); renderBelt(); renderHome();
    } else if (t.dataset.item) {
      S.belt.items[t.dataset.item] = t.checked; save(); renderBelt(); renderHome();
    } else if (t.dataset.el) {
      S.belt.elective[t.dataset.el] = t.value === "" ? null : Number(t.value); save(); renderBeltMeters(); renderHome();
    } else if (t.dataset.bp) {
      S.belt.beltPts[t.dataset.bp] = t.value === "" ? null : Number(t.value); save(); renderBeltMeters(); renderHome();
    } else if (t.dataset.gdone) {
      S.grad.done[t.dataset.gdone] = t.value === "" ? null : Number(t.value); save(); renderGradBars(); renderHome();
    } else if (t.dataset.greq) {
      S.grad.req[t.dataset.greq] = t.value === "" ? null : Number(t.value); save(); renderGradBars(); renderHome();
    } else if (t.dataset.gcheck) {
      S.grad.checks[t.dataset.gcheck] = t.checked; save(); renderGrad();
    }
  });

  function renderBelt() {
    if (!S.ui.belt) S.ui.belt = targetBelt().id;
    $("#beltSwitch").innerHTML = BELTS.belts.map((b) => {
      const p = beltProgress(b);
      return `<button data-belt="${b.id}" class="${S.ui.belt === b.id ? "on" : ""}"><span class="sw"><span class="dot" style="background:${b.color}"></span>${b.id}</span><small>${S.my.held[b.id] ? "취득 완료 ✓" : `${p.overall}%`}</small>${bar(S.my.held[b.id] ? 100 : p.overall)}</button>`;
    }).join("");
    const b = BELTS.belts.find((x) => x.id === S.ui.belt);
    const held = !!S.my.held[b.id];
    let html = `<div class="card"><div class="belt-head"><div><h2 style="margin:0">${esc(b.name)}</h2><div class="meta">${esc(b.grade)} · 선수: ${esc(b.prereq)}</div><div class="meta">장학금: ${esc(b.scholarship)}</div></div><span class="pill ${held ? "ok" : "no"}">${held ? "취득 완료" : "진행 중"}</span></div>`;
    if (b.black) {
      const p = beltProgress(b);
      html += b.tracks.map((t, i) => `<div class="track"><b>${esc(t.label)}</b><p>${esc(t.detail)}</p>${i === 1 ? p.conds.map((c) => `<div class="cond"><span class="ic">${c.ok ? "✅" : "⬜"}</span>${esc(c.label)}${c.cur ? `<span class="hint" style="margin:0 0 0 auto">${esc(c.cur)}</span>` : ""}</div>`).join("") : `<div class="cond"><span class="ic">${S.my.held.RED ? "✅" : "⬜"}</span>RED BELT 취득 후 포인트 총점으로 경쟁<span class="hint" style="margin:0 0 0 auto">현재 ${fmt(num(S.my.points))}점</span></div>`}</div>`).join("");
    } else {
      const lg = langGrade(num(S.my.toeic));
      html += `<div class="meters" id="beltMeters"></div>
        <div class="form-grid" style="margin:8px 0 6px">
          <label class="field">필수선택 항목 포인트 (기준 ${b.electiveMin}점)<input type="number" inputmode="numeric" data-el="${b.id}" value="${S.belt.elective[b.id] ?? ""}" placeholder="0"></label>
          <label class="field">${b.id} 포인트 합계 (기준 ${b.beltTotal}점)<input type="number" inputmode="numeric" data-bp="${b.id}" value="${S.belt.beltPts[b.id] ?? ""}" placeholder="0"></label>
        </div>
        <h3>필수지정 항목 (모두 이수)</h3>
        <div>${b.required.map((r) => {
          const auto = !S.belt.items[`${b.id}.${r.id}`] && r.langGrade && lg >= r.langGrade;
          const done = isItemDone(b, r, lg);
          return `<label class="check ${done ? "done" : ""}"><input type="checkbox" data-item="${b.id}.${r.id}" ${done ? "checked" : ""}><span><span class="t">${esc(r.label)}</span>${auto ? `<span class="auto">TOEIC으로 충족</span>` : ""}<span class="how">${esc(r.how)}</span></span></label>`;
        }).join("")}</div>
        <h3>필수선택 항목 (이 중에서 ${b.electiveMin}점 이상)</h3>
        <div class="electives">${b.electives.map((x) => `<span>${esc(x)}</span>`).join("")}</div>`;
    }
    html += `</div>`;
    $("#beltDetail").innerHTML = html;
    renderBeltMeters();
  }
  function renderBeltMeters() {
    const b = BELTS.belts.find((x) => x.id === S.ui.belt);
    const box = $("#beltMeters"); if (!box || b.black) return;
    const p = beltProgress(b);
    const m = (lbl, a, t, unit) => `<div class="meter"><div class="lbl"><b>${lbl}</b><span>${fmt(a)} / ${fmt(t)}${unit}</span></div>${bar(pct(a, t))}</div>`;
    box.innerHTML = m("필수지정", p.reqDone, p.reqTotal, "개") + m("필수선택", p.el, b.electiveMin, "점") + m("누적 포인트", p.cum, b.cumulative, "점");
  }
  document.addEventListener("click", (e) => {
    const bb = e.target.closest("[data-belt]");
    if (bb) { S.ui.belt = bb.dataset.belt; save(); renderBelt(); }
  });

  // ------------------------------------------------------------ 졸업
  const reqOf = (c) => (S.grad.req[c.id] ?? c.required);
  let editingReq = false;
  function renderGrad() {
    $("#gradNote").hidden = !GRAD.provisional;
    $("#gradNote").textContent = GRAD.note || "";
    $("#gradCredits").innerHTML = GRAD.credits.map((c) => `
      <div class="credit ${c.total ? "total" : ""}" data-credit="${c.id}">
        <div class="head"><span class="name">${esc(c.label)}</span>
          <span class="nums"><input type="number" inputmode="numeric" data-gdone="${c.id}" value="${S.grad.done[c.id] ?? ""}" placeholder="0" aria-label="${esc(c.label)} 이수학점"> /
          ${editingReq ? `<input type="number" inputmode="numeric" data-greq="${c.id}" value="${reqOf(c)}" aria-label="${esc(c.label)} 기준학점">` : `<b>${reqOf(c)}</b>`} 학점</span></div>
        <div class="gbar"></div><div class="left"></div>
      </div>`).join("");
    $("#gradChecks").innerHTML = GRAD.checks.map((c) => `<label class="check ${S.grad.checks[c.id] ? "done" : ""}"><input type="checkbox" data-gcheck="${c.id}" ${S.grad.checks[c.id] ? "checked" : ""}><span class="t">${esc(c.label)}</span></label>`).join("");
    renderGradBars();
  }
  function renderGradBars() {
    for (const c of GRAD.credits) {
      const el = document.querySelector(`[data-credit="${c.id}"]`); if (!el) continue;
      const d = num(S.grad.done[c.id]), r = num(reqOf(c));
      el.querySelector(".gbar").innerHTML = bar(r ? pct(d, r) : 100);
      el.querySelector(".left").textContent = r === 0 ? "기준 없음" : d >= r ? "충족 ✓" : `${r - d}학점 남음`;
    }
  }
  $("#editReq").addEventListener("click", () => { editingReq = !editingReq; $("#editReq").textContent = editingReq ? "✔ 수정 끝" : "✏️ 기준 수정"; renderGrad(); });

  // ------------------------------------------------------------ 공지
  function activeNotices() {
    return NOTICES.notices.filter((n) => (n.deadline ? dday(n.deadline) >= 0 : dday(n.posted) >= -21));
  }
  const isNew = (n) => prevVisit && n.firstSeen && n.firstSeen > prevVisit;
  function noticeBadges(n) {
    const out = [];
    if (isNew(n)) out.push(`<span class="b new">NEW</span>`);
    if (n.required) out.push(`<span class="b req">필수</span>`);
    (n.belts || []).forEach((b) => out.push(beltBadge(b)));
    if (n.points) out.push(`<span class="b pt">+${n.points}점</span>`);
    if (n.deadline) { const d = dday(n.deadline); out.push(`<span class="b dl ${d < 0 ? "past" : ""}">${d < 0 ? "마감" : "마감 " + ddLabel(d)}</span>`); }
    return out.join("");
  }
  const miniNotice = (n) => `<li><a href="${esc(n.url)}" target="_blank" rel="noopener">${esc(n.title)}</a><div class="meta">${noticeBadges(n)}<span>${esc(n.posted.slice(5).replace("-", "/"))}</span></div></li>`;
  const FILTERS = [
    { id: "mine", label: "내 벨트 (BLUE·RED·ORANGE)", f: (n) => (n.belts || []).some((b) => MY_BELTS.includes(b)) },
    { id: "points", label: "포인트 명시", f: (n) => !!n.points },
    { id: "open", label: "마감 전", f: (n) => !n.deadline || dday(n.deadline) >= 0 },
    { id: "saved", label: "★ 저장", f: (n) => !!S.notices.mark[n.id] },
    { id: "all", label: "전체", f: () => true },
  ];
  function renderNotices() {
    $("#noticeFilters").innerHTML = FILTERS.map((f) => `<button data-filter="${f.id}" class="${S.ui.filter === f.id ? "on" : ""}">${f.label}</button>`).join("");
    const f = FILTERS.find((x) => x.id === S.ui.filter) || FILTERS[0];
    const q = $("#noticeSearch").value.trim().toLowerCase();
    const list = NOTICES.notices.filter(f.f).filter((n) => !q || n.title.toLowerCase().includes(q));
    $("#noticeList").innerHTML = list.length ? list.map((n) => {
      const m = S.notices.mark[n.id];
      return `<li><div class="body"><a class="title" href="${esc(n.url)}" target="_blank" rel="noopener">${esc(n.title)}</a>
        <div class="meta">${noticeBadges(n)}<span>${esc(n.source)}</span><span>${esc(n.posted)}</span>${n.loginRequired ? `<span class="b login">로그인 필요</span>` : ""}</div>
        ${n.summary ? `<div class="sum">${esc(n.summary)}</div>` : ""}</div>
        <div class="mark"><button data-mark="${n.id}" data-v="star" class="${m === "star" ? "on" : ""}">★ 저장</button><button data-mark="${n.id}" data-v="applied" class="${m === "applied" ? "on" : ""}">신청함</button></div></li>`;
    }).join("") : `<li class="empty">조건에 맞는 공지가 없어요.</li>`;
    const nc = NOTICES.notices.filter(isNew).length;
    $("#newCount").hidden = !nc; $("#newCount").textContent = nc;
  }
  document.addEventListener("click", (e) => {
    const fb = e.target.closest("[data-filter]");
    if (fb) { S.ui.filter = fb.dataset.filter; save(); renderNotices(); }
    const mk = e.target.closest("[data-mark]");
    if (mk) {
      const id = mk.dataset.mark, v = mk.dataset.v;
      if (S.notices.mark[id] === v) delete S.notices.mark[id]; else S.notices.mark[id] = v;
      save(); renderNotices();
    }
  });
  $("#noticeSearch").addEventListener("input", renderNotices);

  // ------------------------------------------------------------ 내보내기/불러오기
  const dlg = $("#dlg");
  function openDlg(title, hint, text, onOk) {
    $("#dlgTitle").textContent = title; $("#dlgHint").textContent = hint; $("#dlgText").value = text;
    dlg.onclose = () => { if (dlg.returnValue === "ok" && onOk) onOk($("#dlgText").value); };
    dlg.showModal();
  }
  $("#exportBtn").addEventListener("click", () => {
    const { ui, ...rest } = S;
    const code = btoa(unescape(encodeURIComponent(JSON.stringify(rest))));
    navigator.clipboard?.writeText(code).catch(() => {});
    openDlg("내 입력값 코드", "복사됐어요. 다른 기기에서 ‘불러오기’에 붙여넣으세요.", code);
  });
  $("#importBtn").addEventListener("click", () => {
    openDlg("코드 불러오기", "다른 기기에서 내보낸 코드를 붙여넣으세요. 지금 기기의 값은 덮어써져요.", "", (v) => {
      try {
        const data = JSON.parse(decodeURIComponent(escape(atob(v.trim()))));
        S = deepMerge(blank(), { ...data, ui: S.ui }); save(); renderAll();
      } catch (_) { alert("코드를 읽지 못했어요. 전체를 정확히 붙여넣었는지 확인해 주세요."); }
    });
  });

  // ------------------------------------------------------------ boot
  function renderAll() { renderHome(); renderMyStatus(); renderBelt(); renderGrad(); renderNotices(); }
  async function load(path) { const r = await fetch(path, { cache: "no-cache" }); if (!r.ok) throw new Error(path); return r.json(); }
  Promise.all([load("data/belts.json"), load("data/graduation.json"), load("data/notices.json").catch(() => ({ notices: [] }))])
    .then(([b, g, n]) => {
      BELTS = b; GRAD = g; NOTICES = n;
      $("#updated").textContent = n.updated ? `공지 업데이트 ${new Date(n.updated).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}` : "공지 데이터 없음";
      $("#beltSource").href = b.sourceUrl;
      $("#scholarRules").innerHTML = b.scholarshipRules.map((r) => `<li>${esc(r)}</li>`).join("");
      renderAll();
      setTab(S.ui.tab || "home");
    })
    .catch((err) => { $("#updated").textContent = "데이터를 불러오지 못했어요: " + err.message; });

  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
})();
