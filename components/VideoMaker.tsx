"use client"
import { operatorFetch } from "@/lib/customer"
import { useState, useEffect, useRef, useCallback } from "react"

// ── 타입 ─────────────────────────────────────────
type VideoStep    = 1 | 2 | 3 | 4
type RenderStatus = "idle" | "generating_images" | "rendering" | "done" | "failed"
type ImageTab     = "bank" | "generate"
type Gender       = "female" | "male"
type Situation    = "POS" | "kiosk" | "tableorder" | "custom"
type VideoFormat  = "reels" | "shorts" | "tiktok"

interface BankImage {
  id: string; url: string; label: string
  gender: string; situation: string | null; source: string; createdAt: string
}

const SITUATION_LABELS: Record<Situation, string> = {
  POS: "POS 앞", kiosk: "키오스크 앞", tableorder: "테이블오더", custom: "자유 입력",
}
const FORMAT_LABELS: Record<VideoFormat, string> = {
  reels: "인스타 릴스", shorts: "유튜브 쇼츠", tiktok: "틱톡",
}
const STEP_LABELS = ["설정", "이미지 선택", "영상 생성", "완료"]

// ── 아이콘 ────────────────────────────────────────
const IcoCheck = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" width={14} height={14}><polyline points="20 6 9 17 4 12"/></svg>
const IcoX     = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" width={13} height={13}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>

// ── 메인 컴포넌트 ─────────────────────────────────
export default function VideoMaker({ brandName, brandColor }: { brandName: string; brandColor: string }) {
  // 스텝 / 상태
  const [step,          setStep]         = useState<VideoStep>(1)
  const [renderStatus,  setRenderStatus] = useState<RenderStatus>("idle")
  const [renderPercent, setRenderPercent] = useState(0)
  const [renderError,   setRenderError]  = useState<string | null>(null)
  const [videoUrl,      setVideoUrl]     = useState<string | null>(null)
  const [renderId,      setRenderId]     = useState<string | null>(null)
  const [bucketName,    setBucketName]   = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Step 1 — 설정
  const [topic,     setTopic]     = useState("")
  const [gender,    setGender]    = useState<Gender>("female")
  const [situation, setSituation] = useState<Situation>("POS")
  const [customPrompt, setCustomPrompt] = useState("")
  const [format,    setFormat]    = useState<VideoFormat>("reels")
  const [ctaText,   setCtaText]   = useState("페이플레이와 함께하세요")
  const [outroContact, setOutroContact] = useState("payplay.co.kr")

  // Step 2 — 이미지
  const [imageTab,       setImageTab]       = useState<ImageTab>("bank")
  const [bankImages,     setBankImages]     = useState<BankImage[]>([])
  const [bankLoading,    setBankLoading]    = useState(false)
  const [selectedImages, setSelectedImages] = useState<string[]>([])
  const [genImages,      setGenImages]      = useState<string[]>([])
  const [genLoading,     setGenLoading]     = useState(false)
  const [genError,       setGenError]       = useState<string | null>(null)

  // 이미지 뱅크 로드
  const loadBank = useCallback(async () => {
    setBankLoading(true)
    try {
      const res = await operatorFetch("/api/image-bank")
      const data = await res.json()
      if (data.success) setBankImages(data.images || [])
    } catch {}
    finally { setBankLoading(false) }
  }, [])

  useEffect(() => { loadBank() }, [loadBank])

  // Flux 이미지 생성
  const handleGenerateImages = async () => {
    setGenLoading(true); setGenError(null); setGenImages([])
    try {
      const res = await operatorFetch("/api/video/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, gender, situation: situation === "custom" ? "custom" : situation, count: 4 }),
      })
      const data = await res.json()
      if (!data.success) {
        setGenError(data.setupRequired
          ? "REPLICATE_API_TOKEN이 설정되지 않았습니다. Vercel 환경변수에 추가하세요."
          : data.error || "생성 실패")
        return
      }
      setGenImages(data.images || [])
      // 뱅크 새로고침
      await loadBank()
    } catch (e: any) {
      setGenError("이미지 생성 중 오류가 발생했습니다.")
    } finally { setGenLoading(false) }
  }

  const toggleImage = (url: string) => {
    setSelectedImages(p =>
      p.includes(url) ? p.filter(u => u !== url) : p.length < 3 ? [...p, url] : p
    )
  }

  // 이미지 뱅크에서 삭제
  const deleteFromBank = async (id: string) => {
    if (!window.confirm("이미지를 삭제할까요?")) return
    try {
      await operatorFetch("/api/image-bank", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) })
      setBankImages(p => p.filter(img => img.id !== id))
    } catch {}
  }

  // 수동 업로드 → 뱅크에 저장
  const handleManualUpload = async (file: File) => {
    const reader = new FileReader()
    reader.onload = async (e) => {
      const dataUrl = e.target?.result as string
      if (!dataUrl) return
      try {
        const res = await operatorFetch("/api/image-bank", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: dataUrl, label: file.name.replace(/\.[^.]+$/, ""), gender, situation, source: "midjourney" }),
        })
        const data = await res.json()
        if (data.success) {
          setBankImages(p => [data.image, ...p])
        }
      } catch {}
    }
    reader.readAsDataURL(file)
  }

  // 영상 렌더링 시작
  const handleStartRender = async () => {
    setRenderStatus("rendering"); setRenderPercent(0); setRenderError(null); setVideoUrl(null)
    setStep(3)

    const imageUrl = selectedImages[0] || ""
    try {
      const res = await operatorFetch("/api/video/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic, imageUrl, brandName, brandColor,
          ctaText, outroText: brandName, outroContact,
        }),
      })
      const data = await res.json()

      if (!data.success) {
        if (data.setupRequired) {
          setRenderStatus("failed")
          setRenderError(
            "AWS Lambda + Remotion 환경변수가 설정되지 않았습니다.\n" +
            "아래 명령어로 설정 후 재배포하세요:\n\n" +
            "npx remotion lambda functions deploy\n" +
            "npx remotion lambda sites create --site-name=payplay-shortform"
          )
          return
        }
        setRenderStatus("failed"); setRenderError(data.error || "렌더링 시작 실패")
        return
      }

      setRenderId(data.renderId); setBucketName(data.bucketName)
      startPolling(data.renderId, data.bucketName)
    } catch (e: any) {
      setRenderStatus("failed"); setRenderError(e.message)
    }
  }

  // 상태 폴링
  const startPolling = useCallback((rid: string, bucket: string) => {
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = setInterval(async () => {
      try {
        const res = await operatorFetch(`/api/video/render/status?renderId=${rid}&bucketName=${bucket}`)
        const data = await res.json()
        if (!data.success) return
        setRenderPercent(data.percent || 0)
        if (data.status === "done") {
          clearInterval(pollRef.current!); setRenderStatus("done"); setVideoUrl(data.videoUrl); setStep(4)
        } else if (data.status === "failed") {
          clearInterval(pollRef.current!); setRenderStatus("failed"); setRenderError(data.errors?.[0] || "렌더링 실패")
        }
      } catch {}
    }, 3000)
  }, [])

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current) }, [])

  const copyToClipboard = (text: string) => navigator.clipboard.writeText(text)

  const reset = () => {
    setStep(1); setRenderStatus("idle"); setRenderPercent(0)
    setRenderError(null); setVideoUrl(null); setRenderId(null)
    setSelectedImages([])
  }

  // ── 스텝 인디케이터 ──────────────────────────────
  const StepIndicator = () => (
    <div style={{ display: "flex", alignItems: "center", gap: 0, marginBottom: 28 }}>
      {STEP_LABELS.map((label, i) => {
        const num = i + 1
        const done = step > num
        const active = step === num
        return (
          <div key={num} style={{ display: "flex", alignItems: "center", flex: i < 3 ? 1 : 0 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
              <div style={{
                width: 32, height: 32, borderRadius: "50%",
                background: done ? "#00C896" : active ? brandColor : "var(--border-light)",
                color: done || active ? "#fff" : "var(--text-3)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 13, fontWeight: 700, transition: "all 0.2s",
                flexShrink: 0,
              }}>
                {done ? <IcoCheck /> : num}
              </div>
              <span style={{ fontSize: 11, fontWeight: 600, color: active ? brandColor : done ? "#00C896" : "var(--text-3)", whiteSpace: "nowrap" }}>{label}</span>
            </div>
            {i < 3 && <div style={{ flex: 1, height: 2, background: done ? "#00C896" : "var(--border-light)", margin: "0 6px", marginBottom: 18, transition: "all 0.3s" }} />}
          </div>
        )
      })}
    </div>
  )

  // ── STEP 1: 설정 ─────────────────────────────────
  const Step1 = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <div className="flux-label">주제 / 메시지</div>
        <input className="cmd-input" style={{ height: 48 }}
          placeholder="예) 페이플레이 POS로 더 스마트한 매장 관리"
          value={topic} onChange={e => setTopic(e.target.value)} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div>
          <div className="flux-label">모델 성별</div>
          <div style={{ display: "flex", gap: 8 }}>
            {(["female", "male"] as Gender[]).map(g => (
              <button key={g} onClick={() => setGender(g)}
                style={{
                  flex: 1, padding: "10px 0", borderRadius: "var(--r-md)",
                  border: `1.5px solid ${gender === g ? brandColor : "var(--border)"}`,
                  background: gender === g ? `${brandColor}15` : "var(--bg-card)",
                  color: gender === g ? brandColor : "var(--text-2)",
                  fontWeight: 700, fontSize: 13.5, cursor: "pointer", transition: "all 0.12s",
                }}>
                {g === "female" ? "👩 여성" : "👨 남성"}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="flux-label">영상 포맷</div>
          <div style={{ display: "flex", gap: 8 }}>
            {(Object.keys(FORMAT_LABELS) as VideoFormat[]).map(f => (
              <button key={f} onClick={() => setFormat(f)}
                style={{
                  flex: 1, padding: "10px 0", borderRadius: "var(--r-md)",
                  border: `1.5px solid ${format === f ? brandColor : "var(--border)"}`,
                  background: format === f ? `${brandColor}15` : "var(--bg-card)",
                  color: format === f ? brandColor : "var(--text-2)",
                  fontWeight: 700, fontSize: 11, cursor: "pointer", transition: "all 0.12s",
                }}>
                {FORMAT_LABELS[f]}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div>
        <div className="flux-label">촬영 상황</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {(Object.keys(SITUATION_LABELS) as Situation[]).map(s => (
            <button key={s} onClick={() => setSituation(s)}
              style={{
                padding: "8px 16px", borderRadius: 20,
                border: `1.5px solid ${situation === s ? brandColor : "var(--border)"}`,
                background: situation === s ? `${brandColor}15` : "var(--bg-card)",
                color: situation === s ? brandColor : "var(--text-2)",
                fontWeight: 600, fontSize: 13, cursor: "pointer", transition: "all 0.12s",
              }}>
              {SITUATION_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div>
          <div className="flux-label">CTA 문구</div>
          <input className="cmd-input" style={{ height: 40 }}
            placeholder="페이플레이와 함께하세요"
            value={ctaText} onChange={e => setCtaText(e.target.value)} />
        </div>
        <div>
          <div className="flux-label">연락처 / 도메인</div>
          <input className="cmd-input" style={{ height: 40 }}
            placeholder="payplay.co.kr"
            value={outroContact} onChange={e => setOutroContact(e.target.value)} />
        </div>
      </div>

      <button onClick={() => setStep(2)}
        disabled={!topic.trim()}
        className="flux-gen-btn" style={{ background: `linear-gradient(135deg, ${brandColor}dd 0%, ${brandColor} 100%)` }}>
        다음 — 이미지 선택 →
      </button>
    </div>
  )

  // ── STEP 2: 이미지 선택 ──────────────────────────
  const Step2 = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* 선택된 이미지 요약 */}
      {selectedImages.length > 0 && (
        <div style={{ padding: "12px 16px", background: `${brandColor}10`, borderRadius: "var(--r-md)", border: `1px solid ${brandColor}30`, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 13, color: brandColor, fontWeight: 700 }}>{selectedImages.length}장 선택됨</span>
          <div style={{ display: "flex", gap: 6, flex: 1 }}>
            {selectedImages.map((url, i) => (
              <img key={i} src={url} alt="" style={{ width: 44, height: 44, objectFit: "cover", borderRadius: 8, border: `2px solid ${brandColor}` }} />
            ))}
          </div>
          <span style={{ fontSize: 12, color: "var(--text-3)" }}>최대 3장 (첫 번째 사용)</span>
        </div>
      )}

      {/* 탭 */}
      <div style={{ display: "flex", gap: 2, background: "var(--border-light)", borderRadius: 10, padding: 3, width: "fit-content" }}>
        {(["bank", "generate"] as ImageTab[]).map(t => (
          <button key={t} onClick={() => setImageTab(t)}
            style={{
              padding: "7px 18px", borderRadius: 8, border: "none",
              background: imageTab === t ? "var(--bg-card)" : "transparent",
              color: imageTab === t ? "var(--text-1)" : "var(--text-3)",
              fontWeight: 700, fontSize: 13, cursor: "pointer", transition: "all 0.12s",
              boxShadow: imageTab === t ? "var(--shadow-xs)" : "none",
            }}>
            {t === "bank" ? `🗃 이미지 뱅크 (${bankImages.length})` : "✨ Flux 자동 생성"}
          </button>
        ))}
      </div>

      {/* 뱅크 탭 */}
      {imageTab === "bank" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <span style={{ fontSize: 12.5, color: "var(--text-3)" }}>클릭해서 선택 · 최대 3장</span>
            <label style={{ cursor: "pointer" }}>
              <span className="btn btn-secondary btn-sm">+ Midjourney 업로드</span>
              <input type="file" accept="image/*" multiple style={{ display: "none" }}
                onChange={e => Array.from(e.target.files || []).forEach(f => handleManualUpload(f))} />
            </label>
          </div>
          {bankLoading ? (
            <div style={{ textAlign: "center", padding: 40, color: "var(--text-3)", fontSize: 13 }}>불러오는 중...</div>
          ) : bankImages.length === 0 ? (
            <div style={{ textAlign: "center", padding: 40, color: "var(--text-3)", fontSize: 13, background: "var(--bg)", borderRadius: "var(--r-md)" }}>
              이미지 뱅크가 비어있어요<br/>
              <span style={{ fontSize: 12, opacity: 0.7 }}>Flux 자동 생성 탭에서 이미지를 만들거나<br/>Midjourney 이미지를 업로드하세요</span>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 10, maxHeight: 380, overflowY: "auto" }}>
              {bankImages.map(img => {
                const isSelected = selectedImages.includes(img.url)
                return (
                  <div key={img.id} style={{ position: "relative", borderRadius: "var(--r-md)", overflow: "hidden", cursor: "pointer", border: `2.5px solid ${isSelected ? brandColor : "var(--border-light)"}`, transition: "all 0.15s" }}
                    onClick={() => toggleImage(img.url)}>
                    <img src={img.url} alt={img.label} style={{ width: "100%", aspectRatio: "9/16", objectFit: "cover", display: "block" }} />
                    {isSelected && (
                      <div style={{ position: "absolute", top: 6, right: 6, width: 22, height: 22, borderRadius: "50%", background: brandColor, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <IcoCheck />
                      </div>
                    )}
                    <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "linear-gradient(to top, rgba(0,0,0,0.7), transparent)", padding: "20px 8px 7px" }}>
                      <div style={{ fontSize: 10.5, color: "#fff", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{img.label}</div>
                      <div style={{ fontSize: 9.5, color: "rgba(255,255,255,0.7)" }}>{img.source}</div>
                    </div>
                    <button onClick={e => { e.stopPropagation(); deleteFromBank(img.id) }}
                      style={{ position: "absolute", top: 6, left: 6, width: 20, height: 20, borderRadius: "50%", background: "rgba(0,0,0,0.6)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff" }}>
                      <IcoX />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Flux 생성 탭 */}
      {imageTab === "generate" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ padding: "12px 16px", background: "var(--bg)", borderRadius: "var(--r-md)", fontSize: 13, color: "var(--text-2)", lineHeight: 1.7 }}>
            <strong>자동 프롬프트 생성:</strong> 설정한 주제·성별·상황을 기반으로 Flux AI가 이미지를 만들어요.<br />
            <span style={{ color: "var(--text-3)", fontSize: 12 }}>생성 비용: 약 11~57원/장 · REPLICATE_API_TOKEN 필요</span>
          </div>
          <button className="flux-gen-btn" onClick={handleGenerateImages} disabled={genLoading}
            style={{ background: genLoading ? "var(--border)" : `linear-gradient(135deg, #5b21b6, #7c3aed)` }}>
            {genLoading ? (
              <span style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center" }}>
                <span style={{ width: 14, height: 14, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.7s linear infinite", display: "inline-block" }} />
                이미지 생성 중...
              </span>
            ) : "✦ Flux로 이미지 생성 (4장)"}
          </button>
          {genError && (
            <div style={{ padding: "12px 16px", background: "var(--danger-light)", borderRadius: "var(--r-md)", fontSize: 13, color: "var(--danger)", whiteSpace: "pre-wrap" }}>{genError}</div>
          )}
          {genImages.length > 0 && (
            <div>
              <div style={{ fontSize: 12.5, color: "var(--text-3)", marginBottom: 10 }}>클릭해서 선택 · 자동으로 뱅크에 저장됨</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
                {genImages.map((url, i) => {
                  const isSelected = selectedImages.includes(url)
                  return (
                    <div key={i} onClick={() => toggleImage(url)}
                      style={{ position: "relative", borderRadius: "var(--r-md)", overflow: "hidden", cursor: "pointer", border: `2.5px solid ${isSelected ? "#7c3aed" : "var(--border-light)"}`, transition: "all 0.15s" }}>
                      <img src={url} alt={`생성 ${i + 1}`} style={{ width: "100%", aspectRatio: "9/16", objectFit: "cover", display: "block" }} />
                      {isSelected && (
                        <div style={{ position: "absolute", top: 6, right: 6, width: 22, height: 22, borderRadius: "50%", background: "#7c3aed", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <IcoCheck />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
        <button onClick={() => setStep(1)} className="btn btn-secondary" style={{ flex: 1 }}>← 설정으로</button>
        <button onClick={handleStartRender} disabled={selectedImages.length === 0}
          className="flux-gen-btn" style={{ flex: 2, background: `linear-gradient(135deg, ${brandColor}dd, ${brandColor})` }}>
          ✦ 영상 생성 시작
        </button>
      </div>
    </div>
  )

  // ── STEP 3: 렌더링 진행 ──────────────────────────
  const Step3 = () => (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 24, padding: "20px 0" }}>
      {renderStatus === "failed" ? (
        <>
          <div style={{ width: 60, height: 60, borderRadius: "50%", background: "var(--danger-light)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26 }}>❌</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "var(--danger)" }}>렌더링 실패</div>
          <div style={{ padding: "16px 20px", background: "var(--bg)", borderRadius: "var(--r-md)", fontSize: 13, color: "var(--text-2)", lineHeight: 1.8, whiteSpace: "pre-wrap", width: "100%", maxWidth: 480 }}>
            {renderError}
          </div>
          <button onClick={reset} className="btn btn-secondary">처음부터 다시</button>
        </>
      ) : (
        <>
          {/* 원형 프로그레스 */}
          <div style={{ position: "relative", width: 120, height: 120 }}>
            <svg viewBox="0 0 120 120" width={120} height={120}>
              <circle cx={60} cy={60} r={52} fill="none" stroke="var(--border-light)" strokeWidth={8} />
              <circle cx={60} cy={60} r={52} fill="none" stroke={brandColor} strokeWidth={8}
                strokeDasharray={`${2 * Math.PI * 52}`}
                strokeDashoffset={`${2 * Math.PI * 52 * (1 - renderPercent / 100)}`}
                strokeLinecap="round"
                style={{ transform: "rotate(-90deg)", transformOrigin: "60px 60px", transition: "stroke-dashoffset 0.5s ease" }} />
            </svg>
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 900, color: brandColor }}>
              {renderPercent}%
            </div>
          </div>

          {/* 단계 설명 */}
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: "var(--text-1)", marginBottom: 6 }}>
              {renderPercent < 30 ? "이미지 처리 중..." : renderPercent < 80 ? "영상 렌더링 중..." : "마무리 중..."}
            </div>
            <div style={{ fontSize: 13, color: "var(--text-3)" }}>
              AWS Lambda에서 1080×1920 숏폼 영상을 생성하고 있어요<br />
              보통 30~60초 소요됩니다
            </div>
          </div>

          {/* 단계 로그 */}
          <div style={{ width: "100%", maxWidth: 400, display: "flex", flexDirection: "column", gap: 8 }}>
            {[
              { label: "프레임 구성", done: renderPercent >= 10 },
              { label: "이미지 합성", done: renderPercent >= 40 },
              { label: "텍스트/애니메이션 적용", done: renderPercent >= 70 },
              { label: "MP4 인코딩", done: renderPercent >= 90 },
              { label: "S3 업로드", done: renderPercent >= 100 },
            ].map((s, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 14px", background: "var(--bg)", borderRadius: "var(--r-sm)" }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: s.done ? "#00C896" : "var(--border)", transition: "background 0.3s" }} />
                <span style={{ fontSize: 13, color: s.done ? "var(--text-1)" : "var(--text-3)", fontWeight: s.done ? 600 : 400 }}>{s.label}</span>
                {s.done && <span style={{ marginLeft: "auto", fontSize: 12, color: "#00C896" }}>✓</span>}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )

  // ── STEP 4: 완료 ─────────────────────────────────
  const Step4 = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* 완료 배너 */}
      <div style={{ padding: "20px 24px", background: "linear-gradient(135deg, #E6FBF5, #F0FFF9)", borderRadius: "var(--r-xl)", border: "1px solid #A7F3D0", textAlign: "center" }}>
        <div style={{ fontSize: 36, marginBottom: 8 }}>🎬</div>
        <div style={{ fontSize: 19, fontWeight: 800, color: "#065F46", marginBottom: 4 }}>영상이 완성됐어요!</div>
        <div style={{ fontSize: 13.5, color: "#047857" }}>1080×1920 · 15초 · MP4</div>
      </div>

      {/* 영상 미리보기 */}
      {videoUrl && (
        <div style={{ borderRadius: "var(--r-lg)", overflow: "hidden", background: "#000", display: "flex", justifyContent: "center", maxHeight: 360 }}>
          <video src={videoUrl} controls playsInline style={{ maxHeight: 360, maxWidth: "100%" }} />
        </div>
      )}

      {/* 액션 버튼들 */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {videoUrl && (
          <a href={videoUrl} download={`${topic || "payplay-shortform"}.mp4`}
            className="btn btn-primary btn-full" style={{ textDecoration: "none", justifyContent: "center", fontSize: 14.5, padding: "12px 0" }}>
            ⬇ MP4 다운로드
          </a>
        )}
        {videoUrl && (
          <button onClick={() => copyToClipboard(videoUrl)} className="btn btn-secondary btn-full" style={{ fontSize: 13.5 }}>
            🔗 영상 URL 복사
          </button>
        )}
      </div>

      {/* 수동 발행 가이드 */}
      <div style={{ borderRadius: "var(--r-lg)", border: "1px solid var(--border-light)", overflow: "hidden" }}>
        <div style={{ padding: "13px 16px", background: "var(--bg)", fontSize: 13, fontWeight: 700, color: "var(--text-2)", borderBottom: "1px solid var(--border-light)" }}>
          📤 채널별 발행 방법
        </div>
        {[
          { icon: "📸", label: "인스타그램 릴스", steps: "앱 → + → 릴스 → 동영상 선택 → 커버/자막 설정 → 공유" },
          { icon: "▶", label: "유튜브 쇼츠", steps: "유튜브 앱 → + → 동영상 업로드 → #Shorts 태그 필수 → 게시" },
          { icon: "🎵", label: "틱톡", steps: "틱톡 앱 → + → 업로드 → 설명/해시태그 추가 → 게시" },
        ].map((ch, i) => (
          <div key={i} style={{ padding: "12px 16px", borderBottom: i < 2 ? "1px solid var(--border-light)" : undefined, display: "flex", gap: 12, alignItems: "flex-start" }}>
            <span style={{ fontSize: 20, flexShrink: 0 }}>{ch.icon}</span>
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text-1)", marginBottom: 3 }}>{ch.label}</div>
              <div style={{ fontSize: 12.5, color: "var(--text-3)", lineHeight: 1.6 }}>{ch.steps}</div>
            </div>
          </div>
        ))}
        <div style={{ padding: "10px 16px", background: "var(--warning-light)", fontSize: 12, color: "var(--warning)", fontWeight: 600 }}>
          ⚠ 자동 발행(인스타·유튜브·틱톡)은 API 심사 완료 후 활성화 예정
        </div>
      </div>

      <button onClick={reset} className="btn btn-secondary btn-full">+ 새 영상 만들기</button>
    </div>
  )

  // ── RENDER ────────────────────────────────────────
  return (
    <div className="flux-card" style={{ maxWidth: 640 }}>
      <div style={{ fontSize: 17, fontWeight: 800, color: "var(--text-1)", marginBottom: 6 }}>영상 자동 생성</div>
      <div style={{ fontSize: 13, color: "var(--text-3)", marginBottom: 22 }}>
        주제 입력 → 이미지 선택 → Remotion Lambda 자동 렌더링 · 1080×1920 · 15초
      </div>

      <StepIndicator />

      {step === 1 && <Step1 />}
      {step === 2 && <Step2 />}
      {step === 3 && <Step3 />}
      {step === 4 && <Step4 />}

      {/* 비용 안내 */}
      <div style={{ marginTop: 20, fontSize: 11.5, color: "var(--text-4)", textAlign: "center" }}>
        이미지 생성: 약 11~57원/장 (Replicate Flux) · 영상 렌더링: AWS Lambda 사용량 기준
      </div>
    </div>
  )
}
