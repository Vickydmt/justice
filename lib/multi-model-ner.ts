import { pipeline, env } from "@xenova/transformers"
import { processTextWithTransformersNER, preloadTransformersModels } from "./transformers-ner-enhanced"

// Configure transformers.js
env.allowRemoteModels = true
env.allowLocalModels = true
env.HF_TOKEN = "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"

// Enhanced PII entity types for financial documents
export const ENHANCED_PII_LABELS = {
  // Personal Information
  PERSON: "Person Name",
  NAME: "Person Name",
  PERSON_NAME: "Person Name",
  COMPANY_NAME: "Company Name",
  EMAIL: "Email Address",
  PHONE: "Phone Number",
  ADDRESS: "Address",
  DATE_OF_BIRTH: "Date of Birth",

  // Financial Information
  SSN: "Social Security Number",
  ACCOUNT_NUMBER: "Account Number",
  ROUTING_NUMBER: "Routing Number",
  CREDIT_CARD: "Credit Card Number",
  DEBIT_CARD: "Debit Card Number",
  BANK_NAME: "Bank Name",
  BANK_ACCOUNT: "Bank Account Number",

  // Government IDs
  PASSPORT: "Passport Number",
  DRIVERS_LICENSE: "Driver's License",
  TAX_ID: "Tax ID/EIN",
  VOTER_ID: "Voter ID",

  // Legal Case Information
  CASE_NUMBER: "Case Number",
  DOCKET_NUMBER: "Docket Number",
  COURT_NAME: "Court Name",
  JUDGE_NAME: "Judge Name",
  ATTORNEY_NAME: "Attorney Name",
  WITNESS_NAME: "Witness Name",
  PLAINTIFF_NAME: "Plaintiff Name",
  DEFENDANT_NAME: "Defendant Name",
  VICTIM_NAME: "Victim Name",
  MINOR_NAME: "Minor Name",
  EXPERT_WITNESS: "Expert Witness",
  COURT_CLERK: "Court Clerk",

  // Financial Document Specific
  INVOICE_NUMBER: "Invoice Number",
  TRANSACTION_ID: "Transaction ID",
  LOAN_NUMBER: "Loan Number",
  POLICY_NUMBER: "Policy Number",
  REFERENCE_NUMBER: "Reference Number",
  P_O_NUMBER: "P.O. Number",
  CUSTOMER_ID: "Customer ID",

  // Amounts and Dates
  MONETARY_AMOUNT: "Monetary Amount",
  AMOUNT: "Monetary Amount",
  DATE: "Date",
  SIGNATURE: "Signature",

  // Organization Info
  ORGANIZATION: "Organization",
  LOCATION: "Location",
} as const

export type EnhancedPIILabel = keyof typeof ENHANCED_PII_LABELS

export interface EnhancedDetectedEntity {
  text: string
  label: EnhancedPIILabel
  confidence: number
  start: number
  end: number
  redactionPolicy: "FULL" | "PARTIAL" | "HASH" | "MASK"
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
  context?: string
}

const ENHANCED_FINANCIAL_PATTERNS = {
  SSN: {
    pattern: /\b(?:\d{3}[-.\s]?\d{2}[-.\s]?\d{4})\b/g,
    riskLevel: "CRITICAL" as const,
    redactionPolicy: "FULL" as const,
  },
  CREDIT_CARD: {
    pattern: /\b(?:\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4})\b/g,
    riskLevel: "CRITICAL" as const,
    redactionPolicy: "FULL" as const,
  },
  ACCOUNT_NUMBER: {
    pattern: /\b(?:Account|Acct)[\s#:]*(\d{8,17})\b/gi,
    riskLevel: "CRITICAL" as const,
    redactionPolicy: "FULL" as const,
  },
  ROUTING_NUMBER: {
    pattern: /\b(?:Routing|ABA|RTN)[\s#:]*(\d{9})\b/gi,
    riskLevel: "CRITICAL" as const,
    redactionPolicy: "FULL" as const,
  },
  EMAIL: {
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    riskLevel: "HIGH" as const,
    redactionPolicy: "HASH" as const,
  },
  PHONE: {
    pattern: /(?:\([0-9]{3}\)\s?[0-9]{3}[-.\s]?[0-9]{4}|[0-9]{3}[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}|\+1[-.\s]?[0-9]{3}[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}|1[-.\s]?[0-9]{3}[-.\s]?[0-9]{3}[-.\s]?[0-9]{4})/g,
    riskLevel: "HIGH" as const,
    redactionPolicy: "MASK" as const,
  },
  INVOICE_NUMBER: {
    pattern: /\b(?:Invoice|INV|Invoice\s*#)[\s#:]*([A-Z0-9-]{6,20})\b/gi,
    riskLevel: "MEDIUM" as const,
    redactionPolicy: "PARTIAL" as const,
  },
  TRANSACTION_ID: {
    pattern: /\b(?:Transaction|Trans|TXN)[\s#:]*([A-Z0-9-]{8,25})\b/gi,
    riskLevel: "HIGH" as const,
    redactionPolicy: "FULL" as const,
  },
  DATE_OF_BIRTH: {
    pattern: /\b(?:DOB|Date of Birth)[\s:]*(\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4})\b/gi,
    riskLevel: "CRITICAL" as const,
    redactionPolicy: "FULL" as const,
  },
  TAX_ID: {
    pattern: /\b(?:EIN|Tax ID)[\s#:]*(\d{2}-?\d{7})\b/gi,
    riskLevel: "CRITICAL" as const,
    redactionPolicy: "FULL" as const,
  },
  DRIVERS_LICENSE: {
    pattern: /\b(?:DL|License)[\s#:]*([A-Z0-9]{6,12})\b/gi,
    riskLevel: "HIGH" as const,
    redactionPolicy: "FULL" as const,
  },
  PASSPORT: {
    pattern: /\b(?:Passport)[\s#:]*([A-Z]\d{8})\b/gi,
    riskLevel: "CRITICAL" as const,
    redactionPolicy: "FULL" as const,
  },
  // Enhanced financial document patterns
  BANK_ACCOUNT: {
    pattern: /\b(?:Bank|Account)[\s#:]*(\d{10,17})\b/gi,
    riskLevel: "CRITICAL" as const,
    redactionPolicy: "FULL" as const,
  },
  LOAN_NUMBER: {
    pattern: /\b(?:Loan|Loan\s*#)[\s#:]*([A-Z0-9-]{8,20})\b/gi,
    riskLevel: "HIGH" as const,
    redactionPolicy: "FULL" as const,
  },
  POLICY_NUMBER: {
    pattern: /\b(?:Policy|Policy\s*#)[\s#:]*([A-Z0-9-]{8,20})\b/gi,
    riskLevel: "HIGH" as const,
    redactionPolicy: "FULL" as const,
  },
  REFERENCE_NUMBER: {
    pattern: /\b(?:Ref|Reference|Ref\s*#)[\s#:]*([A-Z0-9-]{6,20})\b/gi,
    riskLevel: "MEDIUM" as const,
    redactionPolicy: "PARTIAL" as const,
  },
  P_O_NUMBER: {
    pattern: /\b(?:P\.O\.|PO)[\s#:]*(\d{4,12})\b/gi,
    riskLevel: "MEDIUM" as const,
    redactionPolicy: "PARTIAL" as const,
  },
  // Enhanced NAME patterns - more specific to avoid false positives
  NAME: {
    pattern: /\b(?:Bill To|Ship To)[\s:]*([A-Z][a-z]+\s+[A-Z][a-z]+)\b|^\s*([A-Z][a-z]+\s+[A-Z][a-z]+)\s*$/gm,
    riskLevel: "HIGH" as const,
    redactionPolicy: "MASK" as const,
  },
  PERSON_NAME: {
    pattern: /\b[A-Z][a-z]+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b/g,
    riskLevel: "HIGH" as const,
    redactionPolicy: "MASK" as const,
  },
  COMPANY_NAME: {
    pattern: /\b[A-Z][a-z]+\s+(?:Inc|Corp|LLC|Ltd|Company|Co)\.?\b/g,
    riskLevel: "MEDIUM" as const,
    redactionPolicy: "PARTIAL" as const,
  },
  // Add more comprehensive patterns
  DATE: {
    pattern: /\b(?:\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4}|\d{4}[-\/]\d{1,2}[-\/]\d{1,2}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4})\b/gi,
    riskLevel: "MEDIUM" as const,
    redactionPolicy: "MASK" as const,
  },
  AMOUNT: {
    pattern: /\$[\d,]+\.?\d*|\b\d+[,.]?\d*\s*(?:USD|dollars?|cents?)\b/gi,
    riskLevel: "MEDIUM" as const,
    redactionPolicy: "MASK" as const,
  },
  ADDRESS: {
    pattern: /\b\d+\s+[A-Za-z0-9\s,.-]+(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Boulevard|Blvd|Way|Circle|Cir|Court|Ct|Place|Pl)\b/gi,
    riskLevel: "HIGH" as const,
    redactionPolicy: "MASK" as const,
  },
  CUSTOMER_ID: {
    pattern: /\b(?:Customer|Cust|ID)[\s#:]*([A-Z0-9-]{6,15})\b/gi,
    riskLevel: "HIGH" as const,
    redactionPolicy: "FULL" as const,
  },
  AMOUNT: {
    pattern: /\$[\d,]+\.?\d*|\b\d+[,.]?\d*\s*(?:USD|dollars?|cents?)\b/gi,
    riskLevel: "MEDIUM" as const,
    redactionPolicy: "MASK" as const,
  },
  DATE: {
    pattern: /\b(?:\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4}|\d{4}[-\/]\d{1,2}[-\/]\d{1,2}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4})\b/gi,
    riskLevel: "MEDIUM" as const,
    redactionPolicy: "MASK" as const,
  },
  SIGNATURE: {
    pattern: /\b(?:Signature|Sign)[\s:]*([A-Za-z\s]{3,30})\b/gi,
    riskLevel: "HIGH" as const,
    redactionPolicy: "FULL" as const,
  },
  // Legal-specific patterns
  CASE_NUMBER: {
    pattern: /\b(?:Case|Docket|Docket\s*#)[\s#:]*([A-Z0-9-]{6,20})\b/gi,
    riskLevel: "MEDIUM" as const,
    redactionPolicy: "PARTIAL" as const,
  },
  DOCKET_NUMBER: {
    pattern: /\b(?:Docket|Dkt)[\s#:]*([A-Z0-9-]{6,20})\b/gi,
    riskLevel: "MEDIUM" as const,
    redactionPolicy: "PARTIAL" as const,
  },
  COURT_NAME: {
    pattern: /\b(?:Court of|Superior Court|District Court|Circuit Court|Supreme Court)[\s:]*([A-Za-z\s]+)\b/gi,
    riskLevel: "LOW" as const,
    redactionPolicy: "NONE" as const,
  },
  JUDGE_NAME: {
    pattern: /\b(?:Judge|Hon\.|Honorable)[\s:]*([A-Z][a-z]+\s+[A-Z][a-z]+)\b/gi,
    riskLevel: "MEDIUM" as const,
    redactionPolicy: "PARTIAL" as const,
  },
  ATTORNEY_NAME: {
    pattern: /\b(?:Attorney|Counsel|Lawyer)[\s:]*([A-Z][a-z]+\s+[A-Z][a-z]+)\b/gi,
    riskLevel: "MEDIUM" as const,
    redactionPolicy: "PARTIAL" as const,
  },
  WITNESS_NAME: {
    pattern: /\b(?:Witness|Testifying)[\s:]*([A-Z][a-z]+\s+[A-Z][a-z]+)\b/gi,
    riskLevel: "HIGH" as const,
    redactionPolicy: "MASK" as const,
  },
  PLAINTIFF_NAME: {
    pattern: /\b(?:Plaintiff|Petitioner)[\s:]*([A-Z][a-z]+\s+[A-Z][a-z]+)\b/gi,
    riskLevel: "HIGH" as const,
    redactionPolicy: "MASK" as const,
  },
  DEFENDANT_NAME: {
    pattern: /\b(?:Defendant|Respondent)[\s:]*([A-Z][a-z]+\s+[A-Z][a-z]+)\b/gi,
    riskLevel: "HIGH" as const,
    redactionPolicy: "MASK" as const,
  },
  VICTIM_NAME: {
    pattern: /\b(?:Victim|Complainant)[\s:]*([A-Z][a-z]+\s+[A-Z][a-z]+)\b/gi,
    riskLevel: "CRITICAL" as const,
    redactionPolicy: "FULL" as const,
  },
  MINOR_NAME: {
    pattern: /\b(?:Minor|Child|Juvenile)[\s:]*([A-Z][a-z]+\s+[A-Z][a-z]+)\b/gi,
    riskLevel: "CRITICAL" as const,
    redactionPolicy: "FULL" as const,
  },
  EXPERT_WITNESS: {
    pattern: /\b(?:Expert|Dr\.|Doctor)[\s:]*([A-Z][a-z]+\s+[A-Z][a-z]+)\b/gi,
    riskLevel: "HIGH" as const,
    redactionPolicy: "MASK" as const,
  },
  COURT_CLERK: {
    pattern: /\b(?:Clerk|Court Clerk)[\s:]*([A-Z][a-z]+\s+[A-Z][a-z]+)\b/gi,
    riskLevel: "MEDIUM" as const,
    redactionPolicy: "PARTIAL" as const,
  },
  ADDRESS: {
    pattern: /\b(?:\d+\s+[A-Za-z\s]+(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Boulevard|Blvd|Circle|Cir|Court|Ct|Place|Pl|Square|Sq|Way|Trail|Trl|Terrace|Ter|Parkway|Pkwy))\b/gi,
    riskLevel: "HIGH" as const,
    redactionPolicy: "PARTIAL" as const,
  },
}

let financialNERPipeline: any = null
let generalNERPipeline: any = null
const tokenClassificationPipeline: any = null

// Initialize multiple NER pipelines for ensemble approach
async function initializeMultiModelNER() {
  console.log("[v0] Initializing multi-model NER pipeline...")

  try {
    // Financial domain model (using general model as fallback)
    if (!financialNERPipeline) {
      financialNERPipeline = await pipeline("token-classification", "Xenova/bert-base-NER", {
        aggregation_strategy: "simple",
        device: "webgpu",
      })
    }

    // General NER model for person/organization detection
    if (!generalNERPipeline) {
      generalNERPipeline = await pipeline("token-classification", "Xenova/bert-base-NER", {
        aggregation_strategy: "simple",
        device: "webgpu",
      })
    }

    console.log("[v0] Multi-model NER pipeline initialized successfully")
  } catch (error) {
    console.warn("[v0] WebGPU not available, falling back to CPU")
    // Fallback to CPU
    financialNERPipeline = await pipeline("token-classification", "Xenova/bert-base-NER", {
      aggregation_strategy: "simple",
    })
    generalNERPipeline = financialNERPipeline // Use same pipeline for both
  }
}

function detectEnhancedFinancialPatterns(text: string): EnhancedDetectedEntity[] {
  const entities: EnhancedDetectedEntity[] = []

  Object.entries(ENHANCED_FINANCIAL_PATTERNS).forEach(([labelKey, config]) => {
    const matches = Array.from(text.matchAll(config.pattern))
    matches.forEach((match) => {
      if (match.index !== undefined) {
        const entityText = match[1] || match[0] // Use capture group if available
        const label = labelKey as EnhancedPIILabel

        // Extract context around the match
        const contextStart = Math.max(0, match.index - 20)
        const contextEnd = Math.min(text.length, match.index + entityText.length + 20)
        const context = text.slice(contextStart, contextEnd)

        entities.push({
          text: entityText,
          label,
          confidence: 0.95, // High confidence for pattern matches
          start: match.index + match[0].indexOf(entityText),
          end: match.index + match[0].indexOf(entityText) + entityText.length,
          redactionPolicy: config.redactionPolicy,
          riskLevel: config.riskLevel,
          context,
        })
      }
    })
  })

  return entities
}

function applyEnhancedRedaction(text: string, policy: "FULL" | "PARTIAL" | "HASH" | "MASK"): string {
  switch (policy) {
    case "FULL":
      return "█".repeat(Math.max(text.length, 3))
    case "PARTIAL":
      if (text.length <= 3) return "█".repeat(text.length)
      return text.charAt(0) + "█".repeat(text.length - 2) + text.charAt(text.length - 1)
    case "HASH":
      return `[REDACTED-${text.length}]`
    case "MASK":
      return "*".repeat(text.length)
    default:
      return "█".repeat(text.length)
  }
}

export async function processTextWithEnhancedNER(
  text: string,
  confidenceThreshold = 0.5, // Lower threshold for better detection
): Promise<{
  entities: EnhancedDetectedEntity[]
  redactedText: string
  processingTime: number
  modelStats: {
    patternMatches: number
    transformerMatches: number
    totalEntities: number
    criticalEntities: number
  }
}> {
  const startTime = Date.now()

  try {
    console.log("[Enhanced NER] Processing text of length:", text.length)
    console.log("[Enhanced NER] Sample text:", text.substring(0, 200))
    console.log("[Enhanced NER] Confidence threshold:", confidenceThreshold)

    // Initialize pipelines
    await initializeMultiModelNER()

    // 1. Pattern-based detection (highest priority)
    console.log("[Enhanced NER] Running enhanced pattern-based detection...")
    const patternEntities = detectEnhancedFinancialPatterns(text)
    console.log("[Enhanced NER] Pattern-based entities found:", patternEntities.length)

    // 2. Transformers.js NER processing
    console.log("[Enhanced NER] Running Transformers.js NER...")
    let transformersEntities: EnhancedDetectedEntity[] = []
    try {
      const transformersResult = await processTextWithTransformersNER(text, "en", confidenceThreshold)
      transformersEntities = transformersResult.entities.map((entity) => ({
        text: entity.text,
        label: entity.label as EnhancedPIILabel,
        confidence: entity.confidence,
        start: entity.start,
        end: entity.end,
        redactionPolicy: entity.redactionPolicy,
        riskLevel: entity.riskLevel,
        context: entity.context || text.slice(Math.max(0, entity.start - 20), Math.min(text.length, entity.end + 20)),
      }))
      console.log(`[v0] Transformers.js found ${transformersEntities.length} entities`)
    } catch (error) {
      console.warn("[v0] Transformers.js processing failed, falling back to local models:", error)
      
      // Fallback to local transformer-based NER
      const nerResults = await financialNERPipeline(text)
      transformersEntities = nerResults
        .filter((result: any) => result.score >= confidenceThreshold)
        .map((result: any) => {
          let label: EnhancedPIILabel = "PERSON"
          let riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" = "MEDIUM"
          let redactionPolicy: "FULL" | "PARTIAL" | "HASH" | "MASK" = "PARTIAL"

          const entityGroup = result.entity_group?.toUpperCase() || ""
          const word = result.word.toLowerCase().replace(/^##/, "")

          // Enhanced label mapping with risk assessment
          if (entityGroup.includes("PER") || entityGroup.includes("PERSON")) {
            label = "PERSON"
            riskLevel = "HIGH"
            redactionPolicy = "PARTIAL"
          } else if (entityGroup.includes("ORG")) {
            label = "ORGANIZATION"
            riskLevel = "MEDIUM"
            redactionPolicy = "PARTIAL"
          } else if (entityGroup.includes("LOC") || entityGroup.includes("GPE")) {
            label = "LOCATION"
            riskLevel = "MEDIUM"
            redactionPolicy = "PARTIAL"
          } else if (entityGroup.includes("MISC")) {
            // Smart classification for MISC entities
            if (word.includes("@")) {
              label = "EMAIL"
              riskLevel = "HIGH"
              redactionPolicy = "HASH"
            } else if (/\d{3}-?\d{2}-?\d{4}/.test(word)) {
              label = "SSN"
              riskLevel = "CRITICAL"
              redactionPolicy = "FULL"
            } else if (/\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}/.test(word)) {
              label = "CREDIT_CARD"
              riskLevel = "CRITICAL"
              redactionPolicy = "FULL"
            } else {
              label = "ORGANIZATION"
              riskLevel = "MEDIUM"
              redactionPolicy = "PARTIAL"
            }
          }

          return {
            text: word,
            label,
            confidence: result.score,
            start: result.start,
            end: result.end,
            redactionPolicy,
            riskLevel,
            context: text.slice(Math.max(0, result.start - 20), Math.min(text.length, result.end + 20)),
          }
        })
    }

    // 3. Combine and deduplicate entities
    const allEntities = [...patternEntities, ...transformersEntities]
    const uniqueEntities = deduplicateEnhancedEntities(allEntities)

    // 4. Filter by confidence and sort by position
    const filteredEntities = uniqueEntities
      .filter((entity) => entity.confidence >= confidenceThreshold)
      .sort((a, b) => a.start - b.start)

    // 5. Generate redacted text
    const redactedText = generateEnhancedRedactedText(text, filteredEntities)

    const processingTime = Date.now() - startTime
    const criticalEntities = filteredEntities.filter((e) => e.riskLevel === "CRITICAL").length

    console.log(`[Enhanced NER] Processing completed in ${processingTime}ms`)
    console.log(`[Enhanced NER] Found ${filteredEntities.length} entities (${criticalEntities} critical)`)
    
    // Log detected entities for debugging
    filteredEntities.forEach((entity, index) => {
      console.log(`[Enhanced NER] Entity ${index + 1}:`, {
        text: entity.text,
        label: entity.label,
        confidence: entity.confidence,
        riskLevel: entity.riskLevel,
        policy: entity.redactionPolicy,
        start: entity.start,
        end: entity.end
      })
    })

    return {
      entities: filteredEntities,
      redactedText,
      processingTime,
      modelStats: {
        patternMatches: patternEntities.length,
        transformerMatches: transformersEntities.length,
        totalEntities: filteredEntities.length,
        criticalEntities,
      },
    }
  } catch (error) {
    console.error("[v0] Enhanced NER processing error:", error)
    throw new Error("Failed to process text with enhanced NER")
  }
}

function deduplicateEnhancedEntities(entities: EnhancedDetectedEntity[]): EnhancedDetectedEntity[] {
  // Sort by risk level first, then confidence
  const riskOrder = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 }
  const sorted = entities.sort((a, b) => {
    const riskDiff = riskOrder[b.riskLevel] - riskOrder[a.riskLevel]
    return riskDiff !== 0 ? riskDiff : b.confidence - a.confidence
  })

  const deduplicated: EnhancedDetectedEntity[] = []

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

// Generate enhanced redacted text
function generateEnhancedRedactedText(originalText: string, entities: EnhancedDetectedEntity[]): string {
  let redactedText = originalText
  let offset = 0

  const sortedEntities = [...entities].sort((a, b) => a.start - b.start)

  for (const entity of sortedEntities) {
    const redactedValue = applyEnhancedRedaction(entity.text, entity.redactionPolicy)
    const adjustedStart = entity.start + offset
    const adjustedEnd = entity.end + offset

    redactedText = redactedText.slice(0, adjustedStart) + redactedValue + redactedText.slice(adjustedEnd)
    offset += redactedValue.length - entity.text.length
  }

  return redactedText
}

// Preload models
export async function preloadEnhancedNERModels(): Promise<void> {
  try {
    await initializeMultiModelNER()
    await preloadTransformersModels()
    console.log("[v0] Enhanced NER models preloaded successfully")
  } catch (error) {
    console.error("[v0] Failed to preload enhanced NER models:", error)
  }
}
