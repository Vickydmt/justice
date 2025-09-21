import { NextResponse, type NextRequest } from "next/server"
import { processTextWithTransformersNER } from "@/lib/transformers-ner-enhanced"

type NerEntity = {
  entity_group: string
  score: number
  word: string
  start: number
  end: number
}

export async function POST(req: NextRequest) {
  try {
    const { text, threshold = 0.5, language = "en" } = await req.json()
    if (!text || typeof text !== "string") {
      return NextResponse.json({ error: "Missing 'text' string" }, { status: 400 })
    }

    console.log("[FinSecure API] Processing text with Transformers.js NER...")
    
    // Use Transformers.js NER with your Hugging Face key
    const result = await processTextWithTransformersNER(text, language, Number(threshold))

    // Convert to legacy format for compatibility
    const legacyEntities = result.entities.map((entity) => ({
      entity_group: entity.label.toUpperCase(),
      score: entity.confidence,
      word: entity.text,
      start: entity.start,
      end: entity.end,
      pii_type: entity.label,
      risk_level: entity.riskLevel,
      redaction_policy: entity.redactionPolicy,
    }))

    const regexSpans = findRegexPii(text)
    const spans = mergeSpans(
      [
        ...result.entities.map((e) => ({ 
          start: e.start, 
          end: e.end, 
          label: e.label, 
          score: e.confidence 
        })),
        ...regexSpans,
      ],
      1,
    )

    return NextResponse.json({
      inputLength: text.length,
      threshold: Number(threshold),
      entities: legacyEntities,
      regexFinds: regexSpans,
      spans,
      redacted: result.redactedText,
      processingTime: result.processingTime,
      modelUsed: result.modelUsed,
      confidence: result.confidence,
      modelStats: result.modelStats,
    })
  } catch (err: any) {
    console.error("[FinSecure API] Error:", err)
    return NextResponse.json({ error: err?.message || "Unknown error" }, { status: 500 })
  }
}

function mapEntityGroupToPii(group: string): string | null {
  const g = group.toUpperCase()
  if (g.includes("PER")) return "PERSON_NAME"
  if (g.includes("ORG")) return "ORGANIZATION"
  if (g.includes("LOC")) return "LOCATION"
  return null
}

type Span = { start: number; end: number; label: string; score?: number }

function findRegexPii(text: string): Span[] {
  const spans: Span[] = []
  // SSN: 3-2-4 with basic safeguards
  matchAllPush(text, /\b(?!000|666|9\d\d)\d{3}-(?!00)\d{2}-(?!0000)\d{4}\b/g, "SSN", spans)

  // Credit card (naive, may include non-card long numbers)
  matchAllPush(text, /\b(?:\d[ -]?){13,19}\b/g, "CREDIT_CARD", spans)

  // IBAN (broad)
  matchAllPush(text, /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g, "IBAN", spans)

  // US phone
  matchAllPush(text, /\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?){2}\d{4}\b/g, "PHONE_NUMBER", spans)

  // Email
  matchAllPush(text, /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "EMAIL", spans)

  // Routing number (9 digits) and account (6-12 digits, naive)
  matchAllPush(text, /\b\d{9}\b/g, "ROUTING_NUMBER", spans)
  matchAllPush(text, /\b\d{6,12}\b/g, "ACCOUNT_NUMBER", spans)

  return spans
}

function matchAllPush(text: string, regex: RegExp, label: string, out: Span[]) {
  let m: RegExpExecArray | null
  while ((m = regex.exec(text)) !== null) {
    const start = m.index
    const end = start + m[0].length
    out.push({ start, end, label })
  }
}

function mergeSpans(spans: Span[], padding = 0): Span[] {
  if (spans.length === 0) return []
  const sorted = [...spans]
    .map((s) => ({ ...s, start: Math.max(0, s.start - padding), end: s.end + padding }))
    .sort((a, b) => (a.start === b.start ? b.end - a.end : a.start - b.start))
  const merged: Span[] = []
  let cur = sorted[0]
  for (let i = 1; i < sorted.length; i++) {
    const s = sorted[i]
    if (s.start <= cur.end) {
      cur.end = Math.max(cur.end, s.end)
      cur.label = cur.label === s.label ? cur.label : `${cur.label}|${s.label}`
      cur.score = Math.max(cur.score || 0, s.score || 0)
    } else {
      merged.push(cur)
      cur = s
    }
  }
  merged.push(cur)
  return merged
}

function redactText(text: string, spans: Span[], mask = "█"): string {
  if (spans.length === 0) return text
  let out = ""
  let cursor = 0
  for (const s of spans) {
    out += text.slice(cursor, s.start)
    out += mask.repeat(Math.max(0, s.end - s.start))
    cursor = s.end
  }
  out += text.slice(cursor)
  return out
}
