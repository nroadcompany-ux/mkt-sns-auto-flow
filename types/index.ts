export type TChannel =
  | "BLOG_NAVER" | "NEWS_HOMEPAGE" | "INSTAGRAM" | "THREADS"
  | "KAKAO_CHANNEL" | "DAANGN" | "BAND" | "FACEBOOK"
  | "PAYPLAY_BLOG" | "PAYPLAY_PRESS"

export type TTone = "friendly" | "professional" | "emotional"
export type TSourceType = "MANUAL" | "URL" | "FILE" | "DIVERSIFIED"
export type TImageEngine = "custom" | "canva"
export type TFrequency = "daily" | "weekly" | "biweekly" | "monthly"

export interface IGeneratedContent {
  blog: { title: string; summary: string; body: string; seoKeywords: string[] }
  news: { headline: string; subheadline: string; body: string; tags: string[] }
  instagram: { caption: string; hashtags: string[] }
  threads: { post: string }
  kakao: { title: string; body: string }
}

export interface IDiversifiedPlan {
  index: number
  angle: string
  topic: string
  keywords: string[]
}

export interface IBrand {
  name: string
  logoUrl?: string
  color: string
  hashtags: string[]
  tone: TTone
  imageEngine: TImageEngine
  canvaApiKey?: string
  templateId?: string
}

export interface IScheduleItem {
  id: string
  dbId?: string
  index: number
  topic: string
  angle: string
  date: Date
  status: "draft" | "scheduled" | "published" | "failed"
  content?: IGeneratedContent
  imageUrl?: string
  channels: TChannel[]
}

export const CHANNEL_META: Record<TChannel, { label: string; color: string; maxLength?: number }> = {
  BLOG_NAVER:    { label: "네이버 블로그",     color: "#03C75A" },
  NEWS_HOMEPAGE: { label: "홈페이지 뉴스",     color: "#1a73e8" },
  INSTAGRAM:     { label: "인스타그램",        color: "#E1306C", maxLength: 2200 },
  THREADS:       { label: "스레드",            color: "#111111", maxLength: 500 },
  KAKAO_CHANNEL: { label: "카카오 채널",       color: "#F9E000" },
  DAANGN:        { label: "당근 비즈니스",     color: "#FF6F0F" },
  BAND:          { label: "밴드",              color: "#00C73C" },
  FACEBOOK:      { label: "페이스북",          color: "#1877F2" },
  PAYPLAY_BLOG:  { label: "페이플레이 블로그", color: "#6366f1" },
  PAYPLAY_PRESS: { label: "페이플레이 언론보도", color: "#0f172a" },
}
