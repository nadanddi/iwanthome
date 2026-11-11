"""전북대 '큰사람 포인트 공지' 수집기.

- 대학 본부 교내공지(www.jbnu.ac.kr)에서 키워드 검색 → 본문까지 읽어 포인트·벨트 정보 추출
- 취업진로지원과(career.jbnu.ac.kr) 메인 화면의 프로그램 공지 제목·D-day 수집
- 결과를 docs/data/notices.json 에 누적 저장
- 새 공지가 있고 NTFY_TOPIC 환경변수가 있으면 ntfy 앱으로 푸시 알림

표준 라이브러리만 사용합니다 (pip 설치 불필요).
"""
from __future__ import annotations

import datetime as dt
import html
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_FILE = ROOT / "docs" / "data" / "notices.json"
KST = dt.timezone(dt.timedelta(hours=9))
UA = {"User-Agent": "Mozilla/5.0 (compatible; jbnu-belt-dashboard/1.0)"}

MAIN_LIST = "https://www.jbnu.ac.kr/web/news/notice/sub01.do"
MAIN_DETAIL = "https://www.jbnu.ac.kr/web/Board/{id}/detailView.do?pageIndex=1&menu=2377"
CAREER_MAIN = "https://career.jbnu.ac.kr/career/index.do"
CAREER_BASE = "https://career.jbnu.ac.kr"

SEARCH_KEYWORDS = ["큰사람", "벨트", "BELT"]
SEARCH_PAGES = 2
KEEP_DAYS = 120  # 이보다 오래된 공지는 목록에서 정리

# 취업진로지원과 메인 화면에서 이 단어가 들어간 공지만 수집
CAREER_FILTER = re.compile(r"큰사람|포인트|벨트|BELT|대진설|진로설계|필수", re.I)

BELTS = [
    ("WHITE", r"WHITE|화이트"),
    ("YELLOW", r"YELLOW|옐로우|옐로"),
    ("ORANGE", r"ORANGE|오렌지"),
    ("BLUE", r"BLUE|블루"),
    ("RED", r"RED|레드"),
    ("BLACK", r"BLACK|블랙"),
]

POINT_PATTERNS = [
    re.compile(r"큰\s*사람\s*(?:포인트|P)\s*[:：]?\s*(\d{1,3})\s*(?:점|P|p)?", re.I),
    re.compile(r"포인트\s*[:：]?\s*(\d{1,3})\s*(?:점|P|p)", re.I),
    re.compile(r"(\d{1,3})\s*(?:점|P|p)\s*(?:부여|인정|지급)", re.I),
]


def now_kst() -> dt.datetime:
    return dt.datetime.now(KST)


def fetch(url: str, retries: int = 2) -> str:
    last = None
    for attempt in range(retries + 1):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=25) as r:
                return r.read().decode("utf-8", "replace")
        except Exception as e:  # noqa: BLE001
            last = e
            time.sleep(2 * (attempt + 1))
    raise RuntimeError(f"fetch failed: {url}: {last}")


def strip_tags(s: str) -> str:
    s = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", s, flags=re.S | re.I)
    s = re.sub(r"<br\s*/?>|</p>|</div>|</li>", "\n", s, flags=re.I)
    s = re.sub(r"<[^>]+>", " ", s)
    s = html.unescape(s)
    s = re.sub(r"[ \t ]+", " ", s)
    s = re.sub(r"\n\s*\n+", "\n", s)
    return s.strip()


def extract_points(*texts: str) -> int | None:
    """제목을 먼저 보고, 없으면 본문에서 큰사람 포인트 점수를 찾는다."""
    for text in texts:
        if not text:
            continue
        found = []
        for pat in POINT_PATTERNS:
            for m in pat.finditer(text):
                # 마지막 패턴(“10점 부여”)은 '큰사람/포인트' 가 근처에 있을 때만 인정
                if pat is POINT_PATTERNS[2]:
                    ctx = text[max(0, m.start() - 40): m.end() + 10]
                    if not re.search(r"큰\s*사람|포인트", ctx):
                        continue
                v = int(m.group(1))
                if 1 <= v <= 300:
                    found.append(v)
        if found:
            return max(found)
    return None


def extract_belts(text: str) -> list[str]:
    # 영문은 앞뒤가 다른 영문자가 아닐 때만 (예: SHARED 의 RED 는 제외)
    out = []
    for name, pat in BELTS:
        eng, kor = pat.split("|", 1)
        if re.search(rf"(?<![A-Za-z]){eng}(?![A-Za-z])", text, re.I) or re.search(kor, text):
            out.append(name)
    return out


def extract_deadline(body: str, posted: str) -> str | None:
    """본문에서 '신청/접수 ... ~ 11.20' 같은 마감일을 대략 추정 (YYYY-MM-DD)."""
    if not body:
        return None
    year = int(posted[:4]) if posted else now_kst().year
    cands = []
    for m in re.finditer(r"(신청|접수|모집)[^\n]{0,60}?[~～\-]\s*(?:(20\d{2})\s*[.\-/년]\s*)?(\d{1,2})\s*[.\-/월]\s*(\d{1,2})", body):
        y = int(m.group(2)) if m.group(2) else year
        mo, d = int(m.group(3)), int(m.group(4))
        try:
            date = dt.date(y, mo, d)
        except ValueError:
            continue
        if posted and date < dt.date.fromisoformat(posted):
            try:
                date = dt.date(y + 1, mo, d)
            except ValueError:
                continue
        cands.append(date)
    return min(cands).isoformat() if cands else None


# ---------------------------------------------------------------- 본부 교내공지
ROW_RE = re.compile(
    r"pf_DetailMove\('(\d+)'\)\"[^>]*>(.*?)</a>\s*<ul class=\"etc-list\">\s*<li>\s*([\d-]+)",
    re.S,
)


def scrape_main_board() -> dict[str, dict]:
    items: dict[str, dict] = {}
    for kw in SEARCH_KEYWORDS:
        for page in range(1, SEARCH_PAGES + 1):
            q = urllib.parse.urlencode({
                "pageIndex": page, "menu": 2377,
                "searchCondition": "contents", "searchKeyword": kw,
            })
            try:
                page_html = fetch(f"{MAIN_LIST}?{q}")
            except RuntimeError as e:
                print(e, file=sys.stderr)
                continue
            rows = ROW_RE.findall(page_html)
            for pid, raw_title, date in rows:
                title = re.sub(r"\s+", " ", strip_tags(raw_title)).strip()
                items[f"main-{pid}"] = {
                    "id": f"main-{pid}",
                    "source": "교내공지",
                    "title": title,
                    "posted": date.strip(),
                    "url": MAIN_DETAIL.format(id=pid),
                }
            if len(rows) < 10:
                break
    return items


def enrich_main(item: dict) -> None:
    try:
        page = fetch(item["url"])
    except RuntimeError as e:
        print(e, file=sys.stderr)
        return
    m = re.search(r'<div class="com-post-content-01[^"]*"(.*?)(?:<div class="com-post-fixed-box|<dl class="com-post-move-box|<div class="com-btn-box)', page, re.S)
    body = strip_tags(m.group(1)) if m else ""
    item["summary"] = body[:400]
    item["points"] = extract_points(item["title"], body)
    item["belts"] = extract_belts(item["title"] + " " + body[:600])
    item["deadline"] = extract_deadline(body, item["posted"])
    item["required"] = bool(re.search(r"필수", item["title"]))


# ---------------------------------------------------------------- 취업진로지원과
CAREER_RE = re.compile(
    r'<a href="(/bbs/career/(\d+)/(\d+)/artclView\.do[^"]*)"[^>]*class="subject".*?<strong>(.*?)</strong>(.*?)<span class="date"><p>([\d.]+)</p>',
    re.S,
)


def scrape_career() -> dict[str, dict]:
    items: dict[str, dict] = {}
    try:
        page = fetch(CAREER_MAIN)
    except RuntimeError as e:
        print(e, file=sys.stderr)
        return items
    today = now_kst().date()
    for href, board, pid, raw_title, mid, date in CAREER_RE.findall(page):
        title = re.sub(r"\s+", " ", strip_tags(raw_title)).strip()
        if not CAREER_FILTER.search(title):
            continue
        deadline = None
        dm = re.search(r"D-(day|\d+)", mid, re.I)
        if dm:
            n = 0 if dm.group(1).lower() == "day" else int(dm.group(1))
            deadline = (today + dt.timedelta(days=n)).isoformat()
        items[f"career-{pid}"] = {
            "id": f"career-{pid}",
            "source": "취업진로지원과",
            "title": title,
            "posted": date.replace(".", "-"),
            "url": CAREER_BASE + href,
            "loginRequired": True,
            "summary": "",
            "points": extract_points(title),
            "belts": extract_belts(title),
            "deadline": deadline,
            "required": "필수" in title,
        }
    return items


# ---------------------------------------------------------------- 알림
def notify(new_items: list[dict]) -> None:
    topic = os.environ.get("NTFY_TOPIC", "").strip()
    if not topic or not new_items:
        return
    site = os.environ.get("SITE_URL", "").strip()
    for it in new_items[:10]:
        bits = []
        if it.get("points"):
            bits.append(f"+{it['points']}점")
        if it.get("belts"):
            bits.append("/".join(it["belts"]))
        if it.get("deadline"):
            bits.append(f"마감 {it['deadline'][5:].replace('-', '/')}")
        payload = {
            "topic": topic,
            "title": "새 큰사람 포인트 공지" + (f" ({' · '.join(bits)})" if bits else ""),
            "message": it["title"],
            "click": it["url"],
            "tags": ["mortar_board"],
        }
        if site:
            payload["actions"] = [{"action": "view", "label": "대시보드", "url": site}]
        req = urllib.request.Request(
            "https://ntfy.sh/",
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json", **UA},
        )
        try:
            urllib.request.urlopen(req, timeout=15).read()
        except Exception as e:  # noqa: BLE001
            print(f"ntfy failed: {e}", file=sys.stderr)
    if len(new_items) > 10:
        print(f"{len(new_items) - 10}건은 알림 생략", file=sys.stderr)


# ---------------------------------------------------------------- main
def main() -> int:
    old = {}
    first_run = not DATA_FILE.exists()
    if not first_run:
        old = {n["id"]: n for n in json.loads(DATA_FILE.read_text("utf-8")).get("notices", [])}

    found = scrape_main_board()
    for key, it in found.items():
        if key in old and "summary" in old[key]:
            old[key].update({k: it[k] for k in ("title", "posted")})
            found[key] = old[key]
        else:
            enrich_main(it)
            time.sleep(0.5)
    found.update(scrape_career())

    merged = {**old, **found}
    cutoff = (now_kst().date() - dt.timedelta(days=KEEP_DAYS)).isoformat()
    merged = {k: v for k, v in merged.items() if v.get("posted", "9999") >= cutoff}

    stamp = now_kst().isoformat(timespec="minutes")
    new_items = []
    for k, v in merged.items():
        if k not in old:
            v["firstSeen"] = stamp
            new_items.append(v)

    notices = sorted(merged.values(), key=lambda n: (n.get("posted", ""), n["id"]), reverse=True)
    DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    DATA_FILE.write_text(json.dumps({"updated": stamp, "notices": notices}, ensure_ascii=False, indent=1), "utf-8")

    print(f"총 {len(notices)}건, 새 공지 {len(new_items)}건")
    if not first_run:
        notify(new_items)
    return 0


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.exit(main())
