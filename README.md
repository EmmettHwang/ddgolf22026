# DDGolf - 골프 관리 홈페이지

## 버전 정보

**현재 버전: 3.1.20260617.1900**

버전 형식: `메이저.마이너.날짜(YYYYMMDD).시간(HHmm)` (마이너 0~9, 9 초과 시 메이저 +1)

### 변경 이력

| 버전 | 날짜 | 내용 |
|------|------|------|
| 3.1.20260617.1900 | 2026-06-17 | 관리자 회원 제재 전용 탭 추가 (클럽별 제재 등록, 활성 제재 목록/해제) |
| 3.0.20260617.1851 | 2026-06-17 | 계정 삭제 기능 (마이페이지), 클럽 탈퇴 기존 구현 유지 |
| 2.9.20260617.1847 | 2026-06-17 | 클럽장 회원 제재 기능, 용어 통일 (제외/제거→삭제, 클럽내용→채팅기록), 제재 권한 클럽장 확대 |
| 2.8.20260617.1843 | 2026-06-17 | 클럽장 표시 수정 (created_by → assigned instructor), 관리자 클럽 자동 가입 방지 |
| 2.7.20260617.1835 | 2026-06-17 | 클럽 소속 회원 관리 (목록, 추가, 제외), 관리자 멤버 추가/제거 API |
| 2.6.20260617.1828 | 2026-06-17 | 회원가입 클럽 선택, 미승인 회원 삭제, 클럽 삭제 개선 (기록삭제+삭제 버튼), 클럽 배정 전체 표시, 비밀번호 보기 토글 |
| 2.5.20260518 | 2026-05-18 | 시스템 현황 (CPU/메모리/디스크), 갤러리 사진 드래그앤드롭 정렬, 앨범 등록일 변경, 유관기관 스크롤 ON/OFF, 대시보드 정리 |
| 2.0.20260430 | 2026-04-30 | 업로드 개선 (프로그래스바, 파일 크기 검증), 모바일 반응형, 갤러리 카테고리, OG 메타태그, SW 캐시 |
| 1.11.20260428 | 2026-04-28 | 서식 다중파일 업로드, 일정 팝업, 드래그 이동, 확장자 배지 |
| 1.10.20260427 | 2026-04-27 | 연혁 정렬, 갤러리 Lightbox 네비게이션, 경기일정 최신순 |
| 1.9.20260426 | 2026-04-26 | 클럽 CRUD UX, 갤러리 대표 사진 UX, 팝업 공지, 연혁/임원 관리, About 개편 |
| 1.6.20260413 | 2026-04-13 | SMS 관리, 이름 로그인, 비밀번호 보기, UI 개선 |
| 1.5.20260407 | 2026-04-07 | 클럽 관리, 멤버 CRUD, 클럽 전용 공지, 클럽장 권한, 약관/정책, 배너/유관기관 |
| 1.3.20260331 | 2026-03-31 | HTTPS, 배너/유관기관 수정, nginx 미디어 서빙 |
| 1.1.20260327 | 2026-03-27 | Google OAuth, .env 통합, python-dotenv |
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
