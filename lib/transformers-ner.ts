import { pipeline, env } from "@xenova/transformers"

// Configure transformers.js to use local models
env.allowRemoteModels = true
env.allowLocalModels = true

// PII entity types for financial documents
export const PII_LABELS = {
  PERSON: "Person Name",
  ORG: "Organization",
  GPE: "Location",
  MONEY: "Monetary Amount",
  DATE: "Date",
  TIME: "Time",
  PERCENT: "Percentage",
  CARDINAL: "Number",
  ORDINAL: "Ordinal Number",
  QUANTITY: "Quantity",
  EMAIL: "Email Address",
  PHONE: "Phone Number",
  SSN: "Social Security Number",
  ACCOUNT: "Account Number",
  ROUTING: "Routing Number",
  CREDIT_CARD: "Credit Card Number",
  LICENSE: "License Number",
  PASSPORT: "Passport Number",
  TAX_ID: "Tax ID",
  ADDRESS: "Address",
} as const

export type PIILabel = keyof typeof PII_LABELS

export interface DetectedEntity {
  text: string
  label: PIILabel
  confidence: number
  start: number
  end: number
  redactionPolicy: "FULL" | "PARTIAL" | "HASH" | "MASK"
}

export interface NERResult {
  entities: DetectedEntity[]
  redactedText: string
  processingTime: number
}

// Financial PII patterns for enhanced detection
const FINANCIAL_PATTERNS = {
  SSN: /\b\d{3}-?\d{2}-?\d{4}\b/g,
  CREDIT_CARD: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g,
  ACCOUNT: /\b\d{8,17}\b/g,
  ROUTING: /\b\d{9}\b/g,
  EMAIL: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
  PHONE: /\b(?:\+?1[-.\s]?)?$$?[0-9]{3}$$?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}\b/g,
  TAX_ID: /\b\d{2}-?\d{7}\b/g,
  LICENSE: /\b[A-Z]{1,2}\d{6,8}\b/g,
  PASSPORT: /\b[A-Z]\d{8}\b/g,
}

// Redaction policies by entity type
const REDACTION_POLICIES: Record<PIILabel, "FULL" | "PARTIAL" | "HASH" | "MASK"> = {
  PERSON: "PARTIAL",
  ORG: "PARTIAL",
  GPE: "PARTIAL",
  MONEY: "PARTIAL",
  DATE: "PARTIAL",
  TIME: "PARTIAL",
  PERCENT: "PARTIAL",
  CARDINAL: "PARTIAL",
  ORDINAL: "PARTIAL",
  QUANTITY: "PARTIAL",
  EMAIL: "HASH",
  PHONE: "MASK",
  SSN: "FULL",
  ACCOUNT: "FULL",
  ROUTING: "FULL",
  CREDIT_CARD: "FULL",
  LICENSE: "MASK",
  PASSPORT: "FULL",
  TAX_ID: "FULL",
  ADDRESS: "PARTIAL",
}

let nerPipeline: any = null

// Initialize the NER pipeline
async function initializeNER() {
  if (!nerPipeline) {
    console.log("[v0] Initializing Transformers.js NER pipeline...")
    try {
      // Use a financial-domain fine-tuned model or general NER model
      nerPipeline = await pipeline("token-classification", "Xenova/bert-base-NER", {
        aggregation_strategy: "simple",
        device: "webgpu", // Use WebGPU if available, fallback to CPU
      })
      console.log("[v0] NER pipeline initialized successfully")
    } catch (error) {
      console.warn("[v0] WebGPU not available, falling back to CPU")
      nerPipeline = await pipeline("token-classification", "Xenova/bert-base-NER", {
        aggregation_strategy: "simple",
      })
    }
  }
  return nerPipeline
}

// Apply redaction based on policy
function applyRedaction(text: string, policy: "FULL" | "PARTIAL" | "HASH" | "MASK"): string {
  switch (policy) {
    case "FULL":
      return "█".repeat(text.length)
    case "PARTIAL":
      if (text.length <= 3) return "█".repeat(text.length)
      return text.charAt(0) + "█".repeat(text.length - 2) + text.charAt(text.length - 1)
    case "HASH":
      return `[REDACTED-${text.length}]`
    case "MASK":
      return text.replace(/./g, "*")
    default:
      return "█".repeat(text.length)
  }
}

// Enhanced pattern-based detection for financial PII
function detectFinancialPatterns(text: string): DetectedEntity[] {
  const entities: DetectedEntity[] = []

  Object.entries(FINANCIAL_PATTERNS).forEach(([label, pattern]) => {
    const matches = Array.from(text.matchAll(pattern))
    matches.forEach((match) => {
      if (match.index !== undefined) {
        const entityText = match[0]
        const piiLabel = label as PIILabel
        entities.push({
          text: entityText,
          label: piiLabel,
          confidence: 0.95, // High confidence for pattern matches
          start: match.index,
          end: match.index + entityText.length,
          redactionPolicy: REDACTION_POLICIES[piiLabel],
        })
      }
    })
  })

  return entities
}

// Main NER processing function
export async function processTextWithNER(text: string, confidenceThreshold = 0.6): Promise<NERResult> {
  const startTime = Date.now()

  try {
    console.log("[v0] Starting NER processing...")

    // Initialize pipeline if needed
    const pipeline = await initializeNER()

    // Run transformer-based NER
    console.log("[v0] Running transformer NER...")
    const nerResults = await pipeline(text)
    console.log("[v0] Transformer results:", nerResults)

    // Convert transformer results to our format with better label mapping
    const transformerEntities: DetectedEntity[] = nerResults
      .filter((result: any) => result.score >= confidenceThreshold)
      .map((result: any) => {
        let piiLabel: PIILabel = "PERSON" // default

        const entityGroup = result.entity_group?.toUpperCase() || ""
        if (entityGroup.includes("PER") || entityGroup.includes("PERSON")) piiLabel = "PERSON"
        else if (entityGroup.includes("ORG")) piiLabel = "ORG"
        else if (entityGroup.includes("LOC") || entityGroup.includes("GPE")) piiLabel = "GPE"
        else if (entityGroup.includes("MISC")) {
          // Try to classify MISC entities better
          const word = result.word.toLowerCase()
          if (word.includes("@")) piiLabel = "EMAIL"
          else if (/\d{3}-?\d{2}-?\d{4}/.test(word)) piiLabel = "SSN"
          else if (/\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}/.test(word)) piiLabel = "CREDIT_CARD"
          else piiLabel = "ORG"
        }

        return {
          text: result.word.replace(/^##/, ""), // Remove BERT subword tokens
          label: piiLabel,
          confidence: result.score,
          start: result.start,
          end: result.end,
          redactionPolicy: REDACTION_POLICIES[piiLabel],
        }
      })

    // Add pattern-based financial PII detection
    console.log("[v0] Running pattern-based financial PII detection...")
    const patternEntities = detectFinancialPatterns(text)

    // Combine and deduplicate entities
    const allEntities = [...transformerEntities, ...patternEntities]
    const uniqueEntities = deduplicateEntities(allEntities)

    const filteredEntities = uniqueEntities.filter((entity) => entity.confidence >= confidenceThreshold)

    // Sort by start position
    filteredEntities.sort((a, b) => a.start - b.start)

    // Generate redacted text
    const redactedText = generateRedactedText(text, filteredEntities)

    const processingTime = Date.now() - startTime
    console.log(`[v0] NER processing completed in ${processingTime}ms, found ${filteredEntities.length} entities`)

    return {
      entities: filteredEntities,
      redactedText,
      processingTime,
    }
  } catch (error) {
    console.error("[v0] NER processing error:", error)
    throw new Error("Failed to process text with NER")
  }
}

// Remove overlapping entities, keeping the one with higher confidence
function deduplicateEntities(entities: DetectedEntity[]): DetectedEntity[] {
  const sorted = entities.sort((a, b) => b.confidence - a.confidence)
  const deduplicated: DetectedEntity[] = []

  for (const entity of sorted) {
    const hasOverlap = deduplicated.some(
      (existing) =>
        (entity.start >= existing.start && entity.start < existing.end) ||
        (entity.end > existing.start && entity.end <= existing.end) ||
        (entity.start <= existing.start && entity.end >= existing.end),
    )

    if (!hasOverlap) {
      deduplicated.push(entity)
    }
  }

  return deduplicated
}

// Generate redacted text with entities replaced
function generateRedactedText(originalText: string, entities: DetectedEntity[]): string {
  let redactedText = originalText
  let offset = 0

  // Sort entities by start position
  const sortedEntities = [...entities].sort((a, b) => a.start - b.start)

  for (const entity of sortedEntities) {
    const redactedValue = applyRedaction(entity.text, entity.redactionPolicy)
    const adjustedStart = entity.start + offset
    const adjustedEnd = entity.end + offset

    redactedText = redactedText.slice(0, adjustedStart) + redactedValue + redactedText.slice(adjustedEnd)

    offset += redactedValue.length - entity.text.length
  }

  return redactedText
}

// Preload the model for faster subsequent processing
export async function preloadNERModel(): Promise<void> {
  try {
    await initializeNER()
    console.log("[v0] NER model preloaded successfully")
  } catch (error) {
    console.error("[v0] Failed to preload NER model:", error)
  }
}
