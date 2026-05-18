# DDGolf - 골프 관리 홈페이지

## 버전 정보

**현재 버전: 2.4.20260518**

버전 형식: `메이저.마이너.날짜(YYYYMMDD)` (마이너 0~9, 9 초과 시 메이저 +1)

### 변경 이력

| 버전 | 날짜 | 내용 |
|------|------|------|
| 2.4.20260518 | 2026-05-18 | 유관기관 스크롤 ON/OFF 설정 (관리자), 대시보드 회원 카드 제거, 앨범 등록일 변경을 앨범 단위로 변경 |
| 2.3.20260430 | 2026-04-30 | 시스템 현황 대시보드 (CPU/메모리/디스크), 대시보드 카드 정리 (중복 제거, 제목 클릭 이동), 갤러리 사진 드래그앤드롭 안정화 (즉시 반영, 드롭 위치 표시), 앨범 등록일 변경 기능 |
| 2.0.20260430 | 2026-04-30 | 모바일 반응형 개선 (팝업 터치 드래그, 겹침 방지, 테이블 스크롤, 터치 타겟 44px), 갤러리 카테고리, OG 메타태그 링크 미리보기, 업로드 프로그래스바, 파일 크기 검증 (개별 200MB/총 1GB), 업로드 제한 1GB, SW 캐시 denylist |
| 1.12.20260428 | 2026-04-28 | 모바일 반응형 개선, 갤러리 카테고리, OG 메타태그 |
| 1.11.20260428 | 2026-04-28 | 서식다운로드 다중 파일 업로드 (드래그앤드랍, 대표이미지 지정), 일정 팝업, 팝업 드래그 이동 및 정렬 배치, 확장자별 컬러 배지 |
| 1.10.20260427 | 2026-04-27 | 연혁 순서 자동 배정 및 방향키 정렬 수정, 갤러리 Lightbox 네비게이션 (이전/다음/키보드/스와이프), 경기일정 최신순 정렬 |
| 1.9.20260426 | 2026-04-26 | 클럽 관리 CRUD UX 개선 (수정 버튼 추가, 폼 스크롤) |
| 1.8.20260426 | 2026-04-26 | 갤러리 대표 사진 UX 전면 개편 (사진 중 대표 선택), 갤러리 상세 대표 이미지 폴백, 빈 앨범 생성 방지 |
| 1.7.20260426 | 2026-04-26 | 관리자 전 탭 수정 버튼 클릭 시 폼으로 스크롤 UX 개선, 팝업 공지사항, 연혁 관리, About 페이지 개편, PWA 파비콘 |
| 1.6.20260413 | 2026-04-13 | SMS 관리(관리자 전용), 이름 로그인, 비밀번호 보기, UI 개선 |
| 1.5.20260407 | 2026-04-07 | 클럽 이미지 관리, 클럽 정보 수정, 멤버 CRUD, 관리자 UI 개선 |
| 1.4.20260407 | 2026-04-07 | 클럽 전용 공지사항, 클럽장 권한 체계, 공지 수정 기능, 약관/정책 페이지, 배너 크로스페이드, 유관기관 마키 애니메이션, 관리자 UX 개선 |
| 1.3.20260331 | 2026-03-31 | HTTPS 프록시 설정, 배너/유관기관 수정 기능, nginx 미디어 서빙 개선 |
| 1.2.20260327 | 2026-03-27 | .env 통합 (프로젝트 루트로 일원화) |
| 1.1.20260327 | 2026-03-27 | Google OAuth 로그인/회원가입 구현, python-dotenv 적용 |
| 1.0.20260210 | 2026-02-10 | 초기 배포 (회원관리, 게시판, 갤러리, 메신저, 일정, 공지사항) |

---

## 기술 스택

- **Backend**: Django 5.x + Django REST Framework + SimpleJWT
- **Frontend**: React 19 + TypeScript + Tailwind CSS + Vite
- **Database**: PostgreSQL (운영) / SQLite (개발)
- **WebSocket**: Django Channels + Daphne
- **인증**: JWT + Google OAuth 2.0
- **상태관리**: Zustand
- **배포**: Nginx + Daphne + Let's Encrypt SSL

---

## 주요 기능

- 회원가입 / 로그인 (이메일, Google OAuth)
- 관리자 승인 시스템
- 게시판 (이미지 첨부)
- 갤러리 (앨범/사진)
- 실시간 메신저 (WebSocket)
- 일정 관리
- 공지사항 / 팝업 공지 / 클럽 전용 공지 / 배너 광고 / 유관기관
- 서식다운로드 (다중 파일 드래그앤드랍 업로드, 대표이미지 지정)
- 연혁 관리 / 임원 관리
- SMS 관리 (관리자 전용)
- OG 메타태그 (카카오톡/SNS 링크 미리보기)
- 개인정보취급방침 / 이용약관 / 이메일무단수집거부

---

## 환경 변수 (`.env`)

프로젝트 루트의 `.env` 파일 하나로 Backend/Frontend 환경변수를 통합 관리합니다.

| 변수 | 용도 | 기본값 |
|------|------|--------|
| SECRET_KEY | Django 시크릿 키 | (자동 생성) |
| DEBUG | 디버그 모드 | True |
| ALLOWED_HOSTS | 허용 호스트 | localhost,127.0.0.1 |
| DB_ENGINE | DB 엔진 (sqlite/postgresql) | sqlite |
| DB_NAME / DB_USER / DB_PASSWORD | DB 접속 정보 | - |
| EMAIL_HOST_USER | Gmail 계정 | (없음) |
| EMAIL_HOST_PASSWORD | Gmail 앱 비밀번호 | (없음) |
| GOOGLE_CLIENT_ID | Google OAuth Client ID | (없음) |
| GOOGLE_CLIENT_SECRET | Google OAuth Client Secret | (없음) |
| VITE_API_URL | 프론트엔드 API URL | /api |
| VITE_GOOGLE_CLIENT_ID | 프론트엔드 Google Client ID | (없음) |

---

## 로컬 개발

```bash
# 환경변수 설정
cp .env.example .env  # 루트에서 한 번만

# Backend
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver 9000

# Frontend
cd frontend
npm install
npm run dev
```

## Docker 배포

### 요구사항
- Docker
- Docker Compose

```bash
cp .env.example .env
docker-compose up -d --build
```

## 관리자 계정
- 이메일: ddgolf24@ddgolf.com
- 비밀번호: dodan1004~

---

## 브랜치 전략

| 브랜치 | 용도 |
|--------|------|
| main | 운영 배포 |
| david | 개발 작업 |
