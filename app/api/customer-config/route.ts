export const dynamic = 'force-dynamic'
export function GET() {
  const url=process.env.MP_SUPABASE_URL, key=process.env.MP_SUPABASE_PUBLISHABLE_KEY
  return Response.json(url&&key?{url,key,version:'1.0.0',publishing:'pending',commit:process.env.VERCEL_GIT_COMMIT_SHA||null}:{error:'고객 서비스 연결 준비 중'},
    {status:url&&key?200:503,headers:{'Cache-Control':'no-store'}})
}
