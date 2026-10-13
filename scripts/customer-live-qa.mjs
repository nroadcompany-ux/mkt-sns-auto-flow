// Run only against the explicitly selected V1 project. State/credentials stay outside Git.
import fs from 'node:fs/promises'
import crypto from 'node:crypto'
import assert from 'node:assert/strict'
const stateFile=process.argv[2],videoFile=process.argv[3]
if(!stateFile||!videoFile)throw new Error('Pass a private state JSON and a QA video path.')
const state=JSON.parse(await fs.readFile(stateFile,'utf8'))
const headers=token=>({apikey:state.public,Authorization:'Bearer '+token,'Content-Type':'application/json',Connection:'close'})
async function request(path,{method='GET',body,token=state.service,raw=false}={}){
 const r=await fetch(state.url+path,{method,signal:AbortSignal.timeout(20000),headers:raw?{apikey:state.public,Authorization:'Bearer '+token,'Content-Type':'video/mp4'}:headers(token),body:body===undefined?undefined:raw?body:JSON.stringify(body)})
 const text=await r.text();let data;try{data=JSON.parse(text)}catch{data={message:'non-json response'}}
 return {ok:r.ok,status:r.status,data}
}
function success(r){assert.equal(r.ok,true,'Expected successful QA operation (HTTP '+r.status+')');return r.data}
async function rest(path,options={}){return request('/rest/v1/'+path,options)}
const checks=[]
function check(name){checks.push(name);console.log('PASS:',name)}
if(!state.users){
 state.users=[]
 for(const label of ['A','B']){
  const password=crypto.randomBytes(24).toString('base64url'),email='mp-v1-qa-'+label.toLowerCase()+'-'+Date.now()+'@marketingplay.test'
  const user=success(await request('/auth/v1/admin/users',{method:'POST',body:{email,password,email_confirm:true,user_metadata:{qa:true,label:'고객 V1 검토 '+label}}}))
  state.users.push({id:user.id,email,password,label})
 }
 await fs.writeFile(stateFile,JSON.stringify(state),{mode:0o600})
}
for(const u of state.users){
 const s=success(await request('/auth/v1/token?grant_type=password',{method:'POST',token:state.public,body:{email:u.email,password:u.password}}))
 u.token=s.access_token
 check('Customer '+u.label+' signs in')
 const pr=await request('/rest/v1/mp_v1_profiles',{method:'POST',token:u.token,body:{id:u.id,shop_name:'QA 검토 매장 '+u.label,industry:'검토용 · 실제 게시 없음'}})
 if(!pr.ok&&pr.status!==409)success(pr)
}
await fs.writeFile(stateFile,JSON.stringify(state),{mode:0o600})
const [a,b]=state.users,bytes=await fs.readFile(videoFile),path=a.id+'/'+crypto.randomUUID()+'.mp4'
success(await request('/storage/v1/object/mp-v1-videos/'+path,{method:'POST',token:a.token,body:bytes,raw:true}))
check('Private video uploads with customer token')
let post=success(await rest('rpc/mp_v1_save_post',{method:'POST',token:a.token,body:{p_id:crypto.randomUUID(),p_version:0,p_title:'QA API 검토 · 게시하지 않음',p_body:'계정 격리와 승인 상태 검증용 영상입니다.',p_channels:['youtube','instagram','tiktok','threads'],p_video_path:path,p_scheduled_at:null}}))
check('Draft persists in Supabase')
const own=success(await rest('mp_v1_posts?id=eq.'+post.id,{token:a.token}));assert.equal(own.length,1)
assert.equal(success(await rest('mp_v1_posts?id=eq.'+post.id,{token:b.token})).length,0)
check('Customer B cannot read customer A post')
assert.equal((await rest('mp_v1_posts',{token:state.public})).ok,false)
check('Anonymous data reads are denied')
assert.equal((await rest('mp_v1_profiles?id=eq.'+a.id,{method:'PATCH',token:b.token,body:{shop_name:'forbidden'}})).ok,true)
const protectedProfile=success(await rest('mp_v1_profiles?id=eq.'+a.id,{token:a.token}));assert.equal(protectedProfile[0].shop_name,'QA 검토 매장 A')
check('Foreign profile update cannot change data')
assert.equal((await request('/storage/v1/object/sign/mp-v1-videos/'+path,{method:'POST',token:b.token,body:{expiresIn:60}})).ok,false)
check('Customer B cannot obtain A video URL')
assert.equal((await request('/storage/v1/object/mp-v1-videos/'+a.id+'/'+crypto.randomUUID()+'.mp4',{method:'POST',token:b.token,body:bytes,raw:true})).ok,false)
check('Foreign-folder upload is denied')
assert.equal((await rest('mp_v1_posts?id=eq.'+post.id,{method:'PATCH',token:a.token,body:{status:'approved'}})).ok,false)
check('Direct status forgery is denied')
assert.equal((await rest('rpc/mp_v1_transition',{method:'POST',token:a.token,body:{p_id:post.id,p_version:post.version,p_action:'submit'}})).ok,false)
check('Approval request without reservation is rejected')
const future=new Date(Date.now()+48*3600000).toISOString()
post=success(await rest('rpc/mp_v1_save_post',{method:'POST',token:a.token,body:{p_id:post.id,p_version:post.version,p_title:post.title,p_body:post.body,p_channels:post.channels,p_video_path:path,p_scheduled_at:future}}))
check('Reservation persists as a UTC instant')
assert.equal((await rest('rpc/mp_v1_save_post',{method:'POST',token:b.token,body:{p_id:post.id,p_version:post.version,p_title:'forbidden',p_body:'',p_channels:['youtube'],p_video_path:path,p_scheduled_at:future}})).ok,false)
check('Foreign draft overwrite is denied')
const previous=post.version
post=success(await rest('rpc/mp_v1_transition',{method:'POST',token:a.token,body:{p_id:post.id,p_version:post.version,p_action:'submit'}}));assert.equal(post.status,'review')
assert.equal((await rest('rpc/mp_v1_transition',{method:'POST',token:a.token,body:{p_id:post.id,p_version:previous,p_action:'approve'}})).ok,false)
check('Stale concurrent approval is rejected')
post=success(await rest('rpc/mp_v1_transition',{method:'POST',token:a.token,body:{p_id:post.id,p_version:post.version,p_action:'approve'}}));assert.equal(post.status,'approved');assert.equal(new Date(post.scheduled_at).getTime(),new Date(future).getTime())
check('Explicit approval records reservation and approval time')
assert.equal((await rest('rpc/mp_v1_save_post',{method:'POST',token:a.token,body:{p_id:post.id,p_version:post.version,p_title:'changed',p_body:'',p_channels:['youtube'],p_video_path:path,p_scheduled_at:future}})).ok,false)
check('Approved content cannot be silently edited')
assert.equal(success(await rest('mp_v1_events?post_id=eq.'+post.id,{token:b.token})).length,0)
const history=success(await rest('mp_v1_events?post_id=eq.'+post.id+'&order=id',{token:a.token}));assert.deepEqual(history.map(h=>h.action),['saved','saved','submit','approve'])
check('Event history is append-only and tenant-isolated')
post=success(await rest('rpc/mp_v1_transition',{method:'POST',token:a.token,body:{p_id:post.id,p_version:post.version,p_action:'cancel'}}));assert.equal(post.status,'cancelled')
check('Cancel preserves the QA record')
const report={at:new Date().toISOString(),project:'sns-auto-flow',checks,passed:checks.length,actualSnsPublish:false}
await fs.writeFile(new URL('../docs/live-qa.json',import.meta.url),JSON.stringify(report,null,2)+'\n')
console.log(checks.length+' live checks passed. No external SNS posts or real customer records changed.')
