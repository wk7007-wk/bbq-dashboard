# CLAUDE.md

## 세션 운영 규칙
- 문서 정렬 우선: 코드/빌드/배포/Firebase write 변경 금지.
- 기존 변경은 되돌리지 않음. 변경 전 `git status --short`로 dirty 상태 확인 필수.
- `bbq-dashboard`는 정적 웹 문서셋이며, Android 앱 경로와 혼용하지 않음.

## 이번 적용 규칙
- `APP_INTENT.md`, `CODEMAP.txt`, `AI_HANDOFF.md`, `README.md`를 문서 정렬 기준으로만 업데이트.
- 완료 검증은 `git diff --check`, 문서-only 변경 확인으로 마무리.
