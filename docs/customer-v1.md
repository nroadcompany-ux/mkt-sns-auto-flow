# 고객용 V1 · 2026-10-13

기존 마케팅플레이 오토의 고객용 작업 공간을 `/`에 제공한다. 기존 SNS Maker/Visual Maker 코드는 `/studio`에 보존하며 운영자 역할을 Auth 서버에서 검증한다. 유료 AI 생성과 기존 API의 공개 호출을 차단한다. V1의 `/api/publish`는 운영자에게도 준비 중 응답을 반환한다.

## 고객이 할 수 있는 일

1. 이메일·비밀번호 로그인, 이메일 인증을 통한 회원가입, 비밀번호 재설정.
2. 브랜드명·업종·브랜드 이야기 저장.
3. MP4/MOV/WebM 영상 업로드(100MB 이하, 비공개). 6MB 청크 TUS 업로드, 진행률·취소·연결 오류 안내.
4. 제목·게시 내용·YouTube/Instagram/TikTok/Threads 대상 채널·한국 시간 예약 저장.
5. 초안 → 승인 요청 → 최종 승인. 승인 전 회수·수정, 승인 후 취소와 기록 보존.
6. 개인 콘텐츠 목록·예약 일정·영상 미리보기·원본 다운로드·작업 기록 조회.

실제 SNS 계정 연결, 자동 게시, AI 영상 렌더링, 외부 댓글·좋아요·이웃추가는 고객 V1 범위에 포함하지 않는다. 화면은 예약 저장과 실제 게시를 구분한다. 자동 게시 작업이나 cron은 만들지 않는다.

## 인프라

- GitHub: `nroadcompany-ux/mkt-sns-auto-flow`, 운영 브랜치 `master`.
- Vercel: 기존 `sns-auto-flow`, `nroad-projects` 팀. 과거 저장소명이 남아 있지만 GitHub repository ID가 일치하는 기존 Git 연결을 사용한다.
- Supabase: 기존 `sns-auto-flow` 프로젝트 `fcnrtcirzguojhxhvdbb`를 재개해 사용한다.
- `MP_SUPABASE_URL`, `MP_SUPABASE_PUBLISHABLE_KEY`는 Vercel 설정에 등록한다. 공개용 키만 config API가 반환하며 고객 자료에는 RLS를 적용한다. 서비스 역할 키는 앱 런타임에 제공하지 않는다.
- Auth 이메일 인증을 유지하고 운영 도메인으로 인증 복귀 경로를 설정한다. 고객 가입 메일의 실제 수신은 이번 검증에 포함하지 않는다.

## 데이터·권한

`supabase/migrations/20261013_customer_v1.sql`은 기존 테이블·계정·버킷을 변경하지 않고 `mp_v1_profiles`, `mp_v1_posts`, `mp_v1_events`와 비공개 `mp-v1-videos` 버킷을 추가한다.

고객 JWT의 `auth.uid()`와 행 소유자, 영상 폴더가 일치해야 한다. 콘텐츠·이력 테이블의 직접 쓰기는 금지하고 저장·상태 변경 RPC만 허용한다. RPC는 영상 존재·소유권·종류, 제목·내용, 대상 채널, 미래의 예약 시간, 현재 상태와 행 버전을 확인한다. 동시 수정의 버전 불일치는 애플리케이션 오류로 즉시 거절한다. 취소는 상태 변경이며 이력은 삭제·수정하지 않는다.

영상 미리보기 URL은 1시간, 다운로드 URL은 60초 후 만료된다. 서명 링크를 공유하면 유효 기간 동안 파일에 접근할 수 있으므로 공개 게시물에 넣지 않는다. SNS 연결 전 영상은 비공개 상태로 보관한다.

## 검증

- 엄격한 TypeScript 검사와 Next.js 프로덕션 빌드. 과거의 빌드 오류 무시 옵션 제거.
- 업로드 크기·파일 종류 경계, 브라우저 시간대와 무관한 KST/UTC 변환 단위 검사.
- 두 개의 가상 검토 고객 계정으로 실제 Supabase 로그인·저장·영상 접근 격리·상태 위조 차단·승인·동시 변경 차단·취소 이력 검증. 테스트 데이터는 QA 표시를 붙인다.
- Chrome 고객 화면에서 업로드·초안·예약 저장·승인 요청·최종 승인·재접속 후 조회와 반응형 화면 검증.
- 외부 SNS 게시와 실제 고객 데이터를 변경하지 않는다. 검토 계정 로그인 정보는 NROAD 허브의 비공개 테스트 계정 기록과 서버 환경 변수에만 보관한다.

실행: `npm install`, 공개 연결 설정을 `.env.local`에 등록한 뒤 `npm run dev -- -p 5245`.
검사: `npx tsc --noEmit`, `node --experimental-strip-types --test tests/customer-contract.mjs`, `npm run build`.
운영 QA 스크립트는 비공개 상태 JSON과 QA 영상 경로를 인자로 받으며 인증 값을 출력하지 않는다.
