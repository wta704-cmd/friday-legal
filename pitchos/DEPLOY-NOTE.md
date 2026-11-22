# 배포 위치 안내

이 폴더는 `wta704-cmd/pitch-os` 저장소의 `web/` (아이폰 Safari용 PitchOS 모바일 웹/PWA)를
그대로 옮긴 정적 배포본입니다.

- 원본(소스·테스트·PR): `wta704-cmd/pitch-os` → `web/`
- 이 사본은 GitHub Pages가 이미 켜져 있는 이 저장소를 빌려 배포합니다.
  (Pickle의 GitHub 연결에는 저장소 생성·Pages 활성화 권한이 없어서, 새 저장소
  `pitch-os-web`을 만들 수 없었습니다.)
- 전용 저장소로 옮길 때: `pitch-os-web` 생성 → Settings → Pages(main / root) →
  `web/` 내용을 루트에 푸시 → 이 `pitchos/` 폴더 삭제.
- 비밀값 없음: Supabase URL과 anon key만 들어 있습니다(둘 다 공개 전제 값, RLS 보호).
