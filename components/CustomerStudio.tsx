'use client'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { Upload } from 'tus-js-client'
import { BUCKET, CHANNELS, STATUS, customerClient, fromKst, kst, localKst, validateVideo, type Post, type Profile } from '@/lib/customer'
import './customer.css'

type View='home'|'new'|'library'|'schedule'|'connections'|'brand'
const NAV:[View,string,string][]=[['home','홈','⌂'],['new','영상 등록','＋'],['library','내 콘텐츠','▤'],['schedule','예약 일정','▦'],['connections','SNS 채널','◎'],['brand','내 브랜드','◇']]
type EventRow={id:number;action:string;version:number;happened_at:string}
const EVENTS:Record<string,string>={saved:'초안 저장',submit:'승인 요청',approve:'승인 완료',withdraw:'승인 요청 회수',cancel:'예약·콘텐츠 취소'}
const message=(error:unknown)=>error instanceof Error?error.message:typeof error==='object'&&error&&'message' in error?String(error.message):'처리하지 못했어요. 잠시 후 다시 시도해 주세요.'

export default function CustomerStudio() {
  const [client,setClient]=useState<SupabaseClient|null>(null), [session,setSession]=useState<Session|null>(null)
  const [initializing,setInitializing]=useState(true),[authMode,setAuthMode]=useState<'login'|'signup'|'recovery'>('login')
  const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[authBusy,setAuthBusy]=useState(false)
  const [view,setView]=useState<View>('home'),[posts,setPosts]=useState<Post[]>([]),[profile,setProfile]=useState<Profile|null>(null)
  const [loading,setLoading]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false)
  const [active,setActive]=useState<Post|null>(null),[title,setTitle]=useState(''),[body,setBody]=useState('')
  const [channels,setChannels]=useState<string[]>(['youtube','instagram','tiktok','threads']),[scheduled,setScheduled]=useState('')
  const [videoPath,setVideoPath]=useState(''),[videoUrl,setVideoUrl]=useState(''),[fileName,setFileName]=useState('')
  const [uploadProgress,setUploadProgress]=useState<number|null>(null),[events,setEvents]=useState<EventRow[]>([])
  const [filter,setFilter]=useState('all'),[shop,setShop]=useState(''),[industry,setIndustry]=useState(''),[brandNote,setBrandNote]=useState('')
  const uploadRef=useRef<Upload|null>(null),fileInput=useRef<HTMLInputElement|null>(null),userRef=useRef<string|null>(null)
  const signedRef=useRef(0)

  useEffect(()=>{
    let live=true,unsub:(()=>void)|undefined
    customerClient().then(async c=>{
      if(!live)return
      setClient(c)
      const {data:listener}=c.auth.onAuthStateChange((event,s)=>{
        if(!live)return
        setSession(s)
        if(event==='PASSWORD_RECOVERY')setAuthMode('recovery')
      })
      unsub=()=>listener.subscription.unsubscribe()
      const {data,error:authError}=await c.auth.getSession()
      if(!live)return
      if(authError)setError('로그인을 다시 진행해 주세요.')
      setSession(data.session);setInitializing(false)
    }).catch(e=>{if(live){setError(message(e));setInitializing(false)}})
    return()=>{live=false;unsub?.();void uploadRef.current?.abort()}
  },[])

  useEffect(()=>{
    const id=session?.user.id??null
    if(userRef.current===id)return
    userRef.current=id;signedRef.current++
    setPosts([]);setProfile(null);setView('home');clearEditor();setError('');setNotice('')
    if(!client||!id)return
    let live=true
    setLoading(true)
    Promise.all([
      client.from('mp_v1_posts').select('*').order('created_at',{ascending:false}),
      client.from('mp_v1_profiles').select('*').eq('id',id).maybeSingle(),
    ]).then(async ([p,b])=>{
      if(!live)return
      if(p.error)throw p.error;if(b.error)throw b.error
      setPosts(p.data??[])
      let row=b.data
      if(!row){const r=await client.from('mp_v1_profiles').upsert({id},{onConflict:'id',ignoreDuplicates:true}).select().maybeSingle();if(r.error)throw r.error;row=r.data}
      if(live&&row){setProfile(row);setShop(row.shop_name);setIndustry(row.industry);setBrandNote(row.brand_note)}
    }).catch(e=>{if(live)setError(message(e))}).finally(()=>{if(live)setLoading(false)})
    return()=>{live=false}
  },[client,session?.user.id])

  function clearEditor(){setActive(null);setTitle('');setBody('');setChannels(['youtube','instagram','tiktok','threads']);setScheduled('');setVideoPath('');setVideoUrl('');setFileName('');setEvents([]);setUploadProgress(null)}
  function navigate(next:View){if(uploadProgress!==null){setError('영상 업로드를 완료하거나 취소한 뒤 이동해 주세요.');return}setError('');setNotice('');if(next==='new'){clearEditor();signedRef.current++}setView(next)}
  async function refresh(){if(!client||!session)return;setLoading(true);try{const r=await client.from('mp_v1_posts').select('*').order('created_at',{ascending:false});if(r.error)throw r.error;setPosts(r.data??[])}catch(e){setError(message(e))}finally{setLoading(false)}}
  async function authenticate(e:FormEvent){
    e.preventDefault();if(!client)return;setAuthBusy(true);setError('');setNotice('')
    try{
      if(authMode==='recovery'){
        if(password.length<12)throw new Error('새 비밀번호는 12자 이상으로 입력해 주세요.')
        const r=await client.auth.updateUser({password});if(r.error)throw r.error;setAuthMode('login');setPassword('');setNotice('비밀번호를 변경했어요.');return
      }
      if(authMode==='signup'){
        if(password.length<12)throw new Error('비밀번호는 12자 이상으로 입력해 주세요.')
        const r=await client.auth.signUp({email,password,options:{emailRedirectTo:window.location.origin}})
        if(r.error)throw r.error
        if(!r.data.session)setNotice('이메일로 보낸 확인 링크를 눌러 가입을 완료해 주세요. 확인 후 로그인할 수 있어요.')
      }else{const r=await client.auth.signInWithPassword({email,password});if(r.error)throw new Error('이메일·비밀번호 또는 이메일 인증 여부를 확인해 주세요.')}
      setPassword('')
    }catch(e){setError(message(e))}finally{setAuthBusy(false)}
  }
  async function resetPassword(){if(!client||!email.trim()){setError('이메일을 먼저 입력해 주세요.');return}setAuthBusy(true);setError('');try{const r=await client.auth.resetPasswordForEmail(email,{redirectTo:window.location.origin});if(r.error)throw r.error;setNotice('등록된 이메일이라면 비밀번호 재설정 링크를 보냈어요.')}catch(e){setError(message(e))}finally{setAuthBusy(false)}}
  async function logout(){if(uploadRef.current){await uploadRef.current.abort();uploadRef.current=null}setUploadProgress(null);signedRef.current++;const r=await client?.auth.signOut();if(r?.error){setError('로그아웃을 다시 시도해 주세요.');return}setSession(null);clearEditor();setPassword('')}

  async function selectPost(post:Post){
    if(uploadProgress!==null)return
    setActive(post);setTitle(post.title);setBody(post.body);setChannels(post.channels);setScheduled(localKst(post.scheduled_at));setVideoPath(post.video_path);setFileName('저장한 영상');setVideoUrl('');setEvents([]);setView('new');setError('');setNotice('')
    const seq=++signedRef.current
    if(!client)return
    const [v,h]=await Promise.all([client.storage.from(BUCKET).createSignedUrl(post.video_path,3600),client.from('mp_v1_events').select('id,action,version,happened_at').eq('post_id',post.id).order('id',{ascending:false})])
    if(seq!==signedRef.current)return
    if(v.error)setError('영상 미리보기를 불러오지 못했어요. 콘텐츠를 다시 열어 주세요.');else setVideoUrl(v.data.signedUrl)
    if(h.error)setError(message(h.error));else setEvents(h.data??[])
  }
  async function uploadFile(file:File){
    if(!client||!session||busy||uploadProgress!==null||active&&active.status!=='draft')return
    setError('');setNotice('');const invalid=validateVideo(file);if(invalid){setError(invalid);return}
    const originalUser=session.user.id
    const {data}=await client.auth.getSession();if(!data.session){setError('다시 로그인해 주세요.');return}
    const extension=file.type==='video/quicktime'?'mov':file.type==='video/webm'?'webm':'mp4'
    const path=`${originalUser}/${crypto.randomUUID()}.${extension}`
    const base=(client as unknown as {supabaseUrl:string}).supabaseUrl
    const upload=new Upload(file,{
      endpoint:base+'/storage/v1/upload/resumable',chunkSize:6*1024*1024,retryDelays:[0,1000,3000,5000],uploadDataDuringCreation:true,removeFingerprintOnSuccess:true,
      headers:{authorization:'Bearer '+data.session.access_token},
      metadata:{bucketName:BUCKET,objectName:path,contentType:file.type,cacheControl:'3600'},
      onProgress:(sent,total)=>{if(userRef.current===originalUser)setUploadProgress(Math.round(sent/total*100))},
      onError:()=>{uploadRef.current=null;setUploadProgress(null);setError('영상 업로드에 실패했어요. 연결을 확인하고 다시 선택해 주세요.')},
      onSuccess:async()=>{
        uploadRef.current=null;setUploadProgress(null)
        if(userRef.current!==originalUser)return
        setVideoPath(path);setFileName(file.name)
        const v=await client.storage.from(BUCKET).createSignedUrl(path,3600)
        if(userRef.current!==originalUser)return
        if(v.error)setError('업로드는 완료됐지만 미리보기를 불러오지 못했어요. 초안을 저장한 뒤 다시 열어 주세요.')
        else setVideoUrl(v.data.signedUrl)
        setNotice('영상 업로드 완료. 제목과 예약 시간을 입력한 뒤 초안을 저장해 주세요.')
      },
    })
    uploadRef.current=upload;setUploadProgress(0);upload.start()
  }
  async function savePost(e:FormEvent){
    e.preventDefault();if(!client||busy)return;setBusy(true);setError('');setNotice('')
    try{
      if(!videoPath)throw new Error('영상을 먼저 업로드해 주세요.')
      const r=await client.rpc('mp_v1_save_post',{p_id:active?.id??crypto.randomUUID(),p_version:active?.version??0,p_title:title.trim(),p_body:body,p_channels:channels,p_video_path:videoPath,p_scheduled_at:fromKst(scheduled)})
      if(r.error)throw r.error
      const row=r.data as Post;await refresh();await selectPost(row);setNotice('초안과 예약 시간을 저장했어요. 내용을 확인한 뒤 승인을 요청해 주세요.')
    }catch(e){setError(message(e))}finally{setBusy(false)}
  }
  async function transition(action:string){
    if(!client||!active||busy)return
    if(action==='cancel'&&!window.confirm('이 콘텐츠와 예약을 취소할까요? 기록은 남습니다.'))return
    setBusy(true);setError('');setNotice('')
    try{const r=await client.rpc('mp_v1_transition',{p_id:active.id,p_version:active.version,p_action:action});if(r.error)throw r.error;await refresh();await selectPost(r.data as Post);setNotice(action==='approve'?'승인과 예약 저장을 완료했어요. SNS 연결 준비 중으로 실제 게시는 실행되지 않습니다.':action==='submit'?'저장한 내용의 승인을 요청했어요. 아래에서 최종 승인해 주세요.':action==='withdraw'?'승인 요청을 회수했어요. 다시 수정할 수 있습니다.':'콘텐츠와 예약을 취소했어요.')}catch(e){setError(message(e))}finally{setBusy(false)}
  }
  async function saveBrand(e:FormEvent){e.preventDefault();if(!client||!session)return;setBusy(true);setError('');try{const r=await client.from('mp_v1_profiles').upsert({id:session.user.id,shop_name:shop.trim(),industry:industry.trim(),brand_note:brandNote,updated_at:new Date().toISOString()}).select().single();if(r.error)throw r.error;setProfile(r.data);setNotice('브랜드 정보를 저장했어요.')}catch(e){setError(message(e))}finally{setBusy(false)}}
  async function download(){if(!client||!videoPath)return;setBusy(true);const user=userRef.current;try{const name='marketing-video.'+(videoPath.split('.').pop()||'mp4');const r=await client.storage.from(BUCKET).createSignedUrl(videoPath,60,{download:name});if(r.error)throw r.error;if(userRef.current!==user)return;const a=document.createElement('a');a.href=r.data.signedUrl;a.download=name;document.body.appendChild(a);a.click();a.remove()}catch(e){setError(message(e))}finally{setBusy(false)}}
  const changed=!!active&&(title!==active.title||body!==active.body||scheduled!==localKst(active.scheduled_at)||videoPath!==active.video_path||channels.join(',')!==active.channels.join(','))
  const editable=!active||active.status==='draft'
  const saved=posts.filter(p=>p.status!=='cancelled'),approved=posts.filter(p=>p.status==='approved'),review=posts.filter(p=>p.status==='review')
  const schedule=posts.filter(p=>p.scheduled_at&&p.status!=='cancelled').sort((a,b)=>new Date(a.scheduled_at!).getTime()-new Date(b.scheduled_at!).getTime())

  const alerts=<>{error&&<div className="cv-alert error" role="alert">{error}</div>}{notice&&<div className="cv-alert success" role="status">{notice}</div>}</>
  if(initializing)return <main className="cv-app cv-loading">마케팅플레이를 준비하고 있어요…</main>
  if(!session||authMode==='recovery')return <main className="cv-app cv-auth"><section className="cv-auth-story"><a className="cv-logo" href="/"><span>MP</span>마케팅플레이 오토 <small>V1</small></a><div><span className="cv-eyebrow">내 가게의 다음 소식</span><h1>영상 하나로,<br/>홍보 준비를<br/><em>가볍게.</em></h1><p>영상을 올리고, 내용을 확인하고,<br/>게시할 일정을 한곳에 모으세요.</p><div className="cv-channel-row">{CHANNELS.map(c=><span key={c.id} style={{color:c.color}}>{c.symbol} {c.name.split(' ')[0]}</span>)}</div></div><p className="cv-auth-foot">고객용 V1 · SNS 게시 연결 준비 중</p></section><section className="cv-auth-form"><div className="cv-auth-card"><span className="cv-pill">CUSTOMER WORKSPACE</span><h2>{authMode==='signup'?'내 가게의 공간 만들기':authMode==='recovery'?'비밀번호 재설정':'다시 만나서 반가워요'}</h2><p>{authMode==='signup'?'이메일 인증 후 내 콘텐츠를 안전하게 보관하세요.':'내 계정으로 로그인해 콘텐츠를 이어서 준비하세요.'}</p>{alerts}<form onSubmit={authenticate}>{authMode!=='recovery'&&<label>이메일<input type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="이메일 주소"/></label>}<label>{authMode==='recovery'?'새 비밀번호':'비밀번호'}<input type="password" autoComplete={authMode==='login'?'current-password':'new-password'} required minLength={authMode==='login'?1:12} value={password} onChange={e=>setPassword(e.target.value)} placeholder={authMode==='login'?'비밀번호':'12자 이상'}/></label><button className="cv-primary wide" disabled={authBusy||!client}>{authBusy?'처리 중…':authMode==='signup'?'계정 만들기':authMode==='recovery'?'비밀번호 변경':'로그인'} <span>→</span></button></form>{authMode!=='recovery'&&<div className="cv-auth-actions"><button disabled={authBusy} onClick={()=>{setAuthMode(authMode==='login'?'signup':'login');setError('');setNotice('')}}>{authMode==='login'?'처음이신가요? 계정 만들기':'이미 계정이 있어요'}</button>{authMode==='login'&&<button disabled={authBusy} onClick={resetPassword}>비밀번호 찾기</button>}</div>}<div className="cv-small-note">영상과 콘텐츠는 내 계정에 저장됩니다.<br/>V1에서는 실제 SNS 게시를 실행하지 않아요.</div></div></section></main>

  return <div className="cv-app cv-shell"><aside className="cv-sidebar"><a className="cv-logo" href="/"><span>MP</span><div>마케팅플레이<small>오토 · 고객용 V1</small></div></a><div className="cv-shop"><span className="cv-shop-icon">◇</span><div><b>{profile?.shop_name||'나의 브랜드'}</b><small>{profile?.industry||'브랜드 정보를 등록해 주세요'}</small></div></div><nav aria-label="마케팅 메뉴">{NAV.map(([id,name,icon])=><button key={id} className={view===id?'active':''} onClick={()=>navigate(id)} aria-current={view===id?'page':undefined}><span>{icon}</span>{name}{id==='library'&&saved.length>0&&<small>{saved.length}</small>}</button>)}</nav><div className="cv-sidebar-bottom"><div className="cv-connection-note"><i/>SNS 게시 연결 준비 중<small>승인·예약 저장까지 이용 가능</small></div>{session.user.app_metadata.mp_role==='operator'&&<a href="/studio">운영자 제작 도구 ↗</a>}<button className="cv-logout" onClick={logout}>로그아웃</button></div></aside><div className="cv-workspace"><header className="cv-topbar"><span>마케팅플레이 <span className="cv-divider">/</span> {NAV.find(n=>n[0]===view)?.[1]}</span><span className="cv-top-user">{profile?.shop_name||'내 작업 공간'} <span className="cv-avatar">{(profile?.shop_name||'M').slice(0,1)}</span></span></header><main className="cv-main">{alerts}
    {view==='home'&&<><div className="cv-page-heading"><div><span className="cv-eyebrow">MY MARKETING WORKSPACE</span><h1>{profile?.shop_name?`${profile.shop_name}의 홍보 준비`:'우리 가게의 홍보 준비'}</h1><p>소식을 준비하는 데 필요한 것만 모았어요.</p></div><button className="cv-secondary" disabled={loading} onClick={refresh}>{loading?'불러오는 중…':'목록 새로고침'}</button></div><section className="cv-hero"><div><span className="cv-pill">영상 콘텐츠 준비</span><h2>하나의 영상,<br/>네 채널의 다음 소식.</h2><p>영상과 게시 내용을 등록하고<br/>검토부터 승인·예약 저장까지 한 번에.</p><button className="cv-primary" onClick={()=>navigate('new')}>첫 영상 준비하기 <span>↗</span></button></div><div className="cv-hero-art" aria-hidden="true"><div className="cv-video-card"><div className="cv-art-scene"><span>▶</span><i/><b>우리 가게 이야기</b></div><div className="cv-art-caption"><b>이번 주 새로운 소식</b><span>영상 등록 → 확인 → 예약 저장</span></div></div><div className="cv-art-channels">{CHANNELS.map(c=><span key={c.id} style={{color:c.color}}>{c.symbol}</span>)}</div></div></section><div className="cv-metrics"><button onClick={()=>navigate('library')}><span>저장한 콘텐츠</span><strong>{saved.length}<small>개</small></strong><em>내 계정에 안전하게 보관</em></button><button onClick={()=>{navigate('library');setFilter('review')}}><span>승인 대기</span><strong>{review.length}<small>개</small></strong><em>게시 내용을 확인해 주세요</em></button><button onClick={()=>navigate('schedule')}><span>승인한 예약</span><strong>{approved.length}<small>개</small></strong><em>실제 SNS 게시 연결 준비 중</em></button></div><section className="cv-section"><div className="cv-section-heading"><h2>최근 준비한 콘텐츠</h2><button onClick={()=>navigate('library')}>전체 보기 →</button></div>{loading?<p className="cv-empty">콘텐츠를 불러오고 있어요.</p>:posts.length?postCards(posts.slice(0,3)):<Empty title="첫 번째 가게 소식을 준비해 볼까요?" body="완성한 영상 한 편이면 시작할 수 있어요." action={()=>navigate('new')} label="영상 등록하기"/>}</section><div className="cv-info-strip"><span>ⓘ</span><p><b>SNS 게시 연결은 준비 중이에요.</b> 승인과 예약 시간을 저장할 수 있으며, 실제 자동 게시는 실행되지 않습니다.</p></div></>}
    {view==='new'&&<><div className="cv-page-heading"><div><span className="cv-eyebrow">CONTENT WORKFLOW</span><h1>{active?'콘텐츠 확인':'새 영상 준비하기'}</h1><p>영상과 게시 내용을 저장하고 최종 승인해 주세요.</p></div><button className="cv-secondary" disabled={busy||uploadProgress!==null} onClick={()=>navigate('library')}>내 콘텐츠 보기</button></div><div className="cv-stepper">{['영상 등록','내용·일정 저장','검토·승인'].map((label,i)=><span key={label} className={(i===0&&videoPath||i===1&&active||i===2&&active?.status==='approved')?'done':''}><b>{i+1}</b>{label}</span>)}</div><div className="cv-editor-grid"><form className="cv-panel cv-editor" onSubmit={savePost}><div className="cv-panel-heading"><h2>게시 내용</h2><span className={'cv-status '+(active?.status||'draft')}>{active?STATUS[active.status]:'새 초안'}</span></div><label>영상 파일 <small>MP4·MOV·WebM · 최대 100MB</small></label><input ref={fileInput} type="file" accept="video/mp4,video/webm,video/quicktime" className="cv-hidden-input" aria-label="영상 파일 선택" onChange={e=>{const f=e.target.files?.[0];if(f)void uploadFile(f);e.target.value=''}} disabled={!editable||busy||uploadProgress!==null}/><button type="button" className="cv-dropzone" disabled={!editable||busy||uploadProgress!==null} onClick={()=>fileInput.current?.click()} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();if(editable&&e.dataTransfer.files[0])void uploadFile(e.dataTransfer.files[0])}}><span className="cv-upload-icon">↥</span><b>{uploadProgress!==null?'영상을 업로드하고 있어요':fileName||'영상을 끌어놓거나 선택하세요'}</b><small>{videoPath?'다른 영상을 선택해 교체할 수 있어요':'완성된 가게 소개·상품·이벤트 영상'}</small></button>{uploadProgress!==null&&<div className="cv-upload-progress"><progress value={uploadProgress} max={100}/><span>{uploadProgress}%</span><button type="button" onClick={async()=>{await uploadRef.current?.abort();uploadRef.current=null;setUploadProgress(null);setNotice('업로드를 취소했어요.')}}>업로드 취소</button></div>}<fieldset disabled={!editable||busy}><label>콘텐츠 제목<input required maxLength={100} value={title} onChange={e=>setTitle(e.target.value)} placeholder="예: 이번 주 새로 나온 딸기 라떼"/></label><label>게시 내용<textarea rows={5} maxLength={10000} value={body} onChange={e=>setBody(e.target.value)} placeholder="고객에게 전할 소식과 방문·문의 안내를 적어 주세요."/><small>{body.length.toLocaleString()} / 10,000자</small></label><label>준비할 채널</label><div className="cv-channel-select">{CHANNELS.map(c=><label key={c.id} className={channels.includes(c.id)?'selected':''}><input type="checkbox" checked={channels.includes(c.id)} onChange={e=>setChannels(s=>e.target.checked?[...s,c.id]:s.filter(x=>x!==c.id))}/><span style={{color:c.color}}>{c.symbol}</span>{c.name}</label>)}</div><label>예약 시간 <small>한국 시간 · KST</small><input type="datetime-local" value={scheduled} onChange={e=>setScheduled(e.target.value)}/></label><p className="cv-help">초안은 예약 시간 없이 저장할 수 있어요. 승인 요청에는 채널과 미래의 예약 시간이 필요해요.</p></fieldset>{editable&&<button className="cv-primary wide" disabled={busy||uploadProgress!==null||!videoPath}>{busy?'저장 중…':active?'변경 내용 저장':'초안 저장'} <span>→</span></button>}{active?.status==='review'&&<div className="cv-action-stack"><p>저장한 영상·내용·채널·예약 시간을 확인했나요?</p><button type="button" className="cv-primary wide" disabled={busy} onClick={()=>transition('approve')}>최종 승인하고 예약 저장</button><button type="button" className="cv-secondary wide" disabled={busy} onClick={()=>transition('withdraw')}>승인 요청 회수하고 수정</button></div>}{active?.status==='draft'&&<button type="button" className="cv-secondary wide" disabled={busy||changed||!scheduled||channels.length===0||uploadProgress!==null} onClick={()=>transition('submit')}>저장한 내용 승인 요청</button>}{changed&&<p className="cv-help">변경한 내용을 먼저 저장해 주세요.</p>}{active?.status==='approved'&&<div className="cv-alert success">승인과 예약 저장이 완료됐어요. 실제 SNS 게시 연결은 준비 중입니다.</div>}{active&&active.status!=='cancelled'&&<button type="button" className="cv-text-danger" disabled={busy||uploadProgress!==null} onClick={()=>transition('cancel')}>콘텐츠·예약 취소</button>}</form><aside className="cv-preview-column"><section className="cv-panel"><div className="cv-panel-heading"><h2>영상 미리보기</h2><span className="cv-pill neutral">내 계정 전용</span></div>{videoUrl?<video key={videoUrl} className="cv-preview-video" src={videoUrl} controls preload="metadata"/>:<div className="cv-preview-empty"><span>▷</span><p>영상 업로드 후<br/>여기에서 확인할 수 있어요.</p></div>}<div className="cv-preview-copy"><h3>{title||'콘텐츠 제목'}</h3><p>{body||'고객에게 전할 소식을 적어 주세요.'}</p></div>{videoPath&&<button className="cv-secondary wide" disabled={busy} onClick={download}>원본 영상 다운로드 ↓</button>}</section><section className="cv-panel"><h2>예약 요약</h2><dl className="cv-summary"><div><dt>예약 시간</dt><dd>{scheduled?kst(fromKst(scheduled)):'아직 정하지 않았어요'}</dd></div><div><dt>준비 채널</dt><dd>{channels.length}개</dd></div><div><dt>실제 게시</dt><dd className="cv-pending">연결 준비 중</dd></div></dl><p className="cv-help">V1은 승인·예약 정보를 저장합니다. 네이버 블로그 및 SNS 자동 게시는 다음 연결 단계에서 제공해요.</p></section>{events.length>0&&<section className="cv-panel"><h2>작업 기록</h2><ol className="cv-events">{events.map(e=><li key={e.id}><b>{EVENTS[e.action]||e.action}</b><time>{kst(e.happened_at)}</time></li>)}</ol></section>}</aside></div></>}
    {view==='library'&&<><Heading eyebrow="CONTENT LIBRARY" title="내 콘텐츠" body="저장한 영상과 검토 상태를 확인하세요."/><div className="cv-filterbar">{[['all','전체'],...Object.entries(STATUS)].map(([id,label])=><button key={id} className={filter===id?'active':''} onClick={()=>setFilter(id)}>{label}</button>)}<button onClick={refresh} disabled={loading}>새로고침</button></div>{loading?<p className="cv-empty">불러오는 중…</p>:posts.filter(p=>filter==='all'||p.status===filter).length?postCards(posts.filter(p=>filter==='all'||p.status===filter)):<Empty title="이 상태의 콘텐츠가 아직 없어요" body="영상 한 편을 등록하고 홍보 준비를 시작하세요." action={()=>navigate('new')} label="영상 등록"/>}</>}
    {view==='schedule'&&<><Heading eyebrow="SCHEDULE" title="예약 일정" body="한국 시간으로 저장한 준비 일정을 확인하세요."/><div className="cv-info-strip"><span>ⓘ</span><p>승인 완료된 예약도 실제 게시를 실행하지 않습니다. SNS 게시 연결은 준비 중이에요.</p></div>{schedule.length?<div className="cv-schedule-list">{schedule.map(p=><button key={p.id} onClick={()=>selectPost(p)}><div className="cv-date-card"><strong>{new Date(new Date(p.scheduled_at!).getTime()+9*3600000).getUTCDate()}</strong><span>{new Date(new Date(p.scheduled_at!).getTime()+9*3600000).getUTCMonth()+1}월</span></div><div><span className={'cv-status '+p.status}>{STATUS[p.status]}</span><h3>{p.title}</h3><p>{kst(p.scheduled_at)} · {p.channels.length}개 채널</p>{new Date(p.scheduled_at!)<new Date()&&<small>예약 시간이 지났어요 · 게시 미실행</small>}</div><span className="cv-pending">게시 연결 준비 중 ↗</span></button>)}</div>:<Empty title="저장한 예약이 아직 없어요" body="콘텐츠에 예약 시간을 입력하면 이곳에 모아 볼 수 있어요." action={()=>navigate('new')} label="콘텐츠 준비하기"/>}</>}
    {view==='connections'&&<><Heading eyebrow="SOCIAL CHANNELS" title="SNS 채널" body="콘텐츠를 준비할 채널과 연결 상태를 확인하세요."/><div className="cv-connection-grid">{CHANNELS.map(c=><section className="cv-panel" key={c.id}><span className="cv-social-icon" style={{color:c.color}}>{c.symbol}</span><h2>{c.name}</h2><span className="cv-status review">게시 연결 준비 중</span><p>V1에서는 콘텐츠와 예약 정보를 준비할 수 있어요. 계정 연결과 자동 게시는 아직 제공하지 않습니다.</p><button className="cv-secondary wide" disabled>연결 준비 중</button></section>)}</div><div className="cv-info-strip"><span>ⓘ</span><p>SNS 비밀번호나 토큰을 제출할 필요가 없어요. 계정 연결 기능이 준비되면 안내할게요.</p></div></>}
    {view==='brand'&&<><Heading eyebrow="BRAND PROFILE" title="내 브랜드" body="우리 가게의 기본 정보와 콘텐츠에 담을 이야기를 저장하세요."/><form className="cv-panel cv-brand-form" onSubmit={saveBrand}><label>상호·브랜드명<input value={shop} onChange={e=>setShop(e.target.value)} maxLength={100} placeholder="예: 미소 카페"/></label><label>업종<input value={industry} onChange={e=>setIndustry(e.target.value)} maxLength={80} placeholder="예: 카페·디저트"/></label><label>브랜드 이야기<textarea value={brandNote} onChange={e=>setBrandNote(e.target.value)} maxLength={2000} rows={6} placeholder="상품의 특징, 고객에게 전할 메시지, 자주 쓰는 말투 등을 적어 주세요."/></label><button className="cv-primary" disabled={busy}>{busy?'저장 중…':'브랜드 정보 저장'}</button></form></>}
    <footer className="cv-footer">마케팅플레이 오토 · 고객용 V1 <span>영상 등록 · 검토 · 승인 · 예약 저장</span></footer>
  </main></div></div>
  function postCards(items:Post[]){return <div className="cv-post-grid">{items.map(p=><button className="cv-post-card" key={p.id} onClick={()=>selectPost(p)}><div className="cv-post-art"><span>▷</span><small>VIDEO CONTENT</small><span className={'cv-status '+p.status}>{STATUS[p.status]}</span></div><div className="cv-post-info"><h3>{p.title}</h3><p>{p.body||'게시 내용을 추가해 주세요.'}</p><div className="cv-post-channels">{p.channels.map(id=>{const c=CHANNELS.find(c=>c.id===id);return c?<span key={id} title={c.name} style={{color:c.color}}>{c.symbol}</span>:null})}</div><div className="cv-post-bottom"><time>{kst(p.scheduled_at)}</time><span>열기 ↗</span></div></div></button>)}</div>}
}
function Heading({eyebrow,title,body}:{eyebrow:string;title:string;body:string}){return <div className="cv-page-heading"><div><span className="cv-eyebrow">{eyebrow}</span><h1>{title}</h1><p>{body}</p></div></div>}
function Empty({title,body,action,label}:{title:string;body:string;action:()=>void;label:string}){return <div className="cv-empty"><span className="cv-empty-symbol">▤</span><h3>{title}</h3><p>{body}</p><button className="cv-secondary" onClick={action}>{label} →</button></div>}
