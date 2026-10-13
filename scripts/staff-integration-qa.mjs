// Functional integration QA with real operator/customer JWTs. Private state remains outside Git.
import fs from 'node:fs/promises'
import crypto from 'node:crypto'
import assert from 'node:assert/strict'
import {Upload} from 'tus-js-client'
const state=JSON.parse(await fs.readFile(process.argv[2],'utf8'))
const bytes=await fs.readFile(process.argv[3]),[a,b]=state.customers,checks=[],records=[]
const marker=crypto.randomUUID().slice(0,8)
async function api(path,user,body,method=body===undefined?'GET':'POST'){
 const r=await fetch(state.url+path,{method,signal:AbortSignal.timeout(20000),headers:{apikey:state.anon,Authorization:'Bearer '+(user?.access_token||state.anon),'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)})
 const text=await r.text();let data;try{data=JSON.parse(text)}catch{data=null};return{ok:r.ok,status:r.status,data}
}
const rest=(p,u,data,method)=>api('/rest/v1/'+p,u,data,method)
function passed(label,ok){assert.ok(ok,label);checks.push(label);console.log('PASS:',label)}
async function upload(user,owner=user.id){
 const path=owner+'/'+crypto.randomUUID()+'.mp4'
 await new Promise((resolve,reject)=>{const task=new Upload(bytes,{endpoint:state.url+'/storage/v1/upload/resumable',chunkSize:6*1024*1024,retryDelays:[0,1000,3000],uploadDataDuringCreation:true,removeFingerprintOnSuccess:true,headers:{authorization:'Bearer '+user.access_token},metadata:{bucketName:'mp-v1-videos',objectName:path,contentType:'video/mp4',cacheControl:'3600'},onSuccess:resolve,onError:reject});task.start()})
 return path
}
const customerVideo=(await rest('mp_v1_posts?owner_id=eq.'+a.id+'&limit=1',a)).data[0].video_path
for(const user of state.users){
 const name=user.login_id,identity=(await api('/auth/v1/user',user)).data
 passed(name+' authenticates with highest operator role',identity.id===user.id&&identity.app_metadata.mp_role==='operator'&&identity.app_metadata.mp_access==='owner')
 const ownPath=await upload(user);passed(name+' uploads private video via the production TUS SDK',ownPath.startsWith(user.id+'/'))
 const payload={p_id:crypto.randomUUID(),p_version:0,p_title:'QA API '+name+' 통합검증 '+marker,p_body:'Controlled QA only; no SNS posting.',p_channels:['youtube','instagram','tiktok','threads'],p_video_path:ownPath,p_scheduled_at:'2026-10-23T01:30:00Z'}
 let r=await rest('rpc/mp_v1_save_post',user,payload);passed(name+' saves own video and KST reservation',r.ok&&r.data.owner_id===user.id&&r.data.status==='draft'&&r.data.scheduled_at==='2026-10-23T01:30:00+00:00');let post=r.data;records.push({id:post.id,owner:user.id,actor:user.id,kind:'own',operator:name,title:post.title})
 r=await rest('rpc/mp_v1_transition',user,{p_id:post.id,p_version:post.version,p_action:'submit'});passed(name+' requests approval on own post',r.ok&&r.data.status==='review');post=r.data
 r=await rest('rpc/mp_v1_transition',user,{p_id:post.id,p_version:post.version-1,p_action:'approve'});passed(name+' rejects stale approval',!r.ok)
 r=await rest('rpc/mp_v1_transition',user,{p_id:post.id,p_version:post.version,p_action:'approve'});passed(name+' explicitly approves own reservation',r.ok&&r.data.status==='approved'&&!!r.data.approved_at);post=r.data
 passed(name+' reads persisted approved own post',(await rest('mp_v1_posts?id=eq.'+post.id,user)).data[0].status==='approved')
 r=await api('/storage/v1/object/sign/mp-v1-videos/'+ownPath,user,{expiresIn:60});passed(name+' reads own private uploaded video',r.ok)
 const ownHistory=(await rest('mp_v1_events?post_id=eq.'+post.id+'&order=id',user)).data
 passed(name+' records own actor on save and approval',ownHistory.length===3&&ownHistory.every(e=>e.actor_id===user.id&&e.owner_id===user.id))
 r=await rest('rpc/mp_v1_transition',user,{p_id:post.id,p_version:post.version,p_action:'cancel'});passed(name+' cancels own QA reservation with history retained',r.ok&&r.data.status==='cancelled')
 const foreign={...payload,p_id:crypto.randomUUID(),p_title:'QA API 고객 A '+name+' 관리 '+marker,p_video_path:customerVideo,p_scheduled_at:null,p_channels:['youtube']}
 r=await rest('rpc/mp_v1_save_post',a,foreign);assert.ok(r.ok);post=r.data;records.push({id:post.id,owner:a.id,actor:user.id,kind:'customer',operator:name,title:post.title})
 passed(name+' reads customer draft',(await rest('mp_v1_posts?id=eq.'+post.id,user)).data.length===1)
 const replacement=await upload(user,a.id);passed(name+' uploads replacement to the customer folder',replacement.startsWith(a.id+'/'))
 r=await rest('rpc/mp_v1_save_post',user,{...foreign,p_id:post.id,p_version:post.version,p_title:foreign.p_title+' 수정',p_video_path:replacement,p_scheduled_at:'2026-10-23T05:30:00Z',p_channels:['youtube','instagram']});passed(name+' edits customer video/content/time while retaining customer owner',r.ok&&r.data.owner_id===a.id&&r.data.video_path===replacement);post=r.data
 r=await api('/storage/v1/object/sign/mp-v1-videos/'+replacement,a,{expiresIn:60});passed(name+' replacement remains accessible by the customer',r.ok)
 r=await api('/storage/v1/object/sign/mp-v1-videos/'+replacement,b,{expiresIn:60});passed(name+' replacement remains private from other customers',!r.ok)
 r=await rest('rpc/mp_v1_transition',user,{p_id:post.id,p_version:post.version,p_action:'submit'});passed(name+' requests approval of edited customer post',r.ok&&r.data.status==='review');post=r.data
 r=await rest('rpc/mp_v1_transition',user,{p_id:post.id,p_version:post.version,p_action:'withdraw'});passed(name+' withdraws approval to allow revision',r.ok&&r.data.status==='draft');post=r.data
 r=await rest('rpc/mp_v1_transition',user,{p_id:post.id,p_version:post.version,p_action:'submit'});assert.ok(r.ok);post=r.data
 r=await rest('rpc/mp_v1_transition',user,{p_id:post.id,p_version:post.version,p_action:'approve'});passed(name+' approves customer reservation',r.ok&&r.data.status==='approved'&&r.data.owner_id===a.id);post=r.data
 const history=(await rest('mp_v1_events?post_id=eq.'+post.id+'&order=id',a)).data
 passed(name+' customer sees actual operator audit history',history.length===6&&history[0].actor_id===a.id&&history.slice(1).every(e=>e.actor_id===user.id&&e.owner_id===a.id))
 passed(name+' foreign customer cannot see managed history',(await rest('mp_v1_events?post_id=eq.'+post.id,b)).data.length===0)
 r=await rest('rpc/mp_v1_transition',user,{p_id:post.id,p_version:post.version,p_action:'cancel'});passed(name+' cancels managed QA reservation without deleting history',r.ok&&r.data.status==='cancelled')
 const publish=await fetch('https://sns-auto-flow.vercel.app/api/publish',{method:'POST',headers:{Authorization:'Bearer '+user.access_token,'Content-Type':'application/json'},body:'{}'});passed(name+' real SNS publish remains disabled',publish.status===503)
}
const result={at:new Date().toISOString(),method:'Production Supabase JWT + production TUS upload SDK + validated RPCs; this is separate from browser UI verification',passed:checks.length,checks,records:records.map(r=>({kind:r.kind,operator:r.operator,status:'cancelled'})),actualSnsPublish:false,qaReservationsCancelled:true}
await fs.writeFile(new URL('../docs/staff-integration-qa.json',import.meta.url),JSON.stringify(result,null,2)+'\n')
