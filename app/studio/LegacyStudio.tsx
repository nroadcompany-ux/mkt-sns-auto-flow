"use client"
import { operatorFetch } from "@/lib/customer"
import { useState, useEffect, useCallback, useRef } from "react"
import dynamic from "next/dynamic"
import { CHANNEL_META, TChannel, TTone, TSourceType, TImageEngine, IScheduleItem } from "@/types"

const VideoMaker = dynamic(() => import("@/components/VideoMaker"), { ssr: false })
import {
  type SavedTopic, type SavedURL, type SavedMaterial, type BrandProfile, type FixRequest, DEFAULT_BRANDS,
  getTopics, addTopic, deleteTopic,
  getURLs, addURL, deleteURL,
  getMaterials, addMaterial, deleteMaterial,
  getBrands, saveBrands, getActiveBrandId, setActiveBrandId, getActiveBrand,
  getFixRequests, addFixRequest, updateFixRequest, deleteFixRequest,
} from "@/lib/storage"

const ALL_CHANNELS = Object.keys(CHANNEL_META) as TChannel[]
const CHANNEL_SECTIONS: { label: string; channels: TChannel[] }[] = [
  { label: "SNS",  channels: ["INSTAGRAM","THREADS","KAKAO_CHANNEL","DAANGN","BAND","FACEBOOK"] },
  { label: "블로그", channels: ["BLOG_NAVER","NEWS_HOMEPAGE","PAYPLAY_BLOG","PAYPLAY_PRESS"] },
]
const CHANNEL_CONNECTED = new Set<TChannel>(["PAYPLAY_BLOG","PAYPLAY_PRESS"])
const CHANNEL_GUIDE: Partial<Record<TChannel, { title: string; steps: string[]; link?: string; linkLabel?: string }>> = {
  INSTAGRAM: { title:"인스타그램 연동 방법", steps:["1. Meta for Developers(developers.facebook.com) 접속 후 앱 생성","2. Instagram Basic Display API 또는 Graph API 추가","3. 앱 심사 제출 — 수일~수주 소요됩니다","4. 심사 완료 후 Long-lived Access Token 발급","5. .env에 META_ACCESS_TOKEN=발급받은토큰 입력 후 재배포"], link:"https://developers.facebook.com", linkLabel:"Meta for Developers 바로가기" },
  THREADS: { title:"스레드 연동 방법", steps:["인스타그램 META_ACCESS_TOKEN으로 함께 작동합니다.","인스타그램 연동을 완료하면 스레드도 자동으로 사용 가능해요."], link:"https://developers.facebook.com", linkLabel:"Meta for Developers 바로가기" },
  KAKAO_CHANNEL: { title:"카카오 채널 연동 방법", steps:["1. 카카오디벨로퍼스(developers.kakao.com) 접속 후 앱 등록","2. 카카오 채널 연결 — 카카오 채널 관리자센터에서 채널 개설 필요","3. 비즈니스 인증 + API 심사 신청 (보통 3~7일 소요)","4. 심사 완료 후 .env에 KAKAO_CLIENT_ID=발급ID 입력"], link:"https://developers.kakao.com", linkLabel:"카카오디벨로퍼스 바로가기" },
  PAYPLAY_BLOG: { title:"페이플레이 블로그 — 이미 연동됨 ✅", steps:["PAYPLAY_API_URL과 PAYPLAY_API_SECRET이 설정되어 있어요.","발행 일정 탭 → '페이플레이 블로그' → '자동 발행' 클릭"] },
  PAYPLAY_PRESS: { title:"페이플레이 언론보도 — 이미 연동됨 ✅", steps:["페이플레이 블로그와 동일한 API를 사용합니다.","뉴스/언론보도 형식으로 자동 게시됩니다."] },
  BLOG_NAVER: { title:"네이버 블로그 연동 방법", steps:["네이버 블로그는 공개 자동발행 API를 제공하지 않습니다.","현재는 복사 후 직접 게시 방식을 사용하세요."] },
  NEWS_HOMEPAGE: { title:"홈페이지 뉴스 연동 방법", steps:["별도 API 토큰 없이 AI가 뉴스 형식으로 글을 생성합니다.","복사 후 홈페이지 관리자 페이지에 직접 게시하세요."] },
  DAANGN: { title:"당근 비즈니스 연동 방법", steps:["당근마켓은 현재 공개 자동발행 API를 제공하지 않습니다.","AI가 생성한 내용을 복사해서 활용하세요."] },
  BAND: { title:"밴드 연동 방법", steps:["네이버 밴드 API는 별도 파트너 계약이 필요합니다.","현재는 복사 후 직접 게시 방식을 사용하세요."] },
  FACEBOOK: { title:"페이스북 연동 방법", steps:["1. Meta for Developers에서 페이지 액세스 토큰 발급","2. Facebook Pages API를 통해 pages_manage_posts 권한 획득","3. 앱 심사 완료 후 .env에 META_ACCESS_TOKEN=페이지토큰 입력"], link:"https://developers.facebook.com", linkLabel:"Meta for Developers 바로가기" },
}
const FREQ_OPTIONS = [
  { id:"daily", label:"매일" },{ id:"weekly", label:"매주" },
  { id:"biweekly", label:"격주" },{ id:"monthly", label:"매월" },
]
const TONE_OPTIONS: { id: TTone; label: string; desc: string }[] = [
  { id:"friendly", label:"친근하게", desc:"소상공인 눈높이" },
  { id:"professional", label:"전문적으로", desc:"신뢰감 있는 공식체" },
  { id:"emotional", label:"감성적으로", desc:"공감·스토리텔링" },
]
const SOURCE_OPTIONS: { id: TSourceType; label: string }[] = [
  { id:"MANUAL", label:"주제" },{ id:"DIVERSIFIED", label:"다각화" },
  { id:"URL", label:"URL" },{ id:"FILE", label:"자료" },
]
const IMAGE_ENGINES: { id: TImageEngine; label: string; desc: string }[] = [
  { id:"custom", label:"기본 템플릿", desc:"SFA 브랜드 디자인" },
  { id:"canva",  label:"캔바 연동",   desc:"내 캔바 템플릿" },
]
const STATUS_STYLE = {
  draft:     { label:"임시저장", cls:"badge-gray" },
  scheduled: { label:"예약됨",   cls:"badge-orange" },
  published: { label:"게시완료", cls:"badge-green" },
  failed:    { label:"실패",     cls:"badge-red" },
}

// ── Icons ────────────────────────────────
const IcoCreate   = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={18} height={18}><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
const IcoCalendar = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={18} height={18}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
const IcoFolder   = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={18} height={18}><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>
const IcoSettings = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" width={18} height={18}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
const IcoShield   = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={18} height={18}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
const IcoChart    = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={18} height={18}><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/></svg>
const IcoChevDown = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" width={13} height={13}><polyline points="6 9 12 15 18 9"/></svg>
const IcoX        = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" width={10} height={10}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
const IcoImage    = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={18} height={18}><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>

// ── utils ────────────────────────────────
function genDates(count: number, start: string, freq: string): Date[] {
  const base = new Date(start)
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(base)
    if (freq==="daily") d.setDate(base.getDate()+i)
    else if (freq==="weekly") d.setDate(base.getDate()+i*7)
    else if (freq==="biweekly") d.setDate(base.getDate()+i*14)
    else d.setMonth(base.getMonth()+i)
    return d
  })
}
function fmtDate(d: Date) {
  const days = ["일","월","화","수","목","금","토"]
  return `${d.getMonth()+1}/${d.getDate()}(${days[d.getDay()]})`
}
function fmtTime(d: Date) { return d.toLocaleTimeString("ko-KR",{hour:"2-digit",minute:"2-digit"}) }
function todayStr() { return new Date().toISOString().split("T")[0] }
function getChannelText(item: IScheduleItem, ch: TChannel): string {
  if (!item.content) return ""
  const c = item.content
  switch (ch) {
    case "BLOG_NAVER": case "PAYPLAY_BLOG": return `${c.blog.title}\n\n${c.blog.body}\n\nSEO: ${c.blog.seoKeywords.join(", ")}`
    case "NEWS_HOMEPAGE": case "PAYPLAY_PRESS": return `${c.news.headline}\n${c.news.subheadline}\n\n${c.news.body}\n\n태그: ${c.news.tags.join(", ")}`
    case "INSTAGRAM": return `${c.instagram.caption}\n\n${c.instagram.hashtags.join(" ")}`
    case "THREADS": return c.threads.post
    case "KAKAO_CHANNEL": return `${c.kakao.title}\n\n${c.kakao.body}`
    default: return c.blog.body
  }
}

type TNav = "create" | "schedule" | "storage" | "stats" | "settings" | "admin"
type TService = "sns" | "visual"
type TVisualMode = "image" | "upload" | "video"
type ActivityLog = { time: string; msg: string; type: "success"|"info"|"error" }

// ── 키워드 섹션 ─────────────────────────────
const KwSection = ({ tier, label, kws, inp, setInp, cls, onAdd, onDel }: {
  tier:"brand"|"main"|"sub"; label:string; kws:string[]; inp:string
  setInp:(v:string)=>void; cls:string; onAdd:(v:string)=>void; onDel:(i:number)=>void
}) => (
  <div className="kw-section">
    <div className={`kw-label ${cls}`}><span className={`kw-dot kw-dot-${tier}`}/>{label}</div>
    {kws.length>0 && (
      <div className="kw-chips">
        {kws.map((k,i) => (
          <span key={i} className={`kw-chip kw-chip-${tier}`}>
            {k}<button className="kw-chip-del" onClick={()=>onDel(i)}><IcoX/></button>
          </span>
        ))}
      </div>
    )}
    <div className="kw-add-row">
      <input className="kw-input"
        placeholder={tier==="brand"?"페이플레이, 결제솔루션...":tier==="main"?"소상공인 POS, 테이블오더...":"창업, 스마트오더..."}
        value={inp} onChange={e=>setInp(e.target.value)} onKeyDown={e=>e.key==="Enter"&&onAdd(inp)}/>
      <button className="kw-add-btn"
        style={{background:tier==="brand"?"var(--blue)":tier==="main"?"var(--text-2)":"var(--border)",color:tier==="sub"?"var(--text-2)":"#fff"}}
        onClick={()=>onAdd(inp)}>+</button>
    </div>
  </div>
)

// ════════════════════════════════════════
export default function SFA() {
  const [service, setService]       = useState<TService>("sns")
  const [nav, setNav]               = useState<TNav>("create")
  const [visualMode, setVisualMode] = useState<TVisualMode>("image")

  // 생성 폼
  const [sourceType, setSourceType]     = useState<TSourceType>("MANUAL")
  const [topic, setTopic]               = useState("")
  const [sourceContent, setSourceContent] = useState("")
  const [tone, setTone]                 = useState<TTone>("friendly")
  const [count, setCount]               = useState(4)
  const [freq, setFreq]                 = useState("weekly")
  const [startDate, setStartDate]       = useState(todayStr())
  const [channels, setChannels]         = useState<TChannel[]>(["INSTAGRAM","THREADS","KAKAO_CHANNEL","PAYPLAY_BLOG"])
  const [imageEngine, setImageEngine]   = useState<TImageEngine>("custom")
  const [canvaKey, setCanvaKey]         = useState("")

  // 키워드
  const [brandKws, setBrandKws] = useState<string[]>([])
  const [mainKws,  setMainKws]  = useState<string[]>([])
  const [subKws,   setSubKws]   = useState<string[]>([])
  const [bKwIn, setBKwIn] = useState(""); const [mKwIn, setMKwIn] = useState(""); const [sKwIn, setSKwIn] = useState("")

  // 콜랩서블 섹션
  const [showKw, setShowKw]             = useState(false)
  const [showSchedule, setShowSchedule] = useState(false)

  // 상태
  const [generating, setGenerating]       = useState(false)
  const [genLogs, setGenLogs]             = useState<{step:string;done:boolean;error:boolean}[]>([])
  const [schedule, setSchedule]           = useState<IScheduleItem[]>([])
  const [activeItem, setActiveItem]       = useState<IScheduleItem|null>(null)
  const [activeChannel, setActiveChannel] = useState<TChannel>("INSTAGRAM")
  const [copied, setCopied]               = useState<string|null>(null)
  const [publishing, setPublishing]       = useState(false)
  const [publishResults, setPublishResults] = useState<any[]>([])
  const [isDragging, setIsDragging]       = useState(false)
  const [scheduleDeadline, setScheduleDeadline] = useState("")
  const fileDropRef = useRef<HTMLTextAreaElement>(null)

  // 브랜드
  const [brand, setBrand]               = useState({ name:"마케팅플레이 오토", color:"#3182F6", hashtags:"" })
  const [brandProfiles, setBrandProfiles] = useState<BrandProfile[]>(DEFAULT_BRANDS)
  const [activeBrandId, setActiveBrandIdState] = useState<string>("b1")
  const [editingBrandId, setEditingBrandId]     = useState<string|null>(null)

  // DB
  const [dbItems, setDbItems]   = useState<IScheduleItem[]>([])
  const [dbLoading, setDbLoading] = useState(false)

  // localStorage
  const [savedTopics, setSavedTopics]       = useState<SavedTopic[]>([])
  const [savedURLs, setSavedURLs]           = useState<SavedURL[]>([])
  const [savedMaterials, setSavedMaterials] = useState<SavedMaterial[]>([])

  // 발행 편집
  const [editedContent, setEditedContent]   = useState<Record<string,string>>({})
  const [showImageView, setShowImageView]   = useState<Record<string,boolean>>({})
  const [imageCache, setImageCache]         = useState<Record<string,string>>({})
  const [regenerating, setRegenerating]     = useState(false)
  const [draftSavedKey, setDraftSavedKey]   = useState<string|null>(null)
  const [scheduledDate, setScheduledDate]   = useState<Record<string,string>>({})
  const [showSchedulePanel, setShowSchedulePanel] = useState(false)

  // 수정 요청
  const [fixRequests, setFixRequests] = useState<FixRequest[]>([])
  const [newFix, setNewFix]           = useState({title:"",content:"",images:[] as string[]})
  const [isDraggingFix, setIsDraggingFix] = useState(false)

  // 관리자
  const [adminKey, setAdminKey]     = useState("")
  const [diagError, setDiagError]   = useState("")
  const [diagResult, setDiagResult] = useState<any>(null)
  const [diagLoading, setDiagLoading] = useState(false)

  // 블로그 URL
  const [blogUrls, setBlogUrls]             = useState<Partial<Record<TChannel,string>>>({})
  const [customBlogUrls, setCustomBlogUrls] = useState<Partial<Record<TChannel,string>>>({})

  // 활동 로그
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([])
  const addLog = (msg:string, type:ActivityLog["type"]="info") =>
    setActivityLogs(p=>[{time:fmtTime(new Date()),msg,type},...p].slice(0,30))

  // 모달
  const [guideChannel, setGuideChannel]       = useState<TChannel|null>(null)
  const [showChannelModal, setShowChannelModal] = useState(false)

  // 주제 드롭다운
  const [topicDropOpen, setTopicDropOpen] = useState(false)
  const [topicSearch, setTopicSearch]     = useState("")
  const topicDropRef = useRef<HTMLDivElement>(null)

  // Visual Maker
  const [fluxPrompt, setFluxPrompt]   = useState("")
  const [fluxStyle, setFluxStyle]     = useState("realistic")
  const [fluxSize, setFluxSize]       = useState("square")
  const [fluxImages, setFluxImages]   = useState<string[]>([])
  const [fluxLoading, setFluxLoading] = useState(false)

  useEffect(() => {
    if (!topicDropOpen) return
    const h = (e:MouseEvent) => {
      if (topicDropRef.current && !topicDropRef.current.contains(e.target as Node))
        setTopicDropOpen(false), setTopicSearch("")
    }
    document.addEventListener("mousedown",h)
    return ()=>document.removeEventListener("mousedown",h)
  },[topicDropOpen])

  useEffect(() => {
    setSavedTopics(getTopics()); setSavedURLs(getURLs()); setSavedMaterials(getMaterials())
    setBrandProfiles(getBrands()); setActiveBrandIdState(getActiveBrandId())
    const ab = getActiveBrand()
    if (ab) setBrand({name:ab.name,color:ab.color,hashtags:ab.hashtags})
    setFixRequests(getFixRequests())
  },[])

  const loadHistory = useCallback(async () => {
    setDbLoading(true)
    try {
      const res = await operatorFetch("/api/history?limit=50")
      const data = await res.json()
      if (data.success) {
        const mapped:IScheduleItem[] = data.items.map((item:any,i:number) => ({
          id:item.id, index:i+1, topic:item.topic, angle:item.angle||"일반",
          date:new Date(item.createdAt), status:item.status as any,
          content:item.content, channels:item.channels||[], dbId:item.id,
        }))
        setDbItems(mapped)
      }
    } catch {}
    finally { setDbLoading(false) }
  },[])

  useEffect(() => {
    if (nav==="schedule"||nav==="storage") loadHistory()
  },[nav, loadHistory])

  const allKeywords = [...brandKws,...mainKws,...subKws].join(", ")
  const dates = genDates(count, startDate, freq)
  const toggleCh = (ch:TChannel) => setChannels(p=>p.includes(ch)?p.filter(c=>c!==ch):[...p,ch])
  const selectAllCh = () => setChannels([...ALL_CHANNELS])
  const clearAllCh  = () => setChannels([])

  const addKw = (tier:"brand"|"main"|"sub", val:string) => {
    const v = val.trim(); if(!v) return
    if(tier==="brand"){setBrandKws(p=>[...p,v]);setBKwIn("")}
    else if(tier==="main"){setMainKws(p=>[...p,v]);setMKwIn("")}
    else{setSubKws(p=>[...p,v]);setSKwIn("")}
  }
  const delKw = (tier:"brand"|"main"|"sub", i:number) => {
    if(tier==="brand") setBrandKws(p=>p.filter((_,j)=>j!==i))
    else if(tier==="main") setMainKws(p=>p.filter((_,j)=>j!==i))
    else setSubKws(p=>p.filter((_,j)=>j!==i))
  }

  const switchBrand = (id:string) => {
    setActiveBrandId(id); setActiveBrandIdState(id)
    const ab = getBrands().find(b=>b.id===id)
    if(ab) setBrand({name:ab.name,color:ab.color,hashtags:ab.hashtags})
  }
  const updateBrandProfile = (profile:BrandProfile) => {
    const updated = getBrands().map(b=>b.id===profile.id?profile:b)
    saveBrands(updated); setBrandProfiles(updated)
    if(profile.id===activeBrandId) setBrand({name:profile.name,color:profile.color,hashtags:profile.hashtags})
  }

  const handleSaveTopic    = () => { if(!topic.trim()) return; addTopic(topic,allKeywords); setSavedTopics(getTopics()); addLog(`주제 저장됨: "${topic.slice(0,20)}"`) }
  const handleSelectTopic  = (t:SavedTopic) => { setTopic(t.text); if(t.keywords) setMainKws(t.keywords.split(",").map(k=>k.trim()).filter(Boolean)); setTopicDropOpen(false); setTopicSearch("") }
  const handleDeleteTopic  = (id:string) => { deleteTopic(id); setSavedTopics(getTopics()) }
  const handleSaveURL      = () => { if(!sourceContent.trim()||sourceType!=="URL") return; addURL(sourceContent,sourceContent); setSavedURLs(getURLs()) }
  const handleSelectURL    = (u:SavedURL) => setSourceContent(u.url)
  const handleDeleteURL    = (id:string) => { deleteURL(id); setSavedURLs(getURLs()) }
  const handleSaveMaterial = () => { if(!sourceContent.trim()||sourceType!=="FILE") return; addMaterial(`자료 ${savedMaterials.length+1}`,sourceContent); setSavedMaterials(getMaterials()) }
  const handleSelectMaterial = (m:SavedMaterial) => setSourceContent(m.content)
  const handleDeleteMaterial = (id:string) => { deleteMaterial(id); setSavedMaterials(getMaterials()) }

  const handleDrop = useCallback((e:React.DragEvent) => {
    e.preventDefault(); setIsDragging(false)
    const text = e.dataTransfer.getData("text/plain")
    const file = e.dataTransfer.files[0]
    if(text){setSourceContent(text);return}
    if(file&&file.type==="text/plain") file.text().then(t=>setSourceContent(t))
    else if(file) setSourceContent(`[파일: ${file.name}] — 내용을 직접 붙여넣어 주세요.`)
  },[])

  const handleDeleteSchedule = async (item:IScheduleItem) => {
    if(!window.confirm("이 일정을 삭제할까요?")) return
    try {
      if(item.dbId) await operatorFetch("/api/history",{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:item.dbId})})
      setSchedule(p=>p.filter(i=>i.id!==item.id)); setDbItems(p=>p.filter(i=>i.id!==item.id))
      if(activeItem?.id===item.id) setActiveItem(null)
      addLog(`"${item.topic.slice(0,20)}" 일정 삭제`)
    } catch { addLog("삭제 실패","error") }
  }

  const handleGenerate = async () => {
    const input = sourceType==="MANUAL"?topic:sourceContent
    if(!input.trim()) return
    if(channels.length===0){setShowChannelModal(true);return}
    setGenerating(true)
    setGenLogs(Array.from({length:count},()=>({step:"대기 중",done:false,error:false})))
    addLog(`콘텐츠 생성 시작 — ${count}편 × ${channels.length}채널`)
    try {
      const res = await operatorFetch("/api/content/generate",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({topic,keywords:allKeywords,tone,count,sourceType,sourceContent,startDate,frequency:freq,channels}),
      })
      const data = await res.json()
      if(!data.success) throw new Error(data.error)
      const results:IScheduleItem[] = data.results.map((r:any,i:number) => {
        setGenLogs(p=>p.map((l,idx)=>idx===i?{...l,step:"완료",done:true}:l))
        return {id:r.dbId||`${Date.now()}-${i}`,index:r.index||i+1,topic:r.topic||topic,angle:r.angle||"일반",date:dates[i],status:"draft" as const,content:r.content,channels,dbId:r.dbId}
      })
      setSchedule(results)
      if(results[0]){setActiveItem(results[0]);setActiveChannel(channels[0])}
      addLog(`✅ 생성 완료 — ${results.length*channels.length}개 콘텐츠`,"success")
      setTimeout(()=>{setGenerating(false);setNav("schedule")},500)
    } catch(e) {
      const msg = e instanceof Error&&e.message?e.message.slice(0,60):"오류 발생"
      setGenLogs(p=>p.map(l=>({...l,error:true,step:msg})))
      addLog(`❌ 생성 실패: ${msg}`,"error"); setGenerating(false)
    }
  }

  const handlePublish = async (item:IScheduleItem) => {
    if(!item.content) return
    setPublishing(true); setPublishResults([])
    const payload = {title:item.content.blog.title,body:item.content.blog.body,hashtags:item.content.instagram.hashtags}
    try {
      const res = await operatorFetch("/api/publish",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({channels:item.channels,payload,dbId:(item as any).dbId})})
      const data = await res.json()
      setPublishResults(data.summary||[])
      ;(data.summary||[]).forEach((r:any)=>{
        const m = CHANNEL_META[r.channel as TChannel]
        if(r.success) addLog(`✅ ${m?.label} — 발행 완료`,"success")
        else if(r.fallback) addLog(`📦 ${m?.label} — 소재 저장됨`)
        else addLog(`❌ ${m?.label} — 실패`,"error")
      })
    } finally { setPublishing(false) }
  }

  const copy = (key:string, text:string) => {
    navigator.clipboard.writeText(text); setCopied(key); setTimeout(()=>setCopied(null),2000)
  }

  const loadImage = async (itemId:string, t:string) => {
    if(imageCache[itemId]) return
    try {
      const res = await operatorFetch("/api/image",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({title:t,brand:brand.name,color:brand.color})})
      if(res.ok){const svg=await res.text();const blob=new Blob([svg],{type:"image/svg+xml"});setImageCache(p=>({...p,[itemId]:URL.createObjectURL(blob)}))}
    } catch {}
  }

  const handleRegenerate = async (item:IScheduleItem, ch:TChannel) => {
    setRegenerating(true)
    try {
      const res = await operatorFetch("/api/regenerate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({topic:item.topic,channel:ch,tone,keywords:allKeywords,angle:item.angle})})
      const data = await res.json()
      if(data.success&&data.text){setEditedContent(p=>({...p,[`${item.id}-${ch}`]:data.text}));addLog(`🔄 ${CHANNEL_META[ch]?.label} 재작성 완료`,"success")}
    } catch {}
    setRegenerating(false)
  }

  const handleDraftSave = (itemId:string, ch:TChannel) => {
    const key=`${itemId}-${ch}`; localStorage.setItem(`sfa_draft_${key}`,editedContent[key]||"")
    setDraftSavedKey(key); setTimeout(()=>setDraftSavedKey(null),2000)
    addLog(`💾 임시저장 — ${CHANNEL_META[ch]?.label}`)
  }

  const handleAddFix = () => {
    if(!newFix.title.trim()) return
    addFixRequest(newFix.title,newFix.content,newFix.images)
    setNewFix({title:"",content:"",images:[]}); setFixRequests(getFixRequests())
  }
  const handleFixImageDrop = (e:React.DragEvent) => {
    e.preventDefault(); setIsDraggingFix(false)
    const file = e.dataTransfer.files[0]
    if(!file||!file.type.startsWith("image/")) return
    const reader = new FileReader()
    reader.onload = ev=>{if(ev.target?.result) setNewFix(p=>({...p,images:[...p.images,ev.target!.result as string]}))}
    reader.readAsDataURL(file)
  }

  const handleDiag = async () => {
    if(!diagError||!adminKey) return
    setDiagLoading(true); setDiagResult(null)
    try {
      const res = await operatorFetch("/api/diagnostic",{method:"POST",headers:{"Content-Type":"application/json","x-admin-key":adminKey},body:JSON.stringify({error:diagError,context:"마케팅플레이 오토"})})
      const data = await res.json(); setDiagResult(data.analysis)
    } finally { setDiagLoading(false) }
  }

  const handleFluxGenerate = async () => {
    if(!fluxPrompt.trim()) return
    setFluxLoading(true); setFluxImages([])
    try {
      const res = await operatorFetch("/api/visual/generate",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({prompt:fluxPrompt,style:fluxStyle,size:fluxSize,brandName:brand.name}),
      })
      const data = await res.json()
      if(data.success) setFluxImages(data.images||[])
      else addLog(`이미지 생성 실패: ${data.error||"오류"}`, "error")
    } catch(e) {
      addLog("이미지 생성 오류","error")
    } finally { setFluxLoading(false) }
  }

  // ── chips display
  const MAX_CHIPS = 3
  const visibleTopics  = savedTopics.slice(0,MAX_CHIPS)
  const remainCount    = Math.max(0,savedTopics.length-MAX_CHIPS)
  const filteredTopics = topicSearch ? savedTopics.filter(t=>t.text.toLowerCase().includes(topicSearch.toLowerCase())) : savedTopics

  const sideNav: {id:TNav; label:string; Icon:()=>React.ReactElement}[] = [
    {id:"create",   label:"콘텐츠 생성",Icon:IcoCreate},
    {id:"schedule", label:"발행 일정",  Icon:IcoCalendar},
    {id:"storage",  label:"보관함",     Icon:IcoFolder},
    {id:"stats",    label:"채널 분석",  Icon:IcoChart},
    {id:"settings", label:"브랜드 설정",Icon:IcoSettings},
    {id:"admin",    label:"수정 요청",  Icon:IcoShield},
  ]

  const displayItems = dbItems.length>0?dbItems:schedule

  // ════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════
  return (
    <div className="mp-shell">

      {/* ── HEADER ── */}
      <header className="mp-header">
        <button className="mp-logo" onClick={()=>{setService("sns");setNav("create")}}>
          <div className="mp-logo-sq">MP</div>
          <div>
            <div className="mp-logo-name">마케팅플레이 오토</div>
          </div>
        </button>

        <div className="mp-service-tabs">
          <button className={`svc-tab ${service==="sns"?"active":""}`} onClick={()=>{setService("sns");setNav("create")}}>
            SNS Maker Auto
          </button>
          <button className={`svc-tab ${service==="visual"?"active visual":""}`} onClick={()=>setService("visual")}>
            Visual Maker Auto
          </button>
        </div>

        <div className="mp-header-right">
          <select className="brand-select" value={activeBrandId} onChange={e=>switchBrand(e.target.value)}>
            {brandProfiles.filter(b=>b.name).map(b=>(
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
      </header>

      {/* ── BODY ── */}
      <div className="mp-body">

        {/* ── LEFT SIDEBAR ── */}
        <aside className="mp-sidebar">
          {sideNav.map(({id,label,Icon})=>(
            <button key={id}
              title={label}
              className={`side-btn ${nav===id&&service==="sns"?"active":""}`}
              onClick={()=>{setService("sns");setNav(id)}}>
              <Icon/>
            </button>
          ))}
          <div className="side-btn-spacer"/>
          <button
            title="Visual Maker Auto"
            className={`side-btn ${service==="visual"?"active visual":""}`}
            onClick={()=>setService("visual")}>
            <IcoImage/>
          </button>
        </aside>

        {/* ── MAIN ── */}
        <main className="mp-main">
          <div className="mp-main-inner">

            {/* ════ SNS MAKER ════ */}
            {service==="sns" && (

              <>
                {/* ── 생성 뷰 ── */}
                {nav==="create" && !generating && (
                  <>
                    {/* Command card */}
                    <div className="cmd-card">
                      {/* Source type */}
                      <div className="cmd-source-tabs">
                        {SOURCE_OPTIONS.map(s=>(
                          <button key={s.id} className={`cmd-source-tab ${sourceType===s.id?"active":""}`} onClick={()=>setSourceType(s.id)}>{s.label}</button>
                        ))}
                      </div>

                      {/* Main input */}
                      {(sourceType==="MANUAL"||sourceType==="DIVERSIFIED") && (
                        <div>
                          <div className="cmd-input-row">
                            <input className="cmd-input"
                              placeholder="예) 여름 매출 올리는 소상공인 마케팅 전략"
                              value={topic} onChange={e=>setTopic(e.target.value)}
                              onKeyDown={e=>e.key==="Enter"&&handleGenerate()}/>
                            <button className="btn btn-secondary btn-sm" onClick={handleSaveTopic} disabled={!topic.trim()}>저장</button>
                          </div>
                          {savedTopics.length>0 && (
                            <div style={{position:"relative"}} ref={topicDropRef}>
                              <div className="topic-chip-row">
                                {visibleTopics.map(t=>(
                                  <div key={t.id} className={`topic-chip ${topic===t.text?"selected":""}`} onClick={()=>handleSelectTopic(t)}>
                                    {t.text.length>14?t.text.slice(0,14)+"…":t.text}
                                    <button className="topic-chip-del" onClick={e=>{e.stopPropagation();handleDeleteTopic(t.id)}}><IcoX/></button>
                                  </div>
                                ))}
                                <button className="topic-chip-more" onClick={()=>setTopicDropOpen(v=>!v)}>
                                  {remainCount>0?`+${remainCount}개`:"검색"} <IcoChevDown/>
                                </button>
                              </div>
                              {topicDropOpen && (
                                <div className="topic-dropdown">
                                  <div className="topic-dropdown-search">
                                    <input className="form-input" style={{fontSize:13,padding:"8px 11px"}} placeholder="주제 검색..." value={topicSearch} onChange={e=>setTopicSearch(e.target.value)} autoFocus/>
                                  </div>
                                  <div className="topic-dropdown-list">
                                    {filteredTopics.length===0
                                      ? <div style={{padding:13,textAlign:"center",fontSize:13,color:"var(--text-3)"}}>검색 결과 없음</div>
                                      : filteredTopics.map(t=>(
                                        <div key={t.id} className="topic-dropdown-item" onClick={()=>handleSelectTopic(t)}>
                                          <span style={{flex:1}}>{t.text}</span>
                                          <button onClick={e=>{e.stopPropagation();handleDeleteTopic(t.id)}} className="btn-danger-ghost" style={{padding:"2px 6px",fontSize:12}}>×</button>
                                        </div>
                                      ))
                                    }
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {sourceType==="URL" && (
                        <div>
                          <div className="cmd-input-row">
                            <input className="cmd-input" placeholder="https://..." value={sourceContent} onChange={e=>setSourceContent(e.target.value)}/>
                            <button className="btn btn-secondary btn-sm" onClick={handleSaveURL}>저장</button>
                          </div>
                          {savedURLs.length>0 && (
                            <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                              {savedURLs.map(u=>(
                                <div key={u.id} style={{display:"flex",alignItems:"center",background:"var(--blue-light)",borderRadius:7,overflow:"hidden"}}>
                                  <button onClick={()=>handleSelectURL(u)} style={{padding:"4px 9px",background:"none",border:"none",cursor:"pointer",fontSize:12,color:"var(--blue)",fontWeight:600}}>{u.label.slice(0,25)}</button>
                                  <button onClick={()=>handleDeleteURL(u.id)} className="btn-danger-ghost" style={{padding:"3px 7px"}}>×</button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {sourceType==="FILE" && (
                        <div onDragOver={e=>{e.preventDefault();setIsDragging(true)}} onDragLeave={()=>setIsDragging(false)} onDrop={handleDrop} style={{position:"relative"}}>
                          <textarea ref={fileDropRef} className="cmd-input textarea"
                            style={{border:isDragging?"1.5px dashed var(--blue)":undefined,background:isDragging?"var(--blue-light)":undefined}}
                            placeholder="텍스트 붙여넣기 또는 파일 드래그..."
                            value={sourceContent} onChange={e=>setSourceContent(e.target.value)}/>
                          {isDragging && <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",pointerEvents:"none",fontSize:15,fontWeight:700,color:"var(--blue)"}}>여기에 놓으세요</div>}
                        </div>
                      )}

                      {/* Channel chips */}
                      <div className="ch-section" style={{marginTop:16}}>
                        <div className="ch-section-header">
                          <span className="ch-section-label">발행 채널 — {channels.length}/{ALL_CHANNELS.length} 선택</span>
                          <div className="ch-all-btns">
                            <button className="ch-all-btn" onClick={selectAllCh}>전체</button>
                            <button className="ch-all-btn" style={{color:"var(--text-3)"}} onClick={clearAllCh}>해제</button>
                            <button className="ch-all-btn" style={{color:"var(--text-3)"}} onClick={()=>setGuideChannel("INSTAGRAM")}>연동 가이드</button>
                          </div>
                        </div>
                        {CHANNEL_SECTIONS.map(sec=>(
                          <div key={sec.label} style={{marginBottom:8}}>
                            <div className="ch-group-label">{sec.label}</div>
                            <div className="ch-chips">
                              {sec.channels.map(ch=>{
                                const m = CHANNEL_META[ch]
                                const on = channels.includes(ch)
                                const connected = CHANNEL_CONNECTED.has(ch)
                                return (
                                  <button key={ch} className={`ch-chip ${on?"on":""}`}
                                    style={on?{background:m.color,borderColor:m.color}:{}}
                                    onClick={()=>toggleCh(ch)}>
                                    <span className="ch-chip-dot" style={{background:on?"rgba(255,255,255,0.7)":m.color}}/>
                                    {m.label}
                                    {connected && <span className="ch-chip-badge">{on?"ON":"연동"}</span>}
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Collapsible: Keywords */}
                      <div className="collapsible" style={{marginTop:12}}>
                        <button className="collapsible-header" onClick={()=>setShowKw(v=>!v)}>
                          <div>
                            <div className="collapsible-title">키워드 <span style={{fontSize:12,fontWeight:400,color:"var(--text-3)"}}>(선택사항)</span></div>
                            {[...brandKws,...mainKws,...subKws].length>0 && (
                              <div className="collapsible-meta">브랜드 {brandKws.length} · 메인 {mainKws.length} · 서브 {subKws.length}개</div>
                            )}
                          </div>
                          <span style={{color:"var(--text-3)",display:"flex",transform:showKw?"rotate(180deg)":"none",transition:"transform 0.15s"}}><IcoChevDown/></span>
                        </button>
                        {showKw && (
                          <div className="collapsible-body" style={{paddingTop:12}}>
                            <KwSection tier="brand" label="브랜드" kws={brandKws} inp={bKwIn} setInp={setBKwIn} cls="kw-label-brand" onAdd={v=>addKw("brand",v)} onDel={i=>delKw("brand",i)}/>
                            <KwSection tier="main"  label="메인"   kws={mainKws}  inp={mKwIn} setInp={setMKwIn} cls="kw-label-main"  onAdd={v=>addKw("main",v)}  onDel={i=>delKw("main",i)}/>
                            <KwSection tier="sub"   label="서브"   kws={subKws}   inp={sKwIn} setInp={setSKwIn} cls="kw-label-sub"   onAdd={v=>addKw("sub",v)}   onDel={i=>delKw("sub",i)}/>
                          </div>
                        )}
                      </div>

                      {/* Collapsible: Schedule */}
                      <div className="collapsible" style={{marginTop:8}}>
                        <button className="collapsible-header" onClick={()=>setShowSchedule(v=>!v)}>
                          <div>
                            <div className="collapsible-title">발행 일정</div>
                            <div className="collapsible-meta">{count}편 · {FREQ_OPTIONS.find(f=>f.id===freq)?.label} · {startDate} 시작</div>
                          </div>
                          <span style={{color:"var(--text-3)",display:"flex",transform:showSchedule?"rotate(180deg)":"none",transition:"transform 0.15s"}}><IcoChevDown/></span>
                        </button>
                        {showSchedule && (
                          <div className="collapsible-body" style={{paddingTop:14}}>
                            <div style={{display:"flex",gap:20,flexWrap:"wrap",marginBottom:14}}>
                              <div>
                                <div className="form-label">수량</div>
                                <div className="cmd-count-ctrl">
                                  <button className="cmd-count-btn" onClick={()=>setCount(c=>Math.max(1,c-1))}>−</button>
                                  <span className="cmd-count-val">{count}편</span>
                                  <button className="cmd-count-btn" onClick={()=>setCount(c=>Math.min(12,c+1))}>+</button>
                                </div>
                              </div>
                              <div>
                                <div className="form-label">주기</div>
                                <div className="cmd-opt-pills">
                                  {FREQ_OPTIONS.map(f=>(
                                    <button key={f.id} className={`cmd-opt-pill ${freq===f.id?"active":""}`} onClick={()=>setFreq(f.id)}>{f.label}</button>
                                  ))}
                                </div>
                              </div>
                              <div>
                                <div className="form-label">시작일</div>
                                <input type="date" className="form-input" style={{width:"auto",padding:"5px 9px",fontSize:13}} value={startDate} onChange={e=>setStartDate(e.target.value)}/>
                              </div>
                            </div>
                            <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                              {dates.map((d,i)=>(
                                <div key={i} style={{display:"flex",alignItems:"center",gap:4,background:"var(--blue-light)",border:"1px solid #BFDBFE",borderRadius:17,padding:"3px 9px",fontSize:12,color:"var(--blue)"}}>
                                  <span style={{fontWeight:800,fontSize:10,background:"var(--blue)",color:"#fff",borderRadius:7,width:14,height:14,display:"flex",alignItems:"center",justifyContent:"center"}}>{i+1}</span>
                                  {fmtDate(d)}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Options row + Generate */}
                      <div style={{display:"flex",alignItems:"center",gap:10,marginTop:14,flexWrap:"wrap"}}>
                        <div className="cmd-opt-group">
                          <span className="cmd-opt-label">톤</span>
                          <div className="cmd-opt-pills">
                            {TONE_OPTIONS.map(t=>(
                              <button key={t.id} className={`cmd-opt-pill ${tone===t.id?"active":""}`} onClick={()=>setTone(t.id)} title={t.desc}>{t.label}</button>
                            ))}
                          </div>
                        </div>
                        <div style={{marginLeft:"auto",display:"flex",gap:8,alignItems:"center"}}>
                          <span style={{fontSize:13,color:"var(--text-3)"}}>
                            {channels.length>0?`${count*channels.length}개 콘텐츠 생성`:"채널을 선택하세요"}
                          </span>
                          <button className="gen-btn" onClick={handleGenerate}
                            disabled={(!topic.trim()&&sourceType==="MANUAL")||(!sourceContent.trim()&&sourceType!=="MANUAL")}>
                            ✦ 자동화 시작
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Activity log */}
                    {activityLogs.length>0 && (
                      <div className="activity-log" style={{marginTop:16}}>
                        <div style={{fontSize:12,fontWeight:700,color:"var(--text-3)",textTransform:"uppercase",letterSpacing:0.5,marginBottom:6}}>최근 활동</div>
                        <div className="log-list">
                          {activityLogs.slice(0,5).map((log,i)=>(
                            <div key={i} className={`log-item log-${log.type}`}>
                              <span className="log-time">{log.time}</span>
                              <span className="log-msg">{log.msg}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* ── 생성 중 ── */}
                {generating && (
                  <div className="generating-wrap">
                    <div className="generating-card">
                      <div className="spinner"/>
                      <div style={{fontSize:19,fontWeight:800,marginBottom:7,color:"var(--text-1)"}}>AI가 콘텐츠를 생성 중이에요</div>
                      <div style={{fontSize:13,color:"var(--text-3)",marginBottom:24}}>{count}편 × {channels.length}채널 = {count*channels.length}개 콘텐츠</div>
                      <div style={{display:"flex",flexDirection:"column",gap:8}}>
                        {genLogs.map((l,i)=>(
                          <div key={i} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 14px",background:"var(--bg)",borderRadius:"var(--r-sm)"}}>
                            <div className="dot" style={{background:l.done?"var(--success)":l.error?"var(--danger)":"var(--blue)",animation:!l.done&&!l.error?"pulse 1.2s infinite":undefined}}/>
                            <span style={{flex:1,fontSize:14,fontWeight:600,textAlign:"left",color:"var(--text-1)"}}>{topic||"주제"} {i+1}편</span>
                            <span style={{fontSize:12,color:"var(--text-3)"}}>{l.step}</span>
                            <span style={{fontSize:13}}>{l.done?"✓":l.error?"✗":"…"}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* ── 발행 일정 ── */}
                {nav==="schedule" && !generating && (
                  <>
                    <div className="view-header">
                      <div>
                        <div className="view-title">발행 일정</div>
                        <div className="view-sub">채널별 콘텐츠 검토 · 편집 · 복사 · 자동 발행</div>
                      </div>
                      <div style={{display:"flex",gap:8}}>
                        <button onClick={()=>setNav("create")} className="btn btn-primary btn-sm">+ 새 콘텐츠</button>
                        <button onClick={loadHistory} className="btn btn-secondary btn-sm">{dbLoading?"로딩 중...":"새로고침"}</button>
                      </div>
                    </div>

                    {displayItems.length===0 ? (
                      <div className="empty-state">
                        <div className="empty-icon">📭</div>
                        <div className="empty-title">생성된 일정이 없어요</div>
                        <div className="empty-sub">콘텐츠 생성 탭에서 주제를 입력하고<br/>자동화 시작 버튼을 눌러주세요.</div>
                        <button className="btn btn-primary" onClick={()=>setNav("create")}>콘텐츠 생성하기</button>
                      </div>
                    ) : (
                      <div className="schedule-layout">
                        <div className="schedule-list">
                          {displayItems.map(item=>{
                            const st = STATUS_STYLE[item.status as keyof typeof STATUS_STYLE]||STATUS_STYLE.draft
                            return (
                              <div key={item.id} style={{position:"relative"}}>
                                <button className={`schedule-item-btn ${activeItem?.id===item.id?"active":""}`}
                                  onClick={()=>{setActiveItem(item);setActiveChannel(item.channels[0]||"INSTAGRAM");setPublishResults([])}}>
                                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                                    <span style={{fontSize:12,fontWeight:700,color:"var(--text-3)"}}>{item.index}편</span>
                                    <span className={`badge ${st.cls}`}>{st.label}</span>
                                  </div>
                                  <div style={{fontSize:13.5,fontWeight:600,color:"var(--text-1)",lineHeight:1.4,marginBottom:6}}>{item.topic}</div>
                                  <div style={{fontSize:12,color:"var(--text-3)",marginBottom:6}}>{fmtDate(item.date)} · {item.angle}</div>
                                  <div style={{display:"flex",gap:4}}>
                                    {item.channels.map(ch=><div key={ch} className="dot" style={{background:CHANNEL_META[ch as TChannel]?.color||"var(--border)"}}/>)}
                                  </div>
                                </button>
                                <button className="schedule-item-del" onClick={e=>{e.stopPropagation();handleDeleteSchedule(item)}}>×</button>
                              </div>
                            )
                          })}
                        </div>

                        {activeItem ? (
                          <div className="card" style={{padding:0,overflow:"hidden"}}>
                            <div style={{padding:"18px 22px",borderBottom:"1px solid var(--border-light)"}}>
                              <div style={{fontSize:16,fontWeight:700,color:"var(--text-1)",marginBottom:4}}>{activeItem.topic}</div>
                              <div style={{fontSize:12.5,color:"var(--text-3)"}}>{fmtDate(activeItem.date)} · {activeItem.angle}</div>
                            </div>
                            <div className="ch-tab-bar">
                              {activeItem.channels.map(ch=>{
                                const m = CHANNEL_META[ch as TChannel]; if(!m) return null
                                const canAuto = ch==="PAYPLAY_BLOG"||ch==="PAYPLAY_PRESS"
                                return (
                                  <button key={ch} className="ch-tab"
                                    style={{borderBottomColor:activeChannel===ch?m.color:"transparent"}}
                                    onClick={()=>setActiveChannel(ch as TChannel)}>
                                    <span className={`ch-tab-name ${activeChannel===ch?"active":""}`} style={activeChannel===ch?{color:m.color}:{}}>{m.label}</span>
                                    <span className={`ch-tab-badge ${canAuto?"auto":""}`}>{canAuto?"자동 가능":"복사 필요"}</span>
                                  </button>
                                )
                              })}
                            </div>
                            <div style={{padding:22}}>
                              {activeItem.content ? (()=>{
                                const ck = `${activeItem.id}-${activeChannel}`
                                const currentText = editedContent[ck]??getChannelText(activeItem,activeChannel)
                                const isImageView = showImageView[ck]
                                const canAuto = activeChannel==="PAYPLAY_BLOG"||activeChannel==="PAYPLAY_PRESS"
                                return (
                                  <>
                                    <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap",alignItems:"center"}}>
                                      <div style={{display:"flex",background:"var(--bg)",borderRadius:"var(--r-sm)",padding:3,gap:2}}>
                                        <button onClick={()=>setShowImageView(p=>({...p,[ck]:false}))} style={{padding:"5px 12px",borderRadius:6,border:"none",fontSize:12.5,fontWeight:600,cursor:"pointer",background:!isImageView?"white":"transparent",color:!isImageView?"var(--blue)":"var(--text-3)",boxShadow:!isImageView?"var(--shadow-xs)":"none"}}>텍스트</button>
                                        <button onClick={()=>{setShowImageView(p=>({...p,[ck]:true}));loadImage(activeItem.id,activeItem.topic)}} style={{padding:"5px 12px",borderRadius:6,border:"none",fontSize:12.5,fontWeight:600,cursor:"pointer",background:isImageView?"white":"transparent",color:isImageView?"var(--blue)":"var(--text-3)",boxShadow:isImageView?"var(--shadow-xs)":"none"}}>이미지 카드</button>
                                      </div>
                                      <button onClick={()=>handleRegenerate(activeItem,activeChannel)} disabled={regenerating} className="btn btn-secondary btn-sm">{regenerating?"재작성 중...":"재작성"}</button>
                                      <div style={{marginLeft:"auto",display:"flex",gap:6}}>
                                        <button onClick={()=>handleDraftSave(activeItem.id,activeChannel)} className="btn btn-secondary btn-sm">{draftSavedKey===ck?"저장됨 ✓":"임시 저장"}</button>
                                        <button onClick={()=>setShowSchedulePanel(v=>!v)} className="btn btn-secondary btn-sm">예약 발행</button>
                                      </div>
                                    </div>

                                    <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:10}}>
                                      <div className="dot" style={{background:canAuto?"var(--success)":"var(--border)"}}/>
                                      <span style={{fontSize:12,color:"var(--text-3)"}}>{canAuto?"자동 발행 가능":"자동 발행 불가 — 복사 후 직접 게시"}</span>
                                    </div>

                                    {showSchedulePanel && (
                                      <div style={{padding:14,background:"var(--bg)",borderRadius:"var(--r-md)",marginBottom:14,border:"1px solid var(--border-light)"}}>
                                        <div className="form-label">예약 발행 일시</div>
                                        <div style={{display:"flex",gap:8}}>
                                          <input type="datetime-local" className="form-input" style={{flex:1}} value={scheduledDate[activeItem.id]||""} onChange={e=>setScheduledDate(p=>({...p,[activeItem.id]:e.target.value}))}/>
                                          <button className="btn btn-primary btn-sm" onClick={()=>{localStorage.setItem(`sfa_sched_${activeItem.id}`,scheduledDate[activeItem.id]||"");setShowSchedulePanel(false)}}>설정</button>
                                        </div>
                                      </div>
                                    )}

                                    {isImageView ? (
                                      <div style={{display:"flex",gap:14,marginBottom:14}}>
                                        <div style={{flexShrink:0}}>
                                          {imageCache[activeItem.id]
                                            ? <img src={imageCache[activeItem.id]} alt="브랜드 카드" style={{width:180,height:180,borderRadius:"var(--r-md)",objectFit:"cover",border:"1px solid var(--border-light)"}}/>
                                            : <div style={{width:180,height:180,background:"var(--bg)",borderRadius:"var(--r-md)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12.5,color:"var(--text-3)",border:"1px solid var(--border-light)"}}>이미지 생성 중...</div>}
                                        </div>
                                        <textarea className="form-input" style={{flex:1,minHeight:180,lineHeight:1.8}} value={currentText} onChange={e=>setEditedContent(p=>({...p,[ck]:e.target.value}))}/>
                                      </div>
                                    ) : (
                                      <textarea className="form-input" style={{minHeight:240,marginBottom:14,lineHeight:1.8}} value={currentText} onChange={e=>setEditedContent(p=>({...p,[ck]:e.target.value}))}/>
                                    )}

                                    {activeChannel==="INSTAGRAM" && activeItem.content.instagram.hashtags.length>0 && (
                                      <div style={{marginBottom:14}}>
                                        <div className="form-label">해시태그</div>
                                        <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                                          {activeItem.content.instagram.hashtags.map(h=><span key={h} style={{background:"var(--blue-light)",color:"var(--blue)",borderRadius:20,padding:"3px 10px",fontSize:12.5,fontWeight:600}}>{h}</span>)}
                                        </div>
                                      </div>
                                    )}

                                    <div style={{display:"flex",gap:8,paddingTop:14,borderTop:"1px solid var(--border-light)"}}>
                                      <button className="btn btn-secondary" onClick={()=>copy(activeItem.id+activeChannel,currentText)}>{copied===activeItem.id+activeChannel?"복사됨 ✓":"복사하기"}</button>
                                      <button className="btn btn-primary" onClick={()=>handlePublish(activeItem)} disabled={publishing||!canAuto} title={canAuto?"자동 발행":"API 연동 후 사용 가능"}>
                                        {publishing?"발행 중...":canAuto?"자동 발행":"발행 불가 (연동 필요)"}
                                      </button>
                                    </div>

                                    {publishResults.length>0 && (
                                      <div style={{marginTop:14,display:"flex",flexDirection:"column",gap:6}}>
                                        {publishResults.map((r:any)=>(
                                          <div key={r.channel} style={{display:"flex",alignItems:"center",gap:8,fontSize:13.5,padding:"8px 12px",background:"var(--bg)",borderRadius:"var(--r-sm)"}}>
                                            <div className="dot" style={{background:r.success?"var(--success)":r.fallback?"var(--warning)":"var(--danger)"}}/>
                                            <span style={{fontWeight:600}}>{CHANNEL_META[r.channel as TChannel]?.label}</span>
                                            <span style={{color:"var(--text-3)",marginLeft:"auto",fontSize:12.5}}>{r.success?"발행 완료":r.fallback?"소재 저장됨":`실패: ${r.error||"연동 필요"}`}</span>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </>
                                )
                              })() : (
                                <div style={{color:"var(--text-3)",textAlign:"center",padding:44,fontSize:14}}>콘텐츠를 생성해 주세요</div>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="card" style={{display:"flex",alignItems:"center",justifyContent:"center",minHeight:280}}>
                            <div style={{textAlign:"center"}}>
                              <div style={{fontSize:14.5,color:"var(--text-3)",marginBottom:7}}>왼쪽 목록에서 콘텐츠를 선택하세요</div>
                              <div style={{fontSize:13,color:"var(--text-4)"}}>채널별 탭에서 내용 확인 · 복사 · 발행 가능</div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}

                {/* ── 보관함 ── */}
                {nav==="storage" && !generating && (
                  <>
                    <div className="view-header">
                      <div>
                        <div className="view-title">소재 보관함</div>
                        <div className="view-sub">생성된 전체 소재 · 채널별 복사 · 발행 일정으로 이동</div>
                      </div>
                      <button onClick={loadHistory} className="btn btn-secondary btn-sm">{dbLoading?"…":"새로고침"}</button>
                    </div>
                    {displayItems.length===0 ? (
                      <div className="empty-state">
                        <div className="empty-icon">📂</div>
                        <div className="empty-title">저장된 소재가 없어요</div>
                        <div className="empty-sub">콘텐츠를 생성하면 자동으로 여기에 저장됩니다.</div>
                        <button className="btn btn-primary" onClick={()=>setNav("create")}>콘텐츠 생성하기</button>
                      </div>
                    ) : (
                      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(210px,1fr))",gap:12}}>
                        {displayItems.map(item=>{
                          const st = STATUS_STYLE[item.status as keyof typeof STATUS_STYLE]||STATUS_STYLE.draft
                          return (
                            <div key={item.id} className="card-sm" style={{cursor:"pointer",transition:"box-shadow 0.15s"}}
                              onClick={()=>{setActiveItem(item);setActiveChannel(item.channels[0]||"INSTAGRAM");setNav("schedule")}}>
                              <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
                                <span className={`badge ${st.cls}`}>{st.label}</span>
                                <span style={{fontSize:12,color:"var(--text-3)"}}>{fmtDate(item.date)}</span>
                              </div>
                              <div style={{fontSize:13.5,fontWeight:600,color:"var(--text-1)",lineHeight:1.4,marginBottom:10}}>{item.topic}</div>
                              <div style={{display:"flex",gap:4,marginBottom:10}}>
                                {item.channels.map(ch=><div key={ch} className="dot" style={{background:CHANNEL_META[ch as TChannel]?.color||"var(--border)"}}/>)}
                              </div>
                              <button className="btn btn-secondary btn-sm" style={{width:"100%",fontSize:12}}
                                onClick={e=>{e.stopPropagation();setActiveItem(item);setActiveChannel(item.channels[0]||"INSTAGRAM");setNav("schedule")}}>
                                열어보기 →
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </>
                )}

                {/* ── 채널 분석 ── */}
                {nav==="stats" && !generating && (
                  <>
                    <div className="view-header">
                      <div>
                        <div className="view-title">채널 분석</div>
                        <div className="view-sub">채널별 방문자 · 팔로워 · 유입자 통계 (채널 연동 후 실데이터 수집)</div>
                      </div>
                    </div>
                    <div className="stats-grid">
                      {[
                        {label:"총 생성",  value:dbItems.length,                                       color:"var(--blue)"},
                        {label:"게시 완료", value:dbItems.filter(i=>i.status==="published").length,    color:"var(--success)"},
                        {label:"임시저장", value:dbItems.filter(i=>i.status==="draft").length,        color:"var(--warning)"},
                      ].map(s=>(
                        <div key={s.label} className="stat-card">
                          <div className="stat-val" style={{color:s.color}}>{s.value}</div>
                          <div className="stat-label">{s.label}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{fontSize:15,fontWeight:700,color:"var(--text-1)",marginBottom:12}}>채널별 통계</div>
                    <div className="stats-ch-grid">
                      {ALL_CHANNELS.map(ch=>{
                        const m = CHANNEL_META[ch]; const connected = CHANNEL_CONNECTED.has(ch)
                        return (
                          <div key={ch} className="stats-ch-card">
                            <div className="stats-ch-name"><div className="dot" style={{background:m.color,width:10,height:10}}/>{m.label}</div>
                            <div className="stats-ch-row"><span className="stats-ch-key">팔로워</span><span className="stats-ch-val" style={!connected?{color:"var(--text-4)"}:{}}>—</span></div>
                            <div className="stats-ch-row"><span className="stats-ch-key">이번 주 조회</span><span className="stats-ch-val" style={!connected?{color:"var(--text-4)"}:{}}>—</span></div>
                            <div className="stats-ch-row"><span className="stats-ch-key">게시물</span><span className="stats-ch-val" style={!connected?{color:"var(--text-4)"}:{}}>—</span></div>
                            <div className="stats-ch-note">{connected?"API 연동됨 · 데이터 수집 준비 중":"채널 연동 후 실시간 데이터 수집 예정"}</div>
                          </div>
                        )
                      })}
                    </div>
                  </>
                )}

                {/* ── 브랜드 설정 ── */}
                {nav==="settings" && !generating && (
                  <>
                    <div className="view-header">
                      <div>
                        <div className="view-title">브랜드 설정</div>
                        <div className="view-sub">최대 5개 브랜드 저장 · 활성 브랜드가 AI 글쓰기에 자동 반영됩니다</div>
                      </div>
                    </div>
                    <div className="brand-grid">
                      {brandProfiles.map(profile=>(
                        <div key={profile.id} style={{background:"var(--bg-card)",border:`2px solid ${activeBrandId===profile.id?profile.color:"var(--border-light)"}`,borderRadius:"var(--r-lg)",overflow:"hidden",transition:"border-color 0.15s",boxShadow:"var(--shadow-xs)"}}>
                          <div style={{height:4,background:profile.color}}/>
                          <div style={{padding:"14px 16px"}}>
                            {activeBrandId===profile.id && <div style={{display:"inline-block",background:profile.color,color:"#fff",fontSize:11,fontWeight:700,padding:"2px 9px",borderRadius:10,marginBottom:8}}>현재 사용 중</div>}
                            <div style={{fontWeight:800,fontSize:15,color:"var(--text-1)",marginBottom:8}}>{profile.name||<span style={{color:"var(--text-3)",fontWeight:400,fontSize:14}}>이름 없음</span>}</div>
                            {profile.keywords && <div style={{fontSize:12.5,color:"var(--text-2)",marginBottom:3}}>키워드: {profile.keywords}</div>}
                            {profile.hashtags && <div style={{fontSize:12.5,color:"var(--text-2)",marginBottom:3}}>태그: {profile.hashtags}</div>}
                            {profile.blogUrl  && <div style={{fontSize:12.5,color:"var(--blue)",marginBottom:3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{profile.blogUrl}</div>}
                            <div style={{display:"flex",gap:6,marginTop:12}}>
                              {activeBrandId!==profile.id && <button onClick={()=>switchBrand(profile.id)} style={{flex:1,padding:"7px 0",background:profile.color,color:"#fff",border:"none",borderRadius:"var(--r-sm)",fontSize:12.5,fontWeight:700,cursor:"pointer"}}>이걸로 사용</button>}
                              <button onClick={()=>setEditingBrandId(editingBrandId===profile.id?null:profile.id)} style={{flex:activeBrandId!==profile.id?1:2,padding:"7px 0",background:editingBrandId===profile.id?"var(--text-1)":"var(--bg)",color:editingBrandId===profile.id?"#fff":"var(--text-2)",border:"1px solid var(--border)",borderRadius:"var(--r-sm)",fontSize:12.5,fontWeight:700,cursor:"pointer",transition:"all 0.15s"}}>
                                {editingBrandId===profile.id?"접기":"편집"}
                              </button>
                            </div>
                          </div>
                          {editingBrandId===profile.id && (
                            <div style={{borderTop:"1px solid var(--border-light)",padding:"14px 16px",background:"var(--bg)",display:"flex",flexDirection:"column",gap:10}}>
                              {([
                                {label:"브랜드명",key:"name",placeholder:"예) 페이플레이"},
                                {label:"자주 쓰는 키워드",key:"keywords",placeholder:"소상공인, 창업, 마케팅"},
                                {label:"고정 해시태그",key:"hashtags",placeholder:"#소상공인 #마케팅"},
                                {label:"블로그/채널 링크",key:"blogUrl",placeholder:"https://blog.naver.com/..."},
                                {label:"메모",key:"note",placeholder:"이 브랜드 관련 메모"},
                              ] as {label:string;key:keyof BrandProfile;placeholder:string}[]).map(f=>(
                                <div key={String(f.key)}>
                                  <div className="form-label">{f.label}</div>
                                  <input className="form-input" placeholder={f.placeholder} value={String(profile[f.key]||"")} onChange={e=>updateBrandProfile({...profile,[f.key]:e.target.value})}/>
                                </div>
                              ))}
                              <div>
                                <div className="form-label">대표 컬러</div>
                                <div style={{display:"flex",gap:8,alignItems:"center"}}>
                                  <input type="color" style={{width:38,height:38,border:"1.5px solid var(--border)",borderRadius:"var(--r-sm)",cursor:"pointer",padding:2}} value={profile.color} onChange={e=>updateBrandProfile({...profile,color:e.target.value})}/>
                                  <input className="form-input" placeholder="#111111" value={profile.color} onChange={e=>updateBrandProfile({...profile,color:e.target.value})}/>
                                </div>
                              </div>
                              <button onClick={()=>setEditingBrandId(null)} className="btn btn-primary btn-full">저장 완료</button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {/* ── 수정 요청 / 관리자 ── */}
                {nav==="admin" && !generating && (
                  <>
                    <div className="view-header">
                      <div>
                        <div className="view-title">수정 요청 · 관리자</div>
                        <div className="view-sub">개선 요청 등록 및 Claude 자동 진단</div>
                      </div>
                    </div>
                    <div className="card" style={{marginBottom:20}}>
                      <div style={{fontSize:15,fontWeight:700,marginBottom:4}}>수정 요청 게시판</div>
                      <div style={{fontSize:13,color:"var(--text-3)",marginBottom:16}}>개선이 필요한 내용을 등록하면 Claude가 처리해요.</div>
                      <div style={{background:"var(--bg)",borderRadius:"var(--r-md)",padding:16,marginBottom:16}}>
                        <div className="form-field"><div className="form-label">제목</div><input className="form-input" placeholder="예) 발행 일정 탭에서 삭제 버튼 추가" value={newFix.title} onChange={e=>setNewFix(p=>({...p,title:e.target.value}))}/></div>
                        <div className="form-field"><div className="form-label">상세 내용</div><textarea className="form-input" style={{minHeight:80}} placeholder="어떤 화면에서, 어떤 기능이 필요한지 자세히 적어주세요..." value={newFix.content} onChange={e=>setNewFix(p=>({...p,content:e.target.value}))}/></div>
                        <div onDragOver={e=>{e.preventDefault();setIsDraggingFix(true)}} onDragLeave={()=>setIsDraggingFix(false)} onDrop={handleFixImageDrop}
                          style={{border:`1.5px dashed ${isDraggingFix?"var(--blue)":"var(--border)"}`,borderRadius:"var(--r-sm)",padding:12,textAlign:"center",cursor:"pointer",background:isDraggingFix?"var(--blue-light)":"var(--bg-card)",marginBottom:10,fontSize:13,color:"var(--text-3)"}}>
                          스크린샷을 여기에 드래그하거나
                          <label style={{color:"var(--blue)",fontWeight:600,cursor:"pointer",marginLeft:5}}>
                            클릭해서 업로드
                            <input type="file" accept="image/*" style={{display:"none"}} onChange={e=>{const file=e.target.files?.[0];if(!file) return;const reader=new FileReader();reader.onload=ev=>{if(ev.target?.result) setNewFix(p=>({...p,images:[...p.images,ev.target!.result as string]}))};reader.readAsDataURL(file)}}/>
                          </label>
                        </div>
                        {newFix.images.length>0 && (
                          <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:10}}>
                            {newFix.images.map((img,i)=>(
                              <div key={i} style={{position:"relative"}}>
                                <img src={img} alt="" style={{width:80,height:80,objectFit:"cover",borderRadius:"var(--r-sm)",border:"1px solid var(--border)"}}/>
                                <button onClick={()=>setNewFix(p=>({...p,images:p.images.filter((_,j)=>j!==i)}))} style={{position:"absolute",top:-6,right:-6,width:18,height:18,borderRadius:"50%",background:"var(--danger)",color:"white",border:"none",fontSize:12,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
                              </div>
                            ))}
                          </div>
                        )}
                        <button onClick={handleAddFix} disabled={!newFix.title.trim()} className="btn btn-primary btn-sm">요청 등록</button>
                      </div>
                      {fixRequests.length===0 ? (
                        <div style={{textAlign:"center",padding:"20px 0",fontSize:13.5,color:"var(--text-3)"}}>등록된 수정 요청이 없어요</div>
                      ) : (
                        <div style={{display:"flex",flexDirection:"column",gap:10}}>
                          {fixRequests.map(req=>(
                            <div key={req.id} style={{background:"var(--bg-card)",border:"1px solid var(--border-light)",borderRadius:"var(--r-md)",padding:14,borderLeft:`3px solid ${req.status==="done"?"var(--success)":req.status==="in_progress"?"var(--blue)":"var(--warning)"}`}}>
                              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
                                <div style={{fontSize:13.5,fontWeight:700,flex:1}}>{req.title}</div>
                                <div style={{display:"flex",gap:5,alignItems:"center",flexShrink:0,marginLeft:8}}>
                                  <span className={`badge ${req.status==="done"?"badge-green":req.status==="in_progress"?"badge-blue":"badge-orange"}`}>{req.status==="done"?"처리 완료":req.status==="in_progress"?"처리 중":"대기 중"}</span>
                                  <button onClick={()=>{updateFixRequest({...req,status:req.status==="pending"?"in_progress":req.status==="in_progress"?"done":"pending"});setFixRequests(getFixRequests())}} className="btn-ghost" style={{fontSize:12,padding:"3px 7px"}}>상태 변경</button>
                                  <button onClick={()=>{deleteFixRequest(req.id);setFixRequests(getFixRequests())}} className="btn-danger-ghost" style={{fontSize:12,padding:"3px 7px"}}>삭제</button>
                                </div>
                              </div>
                              {req.content && <div style={{fontSize:12.5,color:"var(--text-2)",lineHeight:1.6,marginBottom:6}}>{req.content}</div>}
                              <div style={{fontSize:11.5,color:"var(--text-4)"}}>{new Date(req.createdAt).toLocaleString("ko-KR")}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="card" style={{maxWidth:600}}>
                      <div style={{fontSize:15,fontWeight:700,marginBottom:14}}>Claude 자동 진단</div>
                      <div className="form-field"><div className="form-label">관리자 키</div><input type="password" className="form-input" placeholder="SFA 관리자 키" value={adminKey} onChange={e=>setAdminKey(e.target.value)}/></div>
                      <div className="form-field"><div className="form-label">오류 내용</div><textarea className="form-input" style={{minHeight:120}} placeholder="오류 메시지, 스택 트레이스 등 붙여넣기..." value={diagError} onChange={e=>setDiagError(e.target.value)}/></div>
                      <button className="btn btn-primary btn-full" onClick={handleDiag} disabled={diagLoading||!diagError||!adminKey}>{diagLoading?"분석 중...":"Claude 진단 요청"}</button>
                      {diagResult && (
                        <div style={{marginTop:20,display:"flex",flexDirection:"column",gap:12}}>
                          <div style={{padding:14,background:"#FFF4E0",borderRadius:"var(--r-md)"}}><div style={{fontSize:12.5,fontWeight:700,color:"var(--warning)",marginBottom:6}}>원인 분석</div><div style={{fontSize:13.5,color:"var(--text-1)"}}>{diagResult.cause}</div></div>
                          <div style={{padding:14,background:"var(--success-light)",borderRadius:"var(--r-md)"}}><div style={{fontSize:12.5,fontWeight:700,color:"var(--success)",marginBottom:6}}>해결 방법</div><div style={{fontSize:13.5,color:"var(--text-1)"}}>{diagResult.solution}</div></div>
                          {diagResult.fixedCode && (
                            <div style={{padding:14,background:"#1E1E2E",borderRadius:"var(--r-md)"}}>
                              <div style={{fontSize:12.5,fontWeight:700,color:"#A0AEC0",marginBottom:8}}>수정 코드</div>
                              <pre style={{fontSize:12.5,color:"#E2E8F0",overflow:"auto",margin:0}}>{diagResult.fixedCode}</pre>
                              <button className="btn btn-secondary btn-sm" style={{marginTop:10,background:"rgba(255,255,255,0.1)",color:"#E2E8F0",border:"1px solid rgba(255,255,255,0.2)"}} onClick={()=>copy("diag",diagResult.fixedCode)}>{copied==="diag"?"복사됨 ✓":"코드 복사"}</button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </>
            )}

            {/* ════ VISUAL MAKER AUTO ════ */}
            {service==="visual" && (
              <>
                <div className="visual-hero">
                  <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",flexWrap:"wrap",gap:12}}>
                    <div>
                      <div className="visual-hero-title">Visual Maker Auto</div>
                      <div className="visual-hero-sub">AI가 브랜드 이미지와 영상을 자동으로 만들어줘요<br/>Flux API · Midjourney · Remotion 파이프라인</div>
                    </div>
                    <span className="coming-soon" style={{background:"rgba(255,255,255,0.15)",border:"1px solid rgba(255,255,255,0.25)",color:"rgba(255,255,255,0.9)"}}>Beta</span>
                  </div>
                  <div className="visual-mode-tabs">
                    <button className={`visual-mode-tab ${visualMode==="image"?"active":""}`} onClick={()=>setVisualMode("image")}>이미지 생성 (Flux)</button>
                    <button className={`visual-mode-tab ${visualMode==="upload"?"active":""}`} onClick={()=>setVisualMode("upload")}>수동 업로드</button>
                    <button className={`visual-mode-tab ${visualMode==="video"?"active":""}`} onClick={()=>setVisualMode("video")}>
                      영상 생성
                      <span style={{marginLeft:6,fontSize:10,opacity:0.7}}>준비 중</span>
                    </button>
                  </div>
                </div>

                {/* 이미지 생성 (Flux) */}
                {visualMode==="image" && (
                  <>
                    <div className="flux-card">
                      <div className="flux-label">프롬프트</div>
                      <div style={{display:"flex",gap:8,marginBottom:16}}>
                        <textarea className="cmd-input textarea" style={{minHeight:72}}
                          placeholder="예) 소상공인을 위한 여름 마케팅, 밝고 활기찬 분위기, 카페 배경&#10;한국어로 입력하면 자동으로 영어 프롬프트로 변환됩니다"
                          value={fluxPrompt} onChange={e=>setFluxPrompt(e.target.value)}/>
                      </div>

                      <div className="flux-label">스타일</div>
                      <div className="flux-style-grid">
                        {[
                          {id:"realistic",label:"사실적"},
                          {id:"illustration",label:"일러스트"},
                          {id:"minimal",label:"미니멀"},
                          {id:"bold",label:"Bold 타이포"},
                          {id:"photo",label:"사진 스타일"},
                          {id:"3d",label:"3D 렌더"},
                          {id:"watercolor",label:"수채화"},
                          {id:"flat",label:"플랫 디자인"},
                        ].map(s=>(
                          <button key={s.id} className={`flux-style-btn ${fluxStyle===s.id?"active":""}`} onClick={()=>setFluxStyle(s.id)}>{s.label}</button>
                        ))}
                      </div>

                      <div className="flux-label">사이즈</div>
                      <div className="flux-size-btns">
                        {[
                          {id:"square",label:"1:1",desc:"인스타 정방형"},
                          {id:"portrait",label:"4:5",desc:"인스타 세로"},
                          {id:"story",label:"9:16",desc:"스토리/릴스"},
                          {id:"landscape",label:"16:9",desc:"유튜브 썸네일"},
                        ].map(s=>(
                          <button key={s.id} className={`flux-size-btn ${fluxSize===s.id?"active":""}`} onClick={()=>setFluxSize(s.id)}>
                            <div style={{fontWeight:700,fontSize:14}}>{s.label}</div>
                            <div style={{fontSize:11,marginTop:2,opacity:0.75}}>{s.desc}</div>
                          </button>
                        ))}
                      </div>

                      <button className="flux-gen-btn" onClick={handleFluxGenerate} disabled={fluxLoading||!fluxPrompt.trim()}>
                        {fluxLoading ? (
                          <span style={{display:"flex",alignItems:"center",gap:8,justifyContent:"center"}}>
                            <span style={{width:16,height:16,border:"2px solid rgba(255,255,255,0.3)",borderTopColor:"#fff",borderRadius:"50%",animation:"spin 0.7s linear infinite",display:"inline-block"}}/>
                            이미지 생성 중...
                          </span>
                        ) : "✦ 이미지 생성하기"}
                      </button>

                      <div style={{marginTop:12,padding:"10px 14px",background:"var(--purple-light)",borderRadius:"var(--r-sm)",fontSize:12.5,color:"var(--purple)"}}>
                        <strong>fal.ai Flux API 연동 필요</strong> — .env에 FAL_KEY를 추가하면 자동으로 작동합니다.
                        이미지 생성 비용: 약 $0.003/장 (flux/schnell 기준)
                      </div>
                    </div>

                    {/* 생성 결과 */}
                    {fluxImages.length>0 && (
                      <div>
                        <div className="result-header">
                          <div className="result-title">생성된 이미지 ({fluxImages.length}장)</div>
                          <button className="btn btn-secondary btn-sm" onClick={()=>setFluxImages([])}>초기화</button>
                        </div>
                        <div className="img-result-grid">
                          {fluxImages.map((url,i)=>(
                            <div key={i} className="img-result-card">
                              <img src={url} alt={`생성 이미지 ${i+1}`}/>
                              <div className="img-result-actions">
                                <a href={url} download={`image-${i+1}.png`} className="btn btn-secondary btn-sm" style={{flex:1,textDecoration:"none",textAlign:"center"}}>다운로드</a>
                                <button className="btn btn-primary btn-sm" style={{flex:1}} onClick={()=>copy(`img-${i}`,url)}>{copied===`img-${i}`?"복사됨 ✓":"URL 복사"}</button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* 수동 업로드 (Midjourney용) */}
                {visualMode==="upload" && (
                  <div>
                    <div style={{marginBottom:16,padding:"14px 18px",background:"var(--warning-light)",borderRadius:"var(--r-md)",border:"1px solid #FDE68A",fontSize:13.5,color:"#92400E",lineHeight:1.7}}>
                      <strong>Midjourney 자동화 안내</strong><br/>
                      Midjourney는 Discord 전용으로 API를 제공하지 않아 자동화가 불가능합니다.<br/>
                      Discord에서 이미지를 생성한 후, 여기에 업로드해서 SNS 발행에 활용하세요.
                    </div>
                    <div className="flux-card">
                      <div className="upload-zone"
                        onDragOver={e=>{e.preventDefault();e.currentTarget.classList.add("drag")}}
                        onDragLeave={e=>e.currentTarget.classList.remove("drag")}
                        onDrop={e=>{
                          e.preventDefault(); e.currentTarget.classList.remove("drag")
                          const files = Array.from(e.dataTransfer.files).filter(f=>f.type.startsWith("image/"))
                          files.forEach(file=>{
                            const reader = new FileReader()
                            reader.onload = ev => { if(ev.target?.result) setFluxImages(p=>[...p,ev.target!.result as string]) }
                            reader.readAsDataURL(file)
                          })
                        }}>
                        <div className="upload-zone-icon">🖼️</div>
                        <div className="upload-zone-title">이미지를 드래그하거나 클릭해서 업로드</div>
                        <div className="upload-zone-sub">PNG, JPG, WebP 지원 · 여러 파일 동시 업로드 가능</div>
                        <label style={{marginTop:14,display:"inline-block",cursor:"pointer"}}>
                          <span className="btn btn-secondary btn-sm">파일 선택</span>
                          <input type="file" accept="image/*" multiple style={{display:"none"}} onChange={e=>{
                            Array.from(e.target.files||[]).forEach(file=>{
                              const reader = new FileReader()
                              reader.onload = ev => { if(ev.target?.result) setFluxImages(p=>[...p,ev.target!.result as string]) }
                              reader.readAsDataURL(file)
                            })
                          }}/>
                        </label>
                      </div>
                      {fluxImages.length>0 && (
                        <div>
                          <div style={{fontSize:14,fontWeight:700,margin:"16px 0 10px"}}>업로드된 이미지 ({fluxImages.length}장)</div>
                          <div className="img-result-grid">
                            {fluxImages.map((url,i)=>(
                              <div key={i} className="img-result-card">
                                <img src={url} alt={`업로드 ${i+1}`}/>
                                <div className="img-result-actions">
                                  <button className="btn btn-danger-ghost btn-sm" style={{flex:1,border:"1px solid var(--danger-light)"}} onClick={()=>setFluxImages(p=>p.filter((_,j)=>j!==i))}>삭제</button>
                                  <button className="btn btn-primary btn-sm" style={{flex:1}} onClick={()=>{setNav("create");setService("sns");addLog("이미지 업로드 완료 — SNS 생성에 활용하세요","success")}}>SNS에 활용</button>
                                </div>
                              </div>
                            ))}
                          </div>
                          <button className="btn btn-secondary" style={{marginTop:12,width:"100%"}} onClick={()=>setFluxImages([])}>전체 초기화</button>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* 영상 생성 (VideoMaker) */}
                {visualMode==="video" && (
                  <VideoMaker brandName={brand.name} brandColor={brand.color} />
                )}
              </>
            )}

          </div>
        </main>
      </div>

      {/* ════ MODALS ════ */}

      {/* 채널 연동 가이드 모달 */}
      {guideChannel && (
        <div className="modal-overlay" onClick={()=>setGuideChannel(null)}>
          <div className="modal-box" style={{maxWidth:480}} onClick={e=>e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <div className="modal-title">{CHANNEL_GUIDE[guideChannel]?.title||`${CHANNEL_META[guideChannel]?.label} 연동`}</div>
                <div className="modal-sub">{CHANNEL_CONNECTED.has(guideChannel)?"현재 연동됨":"현재 미연동"}</div>
              </div>
              <button className="modal-close" onClick={()=>setGuideChannel(null)}>×</button>
            </div>
            <div className="modal-body">
              <div style={{marginBottom:12}}>
                <span style={{display:"inline-flex",alignItems:"center",gap:5,padding:"4px 11px",borderRadius:20,background:CHANNEL_CONNECTED.has(guideChannel)?"var(--success-light)":"var(--warning-light)",color:CHANNEL_CONNECTED.has(guideChannel)?"var(--success)":"var(--warning)",fontSize:12.5,fontWeight:700}}>
                  {CHANNEL_CONNECTED.has(guideChannel)?"✅ 연동 완료":"⚠️ 연동 필요"}
                </span>
              </div>
              <div style={{fontSize:12,fontWeight:700,color:"var(--text-3)",marginBottom:10,textTransform:"uppercase",letterSpacing:0.5}}>연동 방법</div>
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {(CHANNEL_GUIDE[guideChannel]?.steps||["가이드 준비 중입니다."]).map((step,i)=>(
                  <div key={i} style={{display:"flex",gap:9,padding:"9px 13px",background:"var(--bg)",borderRadius:"var(--r-sm)",fontSize:13.5,color:"var(--text-1)",lineHeight:1.6}}>{step}</div>
                ))}
              </div>
              {CHANNEL_GUIDE[guideChannel]?.link && (
                <div style={{marginTop:14,padding:"11px 13px",background:"var(--blue-light)",borderRadius:"var(--r-md)"}}>
                  <div style={{fontSize:12.5,color:"var(--blue)",fontWeight:600,marginBottom:4}}>공식 개발자 문서</div>
                  <div style={{fontSize:12.5,color:"var(--text-2)"}}>{CHANNEL_GUIDE[guideChannel]?.linkLabel}</div>
                  <div style={{fontSize:12,color:"var(--blue)",marginTop:3,wordBreak:"break-all"}}>{CHANNEL_GUIDE[guideChannel]?.link}</div>
                </div>
              )}
            </div>
            <div className="modal-footer"><button onClick={()=>setGuideChannel(null)} className="btn btn-secondary btn-full">닫기</button></div>
          </div>
        </div>
      )}

      {/* 채널 선택 모달 */}
      {showChannelModal && (
        <div className="modal-overlay" onClick={()=>setShowChannelModal(false)}>
          <div className="modal-box" style={{maxWidth:440}} onClick={e=>e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <div className="modal-title">발행 채널 선택</div>
                <div className="modal-sub">1개 이상 선택해야 콘텐츠가 생성됩니다</div>
              </div>
              <button className="modal-close" onClick={()=>setShowChannelModal(false)}>×</button>
            </div>
            <div className="modal-body">
              {CHANNEL_SECTIONS.map(section=>(
                <div key={section.label} style={{marginBottom:14}}>
                  <div style={{fontSize:11,fontWeight:700,color:"var(--text-3)",textTransform:"uppercase",letterSpacing:0.8,marginBottom:6}}>{section.label}</div>
                  <div style={{display:"flex",flexDirection:"column",gap:5}}>
                    {section.channels.map(ch=>{
                      const m = CHANNEL_META[ch]; const on = channels.includes(ch); const connected = CHANNEL_CONNECTED.has(ch)
                      return (
                        <button key={ch} onClick={()=>toggleCh(ch)}
                          style={{display:"flex",alignItems:"center",gap:10,padding:"9px 13px",borderRadius:"var(--r-sm)",border:`1.5px solid ${on?m.color:"var(--border)"}`,background:on?`${m.color}12`:"var(--bg-card)",cursor:"pointer",textAlign:"left",transition:"all 0.15s",opacity:connected?1:0.7}}>
                          <div style={{width:9,height:9,borderRadius:"50%",background:on?m.color:"var(--border)",flexShrink:0}}/>
                          <span style={{flex:1,fontSize:13.5,fontWeight:on?700:500,color:on?"var(--text-1)":"var(--text-2)"}}>{m.label}</span>
                          {!connected && <span style={{fontSize:11,color:"var(--text-3)"}}>미연동</span>}
                          <div style={{width:36,height:20,borderRadius:10,background:on?m.color:"var(--border)",position:"relative",flexShrink:0,transition:"background 0.2s"}}>
                            <div style={{width:16,height:16,borderRadius:"50%",background:"white",position:"absolute",top:2,left:on?18:2,transition:"left 0.2s",boxShadow:"0 1px 4px rgba(0,0,0,0.18)"}}/>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div className="modal-footer">
              <div style={{fontSize:13,color:"var(--text-3)",marginBottom:10,textAlign:"center"}}>
                {channels.length===0?"채널을 1개 이상 선택해주세요":`${channels.length}개 채널 → ${count*channels.length}개 콘텐츠 생성 예정`}
              </div>
              <button className="btn btn-primary btn-full" disabled={channels.length===0}
                onClick={()=>{setShowChannelModal(false);handleGenerate()}}>
                {channels.length===0?"채널 선택 후 시작":`✦ 자동화 시작 — ${channels.length}개 채널`}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
