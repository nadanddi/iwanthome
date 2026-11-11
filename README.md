# 벨트를 따자 졸업을 하자

전북대 **큰사람 벨트(BLUE → RED → BLACK)**, **졸업 요건**, **큰사람 포인트 공지**를 한 화면에서 보는 대시보드예요.

- 사이트: `docs/` 폴더 (GitHub Pages로 무료 공개)
- 공지 수집: `scraper/fetch_notices.py`. GitHub Actions가 **3시간마다** 자동 실행하고, PC가 꺼져 있어도 돌아가요.
- 새 공지 알림: **ntfy** 앱으로 푸시 알림
- 내 입력값(포인트, 학점, 체크 상태): 각 기기 브라우저에만 저장돼요. 화면 아래 **내보내기/불러오기**로 폰과 PC를 맞출 수 있어요.

## 폴더 구조

| 경로 | 내용 |
|---|---|
| `docs/index.html`, `app.js`, `style.css` | 대시보드 화면 |
| `docs/data/belts.json` | 벨트 기준 (2026 큰사람프로젝트 매뉴얼 기준) |
| `docs/data/graduation.json` | 졸업 요건 (학과 기준 확인 전 **임시값**) |
| `docs/data/notices.json` | 수집된 공지. 자동으로 갱신돼요 |
| `scraper/fetch_notices.py` | 공지 수집기. 표준 라이브러리만 써서 따로 설치할 게 없어요 |
| `.github/workflows/update-notices.yml` | 3시간마다 수집을 실행하는 예약 작업 |

## 처음 한 번만 하는 설정

1. **저장소 만들기**: https://github.com/new 에서 이름(예: `belt-graduation`)을 정하고 **Public**으로 만들어요. 무료 Pages는 공개 저장소만 돼요. README 등 다른 파일은 체크하지 말고 빈 저장소로 만드세요.
2. **업로드**: 빈 저장소 주소를 Claude에게 알려주면 올려줘요. 처음 올릴 때 GitHub 로그인 창이 한 번 떠요.
3. **사이트 켜기**: 저장소 → Settings → Pages → Source를 *Deploy from a branch*로, Branch를 `main` / `/docs`로 설정하고 Save.
   잠시 뒤 `https://<내아이디>.github.io/belt-graduation/` 에 사이트가 열려요.
4. **알림 받기 (ntfy)**
   1. 폰에 **ntfy** 앱을 설치해요 (Android Play 스토어 / iOS App Store).
   2. 앱에서 **+** → 토픽 이름에 `jbnu-belt-4a0953fe5b` 입력 → 구독.
      이름을 아는 사람은 누구나 같은 알림을 받을 수 있어서 알아보기 힘든 이름으로 정했어요.
   3. 저장소 → Settings → Secrets and variables → Actions → **New repository secret**
      Name: `NTFY_TOPIC`, Secret: `jbnu-belt-4a0953fe5b`
5. **테스트**: 저장소 → Actions → "큰사람 포인트 공지 수집" → **Run workflow**를 눌러 수동 실행해 보세요. 성공하면 그다음부터 3시간마다 자동으로 돌아요.
   처음 실행할 때는 이미 있는 공지가 알림으로 쏟아지지 않게 알림을 보내지 않아요. 그다음 실행부터 **새로 올라온 공지만** 알려줘요.
6. **폰 홈 화면에 추가**: 폰 브라우저로 사이트를 열고 공유(또는 ⋮) 메뉴에서 **홈 화면에 추가**를 누르면 앱처럼 쓸 수 있어요.

## 알아둘 점

- 공지의 점수, 벨트, 마감일은 제목과 본문에서 **자동으로 읽은 값**이에요. 틀릴 수 있으니 신청 전에 원문을 꼭 확인하세요.
- 취업진로지원과 게시판의 공지 **본문**은 로그인해야 보여요. 그래서 메인 화면에 보이는 제목과 D-day만 수집해요.
- GitHub 예약 실행은 정시보다 몇 분에서 수십 분 늦게 돌 수 있어요.
- 벨트 기준은 매년 바뀔 수 있어요. 새 매뉴얼이 나오면 `docs/data/belts.json`을 고쳐야 해요.
