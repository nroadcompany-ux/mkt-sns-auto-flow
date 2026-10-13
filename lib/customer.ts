import { createClient, type SupabaseClient } from '@supabase/supabase-js'
export const CHANNELS = [
  {id:'youtube',name:'YouTube Shorts',symbol:'▶',color:'#ef4444'},
  {id:'instagram',name:'Instagram Reels',symbol:'◎',color:'#c026d3'},
  {id:'tiktok',name:'TikTok',symbol:'♪',color:'#111827'},
  {id:'threads',name:'Threads',symbol:'@',color:'#374151'},
] as const
export type Post = {id:string;owner_id:string;title:string;body:string;channels:string[];video_path:string;scheduled_at:string|null;status:'draft'|'review'|'approved'|'cancelled';version:number;created_at:string;updated_at:string;approved_at:string|null}
export type Profile = {id:string;shop_name:string;industry:string;brand_note:string}
export const STATUS = {draft:'초안',review:'승인 대기',approved:'승인 완료',cancelled:'취소됨'}
export const BUCKET = 'mp-v1-videos'
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024
let client: SupabaseClient | null = null
export async function customerClient() {
  if (client) return client
  const r = await fetch('/api/customer-config', {cache:'no-store'})
  const config = await r.json()
  if (!r.ok || !config.url || !config.key) throw new Error('고객 서비스 연결을 준비하고 있어요. 잠시 후 다시 접속해 주세요.')
  client = createClient(config.url,config.key,{auth:{storageKey:'mp-customer-v1-auth',persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}})
  return client
}
export async function operatorFetch(input:RequestInfo|URL,init?:RequestInit) {
  const c = await customerClient()
  const {data} = await c.auth.getSession()
  const headers = new Headers(init?.headers)
  if (data.session) headers.set('Authorization','Bearer '+data.session.access_token)
  return fetch(input,{...init,headers})
}
export function kst(iso:string|null) {
  return iso ? new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(iso)) : '예약 시간 미정'
}
export function localKst(iso:string|null) { return iso ? new Date(new Date(iso).getTime()+9*3600000).toISOString().slice(0,16) : '' }
export function fromKst(value:string) { return value ? new Date(value+':00+09:00').toISOString() : null }
export function validateVideo(file:Pick<File,'size'|'type'>) {
  if (!['video/mp4','video/webm','video/quicktime'].includes(file.type)) return 'MP4·MOV·WebM 영상 파일을 선택해 주세요.'
  if (file.size===0 || file.size>MAX_VIDEO_BYTES) return '영상은 0바이트보다 크고 100MB 이하여야 해요.'
  return null
}
