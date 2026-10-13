import { NextResponse, type NextRequest } from 'next/server'
// The customer client talks directly to Supabase under RLS. Paid legacy tools are operator-only.
export async function proxy(req:NextRequest) {
  if(req.nextUrl.pathname==='/api/customer-config') return NextResponse.next()
  const token=req.headers.get('authorization'), url=process.env.MP_SUPABASE_URL, key=process.env.MP_SUPABASE_PUBLISHABLE_KEY
  if(!token?.startsWith('Bearer ')||!url||!key) return NextResponse.json({success:false,error:'운영자 로그인이 필요합니다.'},{status:401})
  try {
    const r=await fetch(url+'/auth/v1/user',{headers:{apikey:key,Authorization:token},cache:'no-store',signal:AbortSignal.timeout(10000)})
    if(!r.ok) return NextResponse.json({success:false,error:'로그인이 만료됐어요.'},{status:401})
    const user=await r.json()
    if(user.app_metadata?.mp_role!=='operator') return NextResponse.json({success:false,error:'운영자 전용 기능입니다.'},{status:403})
    // V1 intentionally never publishes, including through the old endpoint.
    if(req.nextUrl.pathname==='/api/publish') return NextResponse.json({success:false,error:'SNS 게시 연결은 준비 중입니다. 승인·예약 저장만 지원합니다.'},{status:503})
    return NextResponse.next()
  } catch {return NextResponse.json({success:false,error:'로그인 확인을 다시 시도해 주세요.'},{status:503})}
}
export const config={matcher:'/api/:path*'}
