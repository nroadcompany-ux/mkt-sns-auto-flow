# 마케팅플레이 오토 · 고객용 V1

기존 `mkt-sns-auto-flow` 기반 고객 웹 서비스입니다. 이메일 로그인·회원가입, 비공개 영상 업로드,
초안·게시 채널·한국 시간 예약 저장, 승인 요청·최종 승인·취소와 작업 이력을 제공합니다.
**SNS 게시 연결은 준비 중이며, 실제 자동 게시를 실행하지 않습니다.**

- 고객용: https://sns-auto-flow.vercel.app/
- 기존 운영자 제작 도구: `/studio` (검증된 `app_metadata.mp_role=operator` 계정만)
- 운영 DB: 기존 `sns-auto-flow` Supabase 프로젝트의 `mp_v1_*` 테이블
- 상세 범위·설정·권한: [고객 V1 문서](docs/customer-v1.md)
- API/Storage 운영 검증: [검증 기록](docs/live-qa.json)

아래는 기존 Next.js 개발 시작 안내입니다. 과거 `HANDOFF.md`의 미배포/DB 설명은 과거 작업 시점의 기록입니다.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
