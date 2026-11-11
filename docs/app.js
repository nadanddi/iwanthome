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
    const gt = gradTotals();
    const totReq = gt.req, totDone = gt.done;
    const tb = targetBelt();
    const tp = beltProgress(tb);
    const red = BELTS.belts.find((b) => b.id === "RED");
    const cum = num(S.my.points);
    const ac = activeNotices();
    $("#kpis").innerHTML = [
      { k: "졸업 학점", v: `${totDone}<small> / ${totReq}</small>`, s: !gt.imported ? "엑셀을 불러오면 자동으로 채워져요" : totDone >= totReq ? "총 학점 충족" : `${r1(totReq - totDone)}학점 남음${gt.taking ? ` · 수강 중 ${gt.taking}` : ""}`, p: pct(totDone, totReq), go: "grad" },
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
    // 졸업 항목은 벨트 항목에 밀리지 않게 앞쪽(장학 조건 다음)에 넣음
    todo.splice(S.my.violence ? 0 : 1, 0, ...gradGaps().map((g) => ({ tag: "졸업", color: "#1f9d55", t: `${/본전공|전체/.test(g.major) ? "" : g.major.split(" ")[0] + " "}${g.label} ${g.left}학점 더`, how: `${g.major} · 이번 학기 수강 중인 학점까지 뺀 값` })));
    if (S.my.held.RED && !S.my.held.BLACK) {
      const p = beltProgress(BELTS.belts.find((b) => b.id === "BLACK"));
      p.conds.filter((c) => !c.ok).forEach((c) => todo.push({ tag: "BLACK", color: BELT_COLORS.BLACK, t: c.label, how: c.cur ? `현재 ${c.cur}` : "" }));
    }
    $("#todo").innerHTML = todo.length
      ? todo.slice(0, 12).map((x) => `<li><span class="tag" style="background:${x.color}">${esc(x.tag)}</span>${esc(x.t)}${x.how ? `<span class="how">${esc(x.how)}</span>` : ""}</li>`).join("")
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
    const imp = S.grad.imported;
    const hasMajors = !!(imp && imp.majors && imp.majors.length);
    $("#gradManual").hidden = hasMajors;
    $("#clearImport").hidden = !imp;
    $("#gradImported").innerHTML = imp ? renderImported(imp) : "";
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
  // ------------------------------------------------------------ 오아시스 엑셀 불러오기
  const norm = (s) => String(s ?? "").replace(/\s+/g, "");
  const toNum = (v) => { const m = String(v ?? "").match(/-?\d+(\.\d+)?/); return m ? Number(m[0]) : 0; };
  const r1 = (n) => Math.round(n * 10) / 10;
  const MAJOR_COLS = [
    ["general", "교양최소/최대", "교양"], ["mreq", "전필", "전공필수"], ["msel", "전선", "전공선택"],
    ["adv", "전공심화", "전공심화"], ["msum", "전공합계", "전공 합계"], ["common", "공통필수", "공통필수"],
    ["pre", "선수", "선수과목"], ["free", "일반선택", "일반선택"], ["teach", "교직", "교직"],
    ["mil", "군사학", "군사학"], ["total", "총학점", "총학점"],
  ];
  function headerIndex(rows, must) {
    for (let i = 0; i < Math.min(rows.length, 12); i++) {
      const h = (rows[i] || []).map(norm);
      if (must.every((m) => h.includes(m))) return i;
    }
    return -1;
  }
  function detectKind(rows) {
    if (headerIndex(rows, ["전공구분", "총학점"]) >= 0) return "majors";
    if (headerIndex(rows, ["교양영역", "과목명"]) >= 0) return "general";
    if (headerIndex(rows, ["교과목명", "평점"]) >= 0) return "grades";
    return null;
  }
  function parseMajors(rows) {
    const hi = headerIndex(rows, ["전공구분", "총학점"]);
    const h = rows[hi].map(norm), at = (n) => h.indexOf(n);
    const map = new Map();
    for (const row of rows.slice(hi + 1)) {
      const type = String(row[at("전공구분")] || "").trim(), kind = norm(row[at("구분")]);
      if (!type || !kind) continue;
      const name = String(row[at("학과")] || "").trim(), key = type + "|" + name;
      if (!map.has(key)) map.set(key, { type, name, year: String(row[at("교과년도")] || ""), req: {}, max: {}, opt: {}, done: {}, taking: {} });
      const m = map.get(key);
      for (const [id, col] of MAJOR_COLS) {
        const i = at(col); if (i < 0) continue;
        const raw = String(row[i] ?? "");
        if (kind.startsWith("졸업")) {
          const parts = raw.split("/");
          m.req[id] = toNum(parts[0]);
          if (parts[1]) m.max[id] = toNum(parts[1]);
          if (/선택/.test(raw)) m.opt[id] = true;
        } else if (kind.startsWith("이수")) m.done[id] = toNum(raw);
        else if (kind.startsWith("수강")) m.taking[id] = toNum(raw);
      }
    }
    return [...map.values()];
  }
  function parseGeneral(rows) {
    const hi = headerIndex(rows, ["교양영역", "과목명"]);
    const h = rows[hi].map(norm), at = (n) => h.indexOf(n);
    const doneCol = at("이수과목"), takingCol = at("수강중"), reqCol = at("필수/선택");
    const doneCreditCol = doneCol >= 0 ? doneCol + 2 : -1;
    const areas = {}, required = [];
    let total = 0;
    for (const row of rows.slice(hi + 1)) {
      if (norm(row[reqCol]) === "소계") { total = toNum(row[doneCreditCol]); continue; }
      const area = String(row[at("교양영역")] || "").replace(/\(\d{4}\)/, "").trim();
      const course = String(row[at("과목명")] || "").trim();
      if (!area || !course) continue;
      const credit = toNum(row[doneCreditCol]);
      const done = !!String(row[doneCol] || "").trim();
      const taking = takingCol >= 0 && !!String(row[takingCol] || "").trim();
      if (done) areas[area] = r1((areas[area] || 0) + credit);
      if (norm(row[reqCol]) === "필수") required.push({ course, area, done, taking });
    }
    if (!total) total = r1(Object.values(areas).reduce((a, c) => a + c, 0));
    return { areas, required, total };
  }
  function parseGrades(rows) {
    const hi = headerIndex(rows, ["교과목명", "평점"]);
    const h = rows[hi].map(norm), at = (n) => h.indexOf(n);
    const sems = new Map();
    let gp = 0, gc = 0, earned = 0, count = 0;
    for (const row of rows.slice(hi + 1)) {
      const name = String(row[at("교과목명")] || "").trim(); if (!name) continue;
      if (String(row[at("미취득구분")] || "").trim()) continue; // 재이수로 지워진 성적 등
      const cr = toNum(row[at("학점")]), pv = String(row[at("평점")] ?? "").trim();
      earned += cr; count++;
      if (pv === "" || isNaN(Number(pv))) continue; // P/F 과목
      const year = String(row[at("연도")] || ""), term = String(row[at("학기")] || "");
      gp += cr * Number(pv); gc += cr;
      const k = `${year} ${term}`;
      const s = sems.get(k) || { label: k, year: Number(year), regular: /^[12]학기$/.test(term), order: Number(year) * 10 + (term.startsWith("1") ? 1 : term.startsWith("2") ? 3 : term.includes("여름") ? 2 : 4), p: 0, c: 0 };
      s.p += cr * Number(pv); s.c += cr; sems.set(k, s);
    }
    const list = [...sems.values()].sort((a, b) => a.order - b.order).map((s) => ({ label: s.label, regular: s.regular, gpa: Math.round((s.p / s.c) * 100) / 100, credits: s.c }));
    const lastSem = [...list].reverse().find((s) => s.regular) || null;
    return { overall: gc ? Math.round((gp / gc) * 100) / 100 : null, earned: r1(earned), count, semesters: list, lastSem };
  }
  function loadXLSX() {
    if (window.XLSX) return Promise.resolve();
    return new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
      s.onload = res; s.onerror = () => rej(new Error("엑셀 읽기 도구를 불러오지 못했어요. 인터넷 연결을 확인하세요."));
      document.head.appendChild(s);
    });
  }
  async function importFiles(files) {
    const box = $("#importStatus");
    box.innerHTML = `<div class="imp-msg">읽는 중…</div>`;
    try {
      await loadXLSX();
      const imp = { ...(S.grad.imported || {}) }, ok = [], bad = [];
      for (const f of files) {
        try {
          const wb = XLSX.read(await f.arrayBuffer(), { type: "array" });
          const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "", raw: false });
          const kind = detectKind(rows);
          if (kind === "majors") { imp.majors = parseMajors(rows); ok.push("전공구분별 학점"); }
          else if (kind === "general") { imp.general = parseGeneral(rows); ok.push("교양이수학점 내역"); }
          else if (kind === "grades") { imp.grades = parseGrades(rows); ok.push("취득성적 목록"); }
          else bad.push(f.name);
        } catch (_) { bad.push(f.name); }
      }
      if (ok.length) {
        imp.importedAt = new Date().toISOString();
        S.grad.imported = imp;
        if (imp.grades && imp.grades.lastSem) S.my.gpa = imp.grades.lastSem.gpa;
        save(); renderAll();
      }
      $("#importStatus").innerHTML =
        (ok.length ? `<div class="imp-msg">✓ ${ok.join(", ")} 불러왔어요.${imp.grades?.lastSem ? ` 직전학기 성적(${esc(imp.grades.lastSem.label)} ${imp.grades.lastSem.gpa})을 벨트 탭에도 넣었어요.` : ""}</div>` : "") +
        (bad.length ? `<div class="imp-msg err">✗ 형식을 알아보지 못한 파일: ${bad.map(esc).join(", ")}</div>` : "");
    } catch (e) {
      box.innerHTML = `<div class="imp-msg err">${esc(e.message)}</div>`;
    }
  }
  const drop = $("#drop");
  $("#xlsxInput").addEventListener("change", (e) => { if (e.target.files.length) importFiles([...e.target.files]); e.target.value = ""; });
  ["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
  ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
  drop.addEventListener("drop", (e) => { if (e.dataTransfer.files.length) importFiles([...e.dataTransfer.files]); });
  $("#clearImport").addEventListener("click", () => {
    if (!confirm("불러온 엑셀 값을 이 기기에서 지울까요?")) return;
    delete S.grad.imported; save(); $("#importStatus").innerHTML = ""; renderAll();
  });

  // 불러온 값으로 졸업 진행 계산
  function gradTotals() {
    const imp = S.grad.imported;
    if (imp && imp.majors && imp.majors.length) {
      const main = imp.majors.find((m) => m.type.includes("본전공")) || imp.majors[0];
      const done = r1(imp.majors.reduce((a, m) => a + num(m.done.total), 0));
      const taking = r1(imp.majors.reduce((a, m) => a + num(m.taking.total), 0));
      return { req: num(main.req.total), done, taking, imported: true };
    }
    const tot = GRAD.credits.find((c) => c.total);
    return { req: num(reqOf(tot)), done: num(S.grad.done[tot.id]), taking: 0, imported: false };
  }
  // 수강 중인 학점까지 넣고도 남는 졸업 항목
  function gradGaps() {
    const imp = S.grad.imported, out = [];
    if (!imp || !imp.majors) return out;
    for (const m of imp.majors) {
      for (const [id, , label] of MAJOR_COLS) {
        if (id === "total" || id === "msum" || !m.req[id] || m.opt[id]) continue;
        const left = r1(m.req[id] - num(m.done[id]) - num(m.taking[id]));
        if (left > 0) out.push({ major: `${m.type}${m.name ? " " + m.name : ""}`, label, left });
      }
    }
    const t = gradTotals();
    const left = r1(t.req - t.done - t.taking);
    if (left > 0) out.unshift({ major: "전체", label: "총 학점", left });
    return out;
  }
  function stackBar(done, taking, req) {
    const a = req ? Math.min(100, (done / req) * 100) : 100;
    const b = req ? Math.min(100 - a, (taking / req) * 100) : 0;
    return `<div class="bar${a >= 100 ? " good" : ""}"><i style="width:${a}%"></i>${b > 0 ? `<i class="taking" style="width:${b}%"></i>` : ""}</div>`;
  }
  function renderImported(imp) {
    let html = "";
    if (imp.majors && imp.majors.length) {
      const t = gradTotals();
      const left = r1(t.req - t.done), leftAfter = r1(t.req - t.done - t.taking);
      html += `<div class="card"><h2>졸업 학점</h2>
        <div class="big-total"><b>${t.done}</b><span>/ ${t.req}학점 이수${t.taking ? ` · 이번 학기 ${t.taking}학점 수강 중` : ""}</span></div>
        ${stackBar(t.done, t.taking, t.req)}
        <div class="legend"><span><i></i>이수</span>${t.taking ? `<span><i class="t"></i>수강 중</span>` : ""}<span>${left > 0 ? `${left}학점 남음${t.taking ? ` (이번 학기 끝나면 ${Math.max(0, leftAfter)}학점)` : ""}` : "총 학점 충족 ✓"}</span></div>
        <div class="hint" style="margin:10px 0 0">불러온 날짜: ${new Date(imp.importedAt).toLocaleDateString("ko-KR")} · 학기가 끝나면 다시 내려받아 넣어 주세요.</div></div>`;
      for (const m of imp.majors) {
        const rows = MAJOR_COLS.filter(([id]) => id !== "total" && (m.req[id] || m.done[id] || m.taking[id]));
        html += `<div class="card"><h2>${esc(m.type)} · ${esc(m.name)} <span class="hint">${esc(m.year)} 교육과정${m.type.includes("본전공") ? "" : ` · 총 ${m.req.total || 0}학점`}</span></h2>
          ${rows.map(([id, , label]) => {
            const d = num(m.done[id]), tk = num(m.taking[id]), r = num(m.req[id]);
            const after = r1(r - d - tk);
            let note = r === 0 ? "기준 없음" : d >= r ? "충족 ✓" : after <= 0 ? "이번 학기 끝나면 충족" : `${r1(r - d)}학점 남음${tk ? ` · 수강 후 ${after}학점` : ""}`;
            if (m.max[id] && d > m.max[id]) note += ` · 최대 ${m.max[id]}학점까지만 인정`;
            return `<div class="credit"><div class="head"><span class="name">${label}${m.opt[id] ? `<span class="opt">선택</span>` : ""}</span>
              <span class="nums"><b>${d}</b>${tk ? ` + ${tk}` : ""} / ${r}${m.max[id] ? `~${m.max[id]}` : ""}학점</span></div>
              ${stackBar(d, tk, r)}<div class="left">${note}${m.opt[id] ? " · 다전공(복수전공 등)을 하면 대신 인정되는 경우가 많아요. 학과에 확인하세요." : ""}</div></div>`;
          }).join("")}</div>`;
      }
    }
    if (imp.general) {
      const g = imp.general;
      html += `<div class="card"><h2>교양 이수 내역 <span class="hint">총 ${g.total}학점</span></h2>
        <div class="course-list">${Object.entries(g.areas).map(([a, c]) => `<span class="tk">${esc(a)} ${c}학점</span>`).join("")}</div>
        ${g.required.length ? `<h3>필수 교양 과목</h3><div class="course-list">${g.required.map((c) => `<span class="${c.done ? "" : c.taking ? "tk" : "no"}">${c.done ? "✓" : c.taking ? "수강 중" : "✗"} ${esc(c.course)}</span>`).join("")}</div>` : ""}</div>`;
    }
    if (imp.grades) {
      const gr = imp.grades;
      html += `<div class="card"><h2>성적</h2><div class="stat-row" style="margin-top:0">
        <div class="stat"><div class="k">전체 평점</div><div class="v">${gr.overall ?? "-"}</div></div>
        <div class="stat"><div class="k">직전학기 ${gr.lastSem ? `(${esc(gr.lastSem.label)})` : ""}</div><div class="v">${gr.lastSem ? gr.lastSem.gpa : "-"}</div></div>
        <div class="stat"><div class="k">취득 학점</div><div class="v">${gr.earned}</div></div></div>
        <div class="hint" style="margin:10px 0 0">벨트 장학 기준: 직전학기 2.75 이상 ${gr.lastSem && gr.lastSem.gpa >= 2.75 ? "✓" : ""} · BLACK 기준② 4.0 이상 ${gr.lastSem && gr.lastSem.gpa >= 4 ? "✓" : ""}. 학교 공식 평점과 소수점이 조금 다를 수 있어요.</div></div>`;
    }
    return html;
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
