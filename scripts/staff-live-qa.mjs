// Receives short-lived sessions from a private file outside Git. Never logs credentials.
import fs from 'node:fs/promises'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
const state=JSON.parse(await fs.readFile(process.argv[2],'utf8'))
const [alex,david]=state.users,[a,b]=state.customers,checks=[]
async function api(path,user,body,method=body===undefined?'GET':'POST'){
 const r=await fetch(state.url+path,{method,headers:{apikey:state.anon,Authorization:'Bearer '+(user?.access_token||state.anon),'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(20000)})
 const raw=await r.text();return {ok:r.ok,status:r.status,data:raw?JSON.parse(raw):null}
}
const rest=(path,user,body,method)=>api('/rest/v1/'+path,user,body,method)
function check(label,condition){assert.ok(condition,label);checks.push(label);console.log('PASS:',label)}
for(const u of [alex,david]){
 const r=await api('/auth/v1/user',u);check(u.login_id+' has server-managed highest operator role',r.ok&&r.data.app_metadata.mp_role==='operator'&&r.data.app_metadata.mp_access==='owner')
 check(u.login_id+' is recognized by database owner predicate',(await rest('rpc/mp_v1_is_owner',u,{})).data===true)
}
check('Ordinary customer is not an owner',(await rest('rpc/mp_v1_is_owner',a,{})).data===false)
const customerPosts=(await rest('mp_v1_posts?owner_id=eq.'+a.id,a)).data
check('QA customer fixture exists',customerPosts.length>0)
for(const u of [alex,david]){
 const r=await rest('mp_v1_posts?owner_id=eq.'+a.id,u)
 check(u.login_id+' reads customer contents',r.ok&&r.data.length===customerPosts.length)
 const v=await api('/storage/v1/object/sign/mp-v1-videos/'+customerPosts[0].video_path,u,{expiresIn:60})
 check(u.login_id+' can preview customer video',v.ok)
}
check('Ordinary customer remains isolated',(await rest('mp_v1_posts?owner_id=eq.'+a.id,b)).data.length===0)
check('Anonymous cannot read content',!(await rest('mp_v1_posts',null)).ok)
const fixture=customerPosts[0],save={p_id:crypto.randomUUID(),p_version:0,p_title:'QA 운영진 권한 검증 · 실제 게시 없음',p_body:'운영진 수정·승인과 처리자 기록 확인용입니다.',p_channels:['youtube'],p_video_path:fixture.video_path,p_scheduled_at:new Date(Date.now()+72*3600000).toISOString()}
let r=await rest('rpc/mp_v1_save_post',a,save);check('Customer creates controlled QA draft',r.ok);let post=r.data
r=await rest('rpc/mp_v1_save_post',alex,{...save,p_id:post.id,p_version:post.version,p_title:'QA 운영진 수정 검증 · 실제 게시 없음'});check('Alex edits customer draft without transferring ownership',r.ok&&r.data.owner_id===a.id);post=r.data
r=await rest('rpc/mp_v1_transition',b,{p_id:post.id,p_version:post.version,p_action:'submit'});check('Foreign customer cannot operate on draft',!r.ok)
r=await rest('mp_v1_posts?id=eq.'+post.id,alex,{status:'approved'},'PATCH');check('Highest operator still uses validated workflow',!r.ok)
r=await rest('rpc/mp_v1_transition',alex,{p_id:post.id,p_version:post.version,p_action:'submit'});check('Alex submits customer draft',r.ok&&r.data.status==='review');post=r.data
r=await rest('rpc/mp_v1_transition',david,{p_id:post.id,p_version:post.version,p_action:'approve'});check('David approves customer reservation',r.ok&&r.data.status==='approved'&&r.data.owner_id===a.id);post=r.data
const events=(await rest('mp_v1_events?post_id=eq.'+post.id+'&order=id',a)).data
check('Customer retains history with actual operator actors',events.length===4&&events.every(x=>x.owner_id===a.id)&&events[1].actor_id===alex.id&&events[3].actor_id===david.id)
r=await rest('rpc/mp_v1_transition',alex,{p_id:post.id,p_version:post.version,p_action:'cancel'});check('QA reservation cancelled with history retained',r.ok&&r.data.status==='cancelled')
// This changes only the fake QA customer's user-editable metadata, then restores it.
const before=(await api('/auth/v1/user',b)).data.user_metadata
try {
 const forged=await api('/auth/v1/user',b,{data:{...before,mp_role:'operator',mp_access:'owner'}},'PUT');check('QA metadata forgery submitted for negative test',forged.ok)
 check('User metadata cannot grant highest permissions',(await rest('rpc/mp_v1_is_owner',b,{})).data===false&&(await rest('mp_v1_posts?owner_id=eq.'+a.id,b)).data.length===0)
}finally{await api('/auth/v1/user',b,{data:{...before,mp_role:null,mp_access:null}},'PUT')}
const report={at:new Date().toISOString(),passed:checks.length,checks,actualSnsPublish:false,customerIsolation:true}
await fs.writeFile(new URL('../docs/staff-live-qa.json',import.meta.url),JSON.stringify(report,null,2)+'\n')
