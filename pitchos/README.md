# JOKBAL.L 웹 (모바일 PWA)

아이폰 Safari에서 바로 열어 쓰는 JOKBAL.L(구 PitchOS) 모바일 웹입니다. 빌드 도구 없이 정적 파일 그대로
동작하고(모던 ESM + HTML + CSS), 실서버 Supabase에 직접 붙습니다. 앱과 **같은 DB·같은
RPC·같은 RLS**를 쓰므로 웹에서 만든 일정·투표가 폰 앱과 즉시 같아집니다.

## 폴더

```
web/
  index.html                 셸 (viewport-fit=cover, apple-mobile-web-app-*, manifest)
  app.css                    디자인 시스템 (Pretendard, 블루 #2563EB, 430px 프레임,
                             18~26px 카드 라운드, 블러 앱바·탭바, 바텀시트)
  manifest.webmanifest       PWA 매니페스트
  sw.js                      오프라인 셸 (API 요청은 캐시하지 않음)
  icons/                     192·512·maskable·apple-touch-icon
  legal/                     이용약관·개인정보처리방침·위치정보 동의 (docs/*.md에서 변환)
  js/
    app.js                   부팅·해시 라우터·탭바·유지보수 배너
    api.js                   Supabase REST/Auth/Functions 클라이언트, 토큰 갱신
    store.js                 로그인 세션 상태(프로필·팀·팀원·경기)
    ui.js                    DOM 헬퍼·시트·모달·토스트·폼 컴포넌트
    lib/format.js            시간(KST)·거리·투표 라벨 등 순수 함수
    lib/quarters.js          총 경기 시간·쿼터 시간·쉬는 시간 → 쿼터 수 계산 (단위 테스트)
    lib/gpx.js               애플워치 GPX 파싱·거리·속도·스프린트·쿼터 분할 (단위 테스트)
    lib/crest.js             이름 기반 자동 엠블럼 (FNV-1a)
    lib/lineup.js            라인업 자동 배분 초안
    lib/pitch.js             전술판(피치 보드) 선수 배치 계산 (단위 테스트)
    views/                   auth · home(경기·투표) · team · records · my
  samples/                   테스트용 풋살 GPX 샘플(4쿼터)
  tests/                     node --test 단위 테스트 (CI)
```

## 디자인 (2026-11 리디자인)

- 상단 고정 앱바(반투명 블러) + 하단 iOS 스타일 탭바(경기·팀·기록·마이, safe-area 대응).
- 생성·수정 폼은 화면에 펼치지 않고 바텀시트로 분리: 경기 만들기, 구장 4점 등록,
  팀 만들기/참여, 회원가입, 1:1 문의, 프로필·Q&A, 워치 기록 올리기.
- 홈: D-Day 히어로 카드 → 원탭 RSVP 4칩 + 참석 요약 바/아바타 → 전술판 라인업
  (초록 피치 위 포지션별 선수 뱃지, 쿼터 탭, 자동 배분/저장) → 일정·지난 경기·구장.
- 팀: 배너 + 초대코드 원탭 복사 + 포지션 필터 칩 + 팀원 목록(이니셜 아바타·포지션·역할 뱃지).
- 기록: 2×2 KPI(총 거리·최고 속도·스프린트·활동 시간) + 쿼터별 미니 바 차트 +
  iOS 토글 공유 + 팀 공유 기록 피드 + 워치 GPX 업로드.
- 마이: 프로필 카드 + iOS 그룹 목록(프로필·Q&A 15문항 시트·1:1 문의·앱 정보·로그아웃·탈퇴).
- Pretendard는 jsDelivr CDN에서 받고, 오프라인이면 시스템 한글 폰트로 대체된다.
- 모바일 화면: 320~430px 대응, 입력창 16px 이상(아이폰 자동 확대 방지),
  `touch-action: manipulation`, 세로 고정(PWA `orientation: portrait`), 가로에서는
  430px 프레임을 가운데 정렬하고 가로 스크롤을 만들지 않는다.

## 로그인 유지

- 세션은 `localStorage`에 저장되어 탭을 닫거나 홈 화면 앱을 나갔다 와도 유지된다.
  로그인 화면의 **로그인 유지**(기본 ON)를 끄면 `sessionStorage`에만 남아 탭과 함께 끝나고,
  마지막 로그인 이메일도 저장하지 않는다.
- 만료 5분 전 자동 갱신 타이머 + 요청 직전 갱신 + 401 응답 시 1회 갱신·재시도 +
  화면 복귀(`visibilitychange`·`pageshow`·`online`) 시 갱신.
- 탭과 홈 화면 앱이 동시에 살아 있을 때를 위해 갱신 직전 저장소를 다시 읽고,
  다른 쪽이 이미 회전시킨 refresh_token이면 그 토큰을 쓴다(이전 토큰 재사용은 세션 폐기로 이어진다).

## 경기 시간 계산

경기 만들기 시트에서 **총 경기 시간 · 쿼터 시간 · 쉬는 시간**을 넣으면 쿼터 수가 자동으로 정해진다.
마지막 쿼터 뒤에는 쉬지 않으므로 `floor((총시간 + 휴식) / (쿼터 + 휴식))`
(예: 120분 · 12분 · 1분 → 9쿼터, 실제 9×12 + 8×1 = 116분). 계산 근거는 시트에
`총 116분 진행 · 휴식 1분×8회 · 여유 4분`처럼 보이고, `− / +`로 쿼터 수를 직접 조정하면
`직접 조정`으로 표시된다. 총 시간보다 진행 시간이 길어지면 저장을 막는다.

## 화면

| 탭 | 하는 일 | 쓰는 서버 규격 |
|---|---|---|
| 로그인 | 이메일 로그인/가입, 약관·개인정보·위치 동의 3종, 비밀번호 재설정 메일 | `/auth/v1/*` |
| 경기·투표 | 다음 경기 카드, 참석/지각(분)/미정/불참 투표, 투표 현황, 마감, 라인업 초안·저장, 구장 4점 등록 | `create_match`, `upsert_rsvp`, `match_rsvp_directory`, `finalize_rsvp`, `replace_lineup`, `pitches` |
| 팀 | 내 팀 목록, 팀 만들기, 초대코드 참여·복사, 팀원 목록, 포지션, 내보내기, 나가기 | `create_team_with_owner`, `join_team_with_code`, `team_member_directory`, `set_member_position`, `remove_team_member`, `leave_team` |
| 기록 | 내 세션·쿼터 지표, 팀 공유 토글, 팀원 공유 기록, **애플워치 GPX 업로드** | `player_sessions`, `quarter_stats` |
| 마이 | 프로필 확인·수정, Q&A 15문항, 1:1 문의, 로그아웃, 계정 탈퇴 | `my_profile`, `PATCH profiles?select=`, `support_tickets`, `delete-account` |

GPS 기록은 웹에서 실시간으로 만들지 않습니다. 대신 **애플워치 운동 기록(GPX)** 을 올리면
거리(Haversine)·이동 창 속도·최고 속도·스프린트(5.5 m/s 이상 1초 이상)·활동 시간·쿼터별 거리를
브라우저에서 계산해 `player_sessions`(record_source `watch`)와 `quarter_stats`에 저장합니다.
원본 GPX는 서버로 보내지 않고 요약만 저장합니다. 30초 넘는 공백(멈춤)과 15 m/s 넘는 GPS 튐은
계산에서 뺍니다. 위치 권한은 구장 4점 등록 때만 씁니다.

## 키

`js/config.js`에는 **Supabase URL과 anon key만** 있습니다. 둘 다 브라우저로 내려가는 값이고,
모든 테이블은 RLS로 보호됩니다. `service_role`, DB 비밀번호, Edge Function 시크릿은 이 폴더에
절대 넣지 않습니다.

## 로컬 확인

```bash
# 아무 정적 서버나 (예: python)
cd web && python3 -m http.server 8080
# http://localhost:8080
```

```bash
# 단위 테스트
node --test "web/tests/*.test.js"
```

## 배포

정적 파일이므로 아무 HTTPS 정적 호스팅이나 됩니다.

현재 배포: **GitHub Pages** — `https://wta704-cmd.github.io/friday-legal/pitchos/`

Pickle의 GitHub 연결에는 저장소 생성·Pages 활성화 권한이 없어서, Pages가 이미 켜져 있는 공개
저장소 `wta704-cmd/friday-legal`의 `pitchos/` 하위 경로에 사본을 올려 배포했습니다(그 폴더의
`DEPLOY-NOTE.md` 참고). 전용 저장소(`pitch-os-web`)로 옮기려면 저장소를 만들고 Settings →
Pages(main / root)를 켠 뒤 이 폴더 내용을 루트에 푸시하면 됩니다.

- GitHub Pages: `web/` 내용을 저장소 루트로 올리고 Settings → Pages → Branch `main` / `/root`.
- Cloudflare Pages: 루트 `web`, 빌드 명령 없음, 출력 디렉터리 `web`.

HTTPS여야 서비스워커와 "홈 화면에 추가"가 동작합니다.

## 아이폰에서 설치

Safari로 주소를 연 뒤 **공유 → 홈 화면에 추가**. 이후에는 전체 화면(standalone)으로 열리고
주소 표시줄이 사라집니다.

## 알려진 제약

- 소셜 로그인 4종(카카오·네이버·구글·Apple)은 콘솔 키가 없어 비활성 안내만 표시합니다.
- 이메일 가입은 기본 SMTP라 시간당 2통 한도가 있습니다(커스텀 SMTP 연결 전까지).
- 히트맵·리플레이는 이번 웹 범위에 없습니다(쿼터 지표·공유 설정까지).
- 워치 GPX는 쿼터를 **시간 기준으로 균등 분할**합니다(쉬는 시간 구간을 따로 알 수 없기 때문).
  아이폰 건강 앱은 운동 하나만 GPX로 내보내는 버튼이 없습니다. 무료로는 [모든 건강 데이터
  내보내기] zip 안의 `apple_health_export/workout-routes/*.gpx`를 쓰고, 한 경기만 꺼내려면
  GPX 내보내기 앱(예: HealthFit·RunGap)을 거칩니다. 테스트용 샘플은
  `samples/apple-watch-futsal-sample.gpx`.
- 계정 탈퇴는 `delete-account` Edge Function을 먼저 부르고, 브라우저 CORS 프리플라이트가
  막히면(배포된 v3 함수에 CORS 헤더가 없음) `delete_my_account()` RPC로 대체합니다. RPC는
  프로필·팀·경기·계정까지 지우지만 스토리지 원본 파일은 지우지 않습니다. 함수의 CORS 수정본은
  `shared-spec/supabase/functions/delete-account/index.ts`에 있고, `supabase functions deploy
  delete-account`로 배포하면 웹에서도 스토리지까지 정리되는 원래 경로가 쓰입니다.
