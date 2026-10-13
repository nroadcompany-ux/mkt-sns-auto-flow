import {
  AbsoluteFill, Img, Sequence,
  interpolate, spring,
  useCurrentFrame, useVideoConfig,
} from "remotion"

export type PayplayShortformProps = {
  topic:        string
  imageUrl:     string
  brandName:    string
  brandColor:   string
  ctaText:      string
  outroText:    string
  outroContact: string
}

export const PayplayShortformDefaults: PayplayShortformProps = {
  topic:        "페이플레이와 함께 스마트하게",
  imageUrl:     "",
  brandName:    "페이플레이",
  brandColor:   "#3182F6",
  ctaText:      "페이플레이와 함께하세요",
  outroText:    "스마트한 결제 솔루션",
  outroContact: "payplay.co.kr",
}

// ── 로고 인트로 (0~2초, 0~60f) ──────────────────
function LogoIntro({ brandName, brandColor }: { brandName: string; brandColor: string }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const scaleIn = spring({ frame, fps, config: { damping: 14, stiffness: 120 }, durationInFrames: 40 })
  const opacity = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: "clamp" })
  const bgOpacity = interpolate(frame, [40, 60], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })

  return (
    <AbsoluteFill style={{ background: "#0a0a14", alignItems: "center", justifyContent: "center" }}>
      {/* 배경 색상 페이드인 */}
      <AbsoluteFill style={{ background: brandColor, opacity: bgOpacity * 0.15 }} />
      {/* 로고 */}
      <div style={{
        opacity,
        transform: `scale(${scaleIn})`,
        display: "flex", flexDirection: "column", alignItems: "center", gap: 16,
      }}>
        <div style={{
          width: 88, height: 88, borderRadius: 22,
          background: brandColor,
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: `0 0 40px ${brandColor}88`,
        }}>
          <span style={{ fontSize: 36, fontWeight: 900, color: "#fff", letterSpacing: -1 }}>
            {brandName.slice(0, 2)}
          </span>
        </div>
        <span style={{ fontSize: 32, fontWeight: 800, color: "#fff", letterSpacing: -0.5 }}>
          {brandName}
        </span>
      </div>
    </AbsoluteFill>
  )
}

// ── 메인 콘텐츠 (2~12초, 60~360f) ─────────────────
function MainContent({ topic, imageUrl, brandName, brandColor }: {
  topic: string; imageUrl: string; brandName: string; brandColor: string
}) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const textSlideUp = interpolate(frame, [0, 30], [80, 0], { extrapolateRight: "clamp" })
  const textOpacity = interpolate(frame, [0, 25], [0, 1], { extrapolateRight: "clamp" })
  const overlayOpacity = interpolate(frame, [0, 20], [0.4, 0.65], { extrapolateRight: "clamp" })

  // 텍스트를 청크로 분리 (긴 텍스트 처리)
  const words = topic.split(" ")
  const chunks: string[] = []
  let current = ""
  for (const word of words) {
    if ((current + word).length > 12) { if (current) chunks.push(current.trim()); current = word + " " }
    else current += word + " "
  }
  if (current.trim()) chunks.push(current.trim())
  const displayLines = chunks.slice(0, 3)

  return (
    <AbsoluteFill>
      {/* 배경 이미지 */}
      {imageUrl ? (
        <Img src={imageUrl} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        <AbsoluteFill style={{ background: `linear-gradient(160deg, #1a1a2e 0%, ${brandColor}66 100%)` }} />
      )}
      {/* 그라디언트 오버레이 */}
      <AbsoluteFill style={{
        background: `linear-gradient(to top, rgba(0,0,0,${overlayOpacity}) 0%, rgba(0,0,0,0.1) 55%, transparent 100%)`,
      }} />
      {/* 상단 브랜드 로고 */}
      <div style={{
        position: "absolute", top: 64, right: 44,
        background: "rgba(255,255,255,0.15)", backdropFilter: "blur(8px)",
        borderRadius: 14, padding: "10px 18px",
        border: "1px solid rgba(255,255,255,0.25)",
      }}>
        <span style={{ fontSize: 20, fontWeight: 800, color: "#fff", letterSpacing: -0.3 }}>{brandName}</span>
      </div>
      {/* 하단 텍스트 */}
      <div style={{
        position: "absolute", bottom: 100, left: 44, right: 44,
        transform: `translateY(${textSlideUp}px)`,
        opacity: textOpacity,
      }}>
        {displayLines.map((line, i) => (
          <div key={i} style={{
            fontSize: i === 0 ? 68 : 58,
            fontWeight: 900,
            color: "#fff",
            lineHeight: 1.15,
            letterSpacing: -1.5,
            textShadow: "0 2px 20px rgba(0,0,0,0.5)",
            marginBottom: 4,
          }}>
            {line}
          </div>
        ))}
        <div style={{
          marginTop: 18, height: 4, width: 60,
          background: brandColor, borderRadius: 2,
        }} />
      </div>
    </AbsoluteFill>
  )
}

// ── CTA 슬라이드 (12~14초, 360~420f) ──────────────
function CTASlide({ ctaText, brandColor, brandName }: { ctaText: string; brandColor: string; brandName: string }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const slideIn = spring({ frame, fps, config: { damping: 16, stiffness: 140 }, durationInFrames: 30 })
  const opacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp" })

  return (
    <AbsoluteFill style={{
      background: `linear-gradient(135deg, ${brandColor} 0%, ${brandColor}cc 100%)`,
      alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 28,
    }}>
      {/* 배경 패턴 */}
      <AbsoluteFill style={{ opacity: 0.07 }}>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} style={{
            position: "absolute", width: 300, height: 300,
            borderRadius: "50%", border: "2px solid #fff",
            top: `${i * 15 - 10}%`, left: `${i * 8 - 20}%`,
          }} />
        ))}
      </AbsoluteFill>
      <div style={{
        opacity,
        transform: `scale(${interpolate(slideIn, [0, 1], [0.85, 1])})`,
        display: "flex", flexDirection: "column", alignItems: "center", gap: 20,
        padding: "0 60px",
      }}>
        <div style={{
          fontSize: 26, fontWeight: 700, color: "rgba(255,255,255,0.8)",
          letterSpacing: 2, textTransform: "uppercase",
        }}>
          {brandName}
        </div>
        <div style={{
          fontSize: 58, fontWeight: 900, color: "#fff",
          textAlign: "center", lineHeight: 1.2, letterSpacing: -1.5,
        }}>
          {ctaText}
        </div>
        <div style={{
          width: 80, height: 5, background: "rgba(255,255,255,0.6)", borderRadius: 3, marginTop: 8,
        }} />
      </div>
    </AbsoluteFill>
  )
}

// ── 아웃트로 (14~15초, 420~450f) ──────────────────
function Outro({ outroText, outroContact, brandColor, brandName }: {
  outroText: string; outroContact: string; brandColor: string; brandName: string
}) {
  const frame = useCurrentFrame()
  const fadeIn = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: "clamp" })
  const fadeOut = interpolate(frame, [20, 30], [1, 0], { extrapolateLeft: "clamp" })
  const opacity = Math.min(fadeIn, fadeOut)

  return (
    <AbsoluteFill style={{
      background: "#0a0a14",
      alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16,
      opacity,
    }}>
      <div style={{
        width: 70, height: 70, borderRadius: 18,
        background: brandColor,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <span style={{ fontSize: 28, fontWeight: 900, color: "#fff" }}>{brandName.slice(0, 2)}</span>
      </div>
      <div style={{ fontSize: 30, fontWeight: 800, color: "#fff", letterSpacing: -0.5 }}>{brandName}</div>
      <div style={{ fontSize: 22, color: "rgba(255,255,255,0.6)", fontWeight: 500 }}>{outroText}</div>
      <div style={{
        marginTop: 8, fontSize: 20, color: brandColor, fontWeight: 600,
        background: `${brandColor}22`, padding: "8px 20px", borderRadius: 20,
        border: `1px solid ${brandColor}44`,
      }}>
        {outroContact}
      </div>
    </AbsoluteFill>
  )
}

// ── 메인 컴포지션 ──────────────────────────────────
export const PayplayShortform = ({
  topic, imageUrl, brandName, brandColor, ctaText, outroText, outroContact,
}: PayplayShortformProps) => {
  return (
    <AbsoluteFill style={{ fontFamily: "'Pretendard', 'Apple SD Gothic Neo', sans-serif" }}>
      {/* 로고 인트로: 0~60f (2초) */}
      <Sequence from={0} durationInFrames={60}>
        <LogoIntro brandName={brandName} brandColor={brandColor} />
      </Sequence>

      {/* 메인 콘텐츠: 60~360f (10초) */}
      <Sequence from={60} durationInFrames={300}>
        <MainContent topic={topic} imageUrl={imageUrl} brandName={brandName} brandColor={brandColor} />
      </Sequence>

      {/* CTA: 360~420f (2초) */}
      <Sequence from={360} durationInFrames={60}>
        <CTASlide ctaText={ctaText} brandColor={brandColor} brandName={brandName} />
      </Sequence>

      {/* 아웃트로: 420~450f (1초) */}
      <Sequence from={420} durationInFrames={30}>
        <Outro outroText={outroText} outroContact={outroContact} brandColor={brandColor} brandName={brandName} />
      </Sequence>
    </AbsoluteFill>
  )
}
