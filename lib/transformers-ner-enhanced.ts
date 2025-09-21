import { pipeline, env } from "@xenova/transformers"

// Configure transformers.js with your Hugging Face key
env.allowRemoteModels = true
env.allowLocalModels = true
env.remoteURL = "https://huggingface.co"
env.HF_TOKEN = "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"

// Financial domain specific models
export const FINANCIAL_NER_MODELS = {
  // Primary models for financial documents
  FINANCIAL_BERT: "nlpaueb/finbert",
  ENGLISH_NER: "Xenova/bert-base-NER",
  MULTILINGUAL_NER: "Xenova/bert-base-multilingual-cased-ner-hrl",
  
  // Specialized models
  FINANCIAL_ROBERTA: "yiyanghkust/finbert-tone",
  DOCUMENT_LAYOUT: "microsoft/layoutlm-base-uncased",
  FORM_UNDERSTANDING: "microsoft/layoutlmv3-base",
} as const

export interface FinancialEntity {
  text: string
  label: string
  confidence: number
  start: number
  end: number
  entityType: "PERSONAL" | "FINANCIAL" | "ORGANIZATIONAL" | "TEMPORAL" | "LOCATIONAL"
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
  redactionPolicy: "FULL" | "PARTIAL" | "HASH" | "MASK"
  context?: string
}

export interface NERProcessingResult {
  entities: FinancialEntity[]
  redactedText: string
  processingTime: number
  modelUsed: string
  confidence: number
  modelStats: {
    totalEntities: number
    criticalEntities: number
    highRiskEntities: number
    mediumRiskEntities: number
    lowRiskEntities: number
  }
}

// Enhanced financial patterns for better detection
const ENHANCED_FINANCIAL_PATTERNS = {
  // Critical financial identifiers
  SSN: {
    pattern: /\b(?:\d{3}[-.\s]?\d{2}[-.\s]?\d{4})\b/g,
    riskLevel: "CRITICAL" as const,
    redactionPolicy: "FULL" as const,
    entityType: "PERSONAL" as const,
  },
  CREDIT_CARD: {
    pattern: /\b(?:\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4})\b/g,
    riskLevel: "CRITICAL" as const,
    redactionPolicy: "FULL" as const,
    entityType: "FINANCIAL" as const,
  },
  BANK_ACCOUNT: {
    pattern: /\b(?:Account|Acct)[\s#:]*(\d{8,17})\b/gi,
    riskLevel: "CRITICAL" as const,
    redactionPolicy: "FULL" as const,
    entityType: "FINANCIAL" as const,
  },
  ROUTING_NUMBER: {
    pattern: /\b(?:Routing|ABA|RTN)[\s#:]*(\d{9})\b/gi,
    riskLevel: "CRITICAL" as const,
    redactionPolicy: "FULL" as const,
    entityType: "FINANCIAL" as const,
  },
  
  // High risk personal information
  EMAIL: {
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    riskLevel: "HIGH" as const,
    redactionPolicy: "HASH" as const,
    entityType: "PERSONAL" as const,
  },
  PHONE: {
    pattern: /\([0-9]{3}\)\s?[0-9]{3}[-.\s]?[0-9]{4}/g,
    riskLevel: "HIGH" as const,
    redactionPolicy: "MASK" as const,
    entityType: "PERSONAL" as const,
  },
  SIGNATURE: {
    pattern: /\b(?:Signature|Sign)[\s:]*([A-Za-z\s]{3,30})\b/gi,
    riskLevel: "HIGH" as const,
    redactionPolicy: "FULL" as const,
    entityType: "PERSONAL" as const,
  },
  ADDRESS: {
    pattern: /\b(?:\d+\s+[A-Za-z\s]+(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Boulevard|Blvd|Circle|Cir|Court|Ct|Place|Pl|Square|Sq|Way|Trail|Trl|Terrace|Ter|Parkway|Pkwy))\b/gi,
    riskLevel: "HIGH" as const,
    redactionPolicy: "PARTIAL" as const,
    entityType: "PERSONAL" as const,
  },
  
  // Document-specific identifiers
  INVOICE_NUMBER: {
    pattern: /\b(?:Invoice|INV|Invoice\s*#)[\s#:]*([A-Z0-9-]{6,20})\b/gi,
    riskLevel: "MEDIUM" as const,
    redactionPolicy: "PARTIAL" as const,
    entityType: "FINANCIAL" as const,
  },
  TRANSACTION_ID: {
    pattern: /\b(?:Transaction|Trans|TXN)[\s#:]*([A-Z0-9-]{8,25})\b/gi,
    riskLevel: "HIGH" as const,
    redactionPolicy: "FULL" as const,
    entityType: "FINANCIAL" as const,
  },
  LOAN_NUMBER: {
    pattern: /\b(?:Loan|Loan\s*#)[\s#:]*([A-Z0-9-]{8,20})\b/gi,
    riskLevel: "HIGH" as const,
    redactionPolicy: "FULL" as const,
    entityType: "FINANCIAL" as const,
  },
  POLICY_NUMBER: {
    pattern: /\b(?:Policy|Policy\s*#)[\s#:]*([A-Z0-9-]{8,20})\b/gi,
    riskLevel: "HIGH" as const,
    redactionPolicy: "FULL" as const,
    entityType: "FINANCIAL" as const,
  },
  REFERENCE_NUMBER: {
    pattern: /\b(?:Ref|Reference|Ref\s*#)[\s#:]*([A-Z0-9-]{6,20})\b/gi,
    riskLevel: "MEDIUM" as const,
    redactionPolicy: "PARTIAL" as const,
    entityType: "FINANCIAL" as const,
  },
  P_O_NUMBER: {
    pattern: /\b(?:P\.O\.|PO)[\s#:]*(\d{4,12})\b/gi,
    riskLevel: "MEDIUM" as const,
    redactionPolicy: "PARTIAL" as const,
    entityType: "FINANCIAL" as const,
  },
  CUSTOMER_ID: {
    pattern: /\b(?:Customer|Cust|ID)[\s#:]*([A-Z0-9-]{6,15})\b/gi,
    riskLevel: "HIGH" as const,
    redactionPolicy: "FULL" as const,
    entityType: "PERSONAL" as const,
  },
  
  // Government identifiers
  TAX_ID: {
    pattern: /\b(?:EIN|Tax ID)[\s#:]*(\d{2}-?\d{7})\b/gi,
    riskLevel: "CRITICAL" as const,
    redactionPolicy: "FULL" as const,
    entityType: "PERSONAL" as const,
  },
  DRIVERS_LICENSE: {
    pattern: /\b(?:DL|License)[\s#:]*([A-Z0-9]{6,12})\b/gi,
    riskLevel: "HIGH" as const,
    redactionPolicy: "FULL" as const,
    entityType: "PERSONAL" as const,
  },
  PASSPORT: {
    pattern: /\b(?:Passport)[\s#:]*([A-Z]\d{8})\b/gi,
    riskLevel: "CRITICAL" as const,
    redactionPolicy: "FULL" as const,
    entityType: "PERSONAL" as const,
  },
  DATE_OF_BIRTH: {
    pattern: /\b(?:DOB|Date of Birth)[\s:]*(\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4})\b/gi,
    riskLevel: "CRITICAL" as const,
    redactionPolicy: "FULL" as const,
    entityType: "PERSONAL" as const,
  },
  
  // Financial amounts and dates
  AMOUNT: {
    pattern: /\b(?:\$|USD|INR|EUR|GBP)?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)\b/g,
    riskLevel: "MEDIUM" as const,
    redactionPolicy: "PARTIAL" as const,
    entityType: "FINANCIAL" as const,
  },
  DATE: {
    pattern: /\b(?:\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}|\d{4}[/\-.]\d{1,2}[/\-.]\d{1,2})\b/g,
    riskLevel: "LOW" as const,
    redactionPolicy: "PARTIAL" as const,
    entityType: "TEMPORAL" as const,
  },
}

// Initialize NER pipelines
let financialNERPipeline: any = null
let generalNERPipeline: any = null
let multilingualNERPipeline: any = null

export async function initializeTransformersNER(): Promise<void> {
  console.log("[FinSecure] Initializing Transformers.js NER models...")
  
  try {
    // Initialize primary financial NER model
    if (!financialNERPipeline) {
      console.log("[FinSecure] Loading financial NER model...")
      financialNERPipeline = await pipeline(
        "token-classification", 
        FINANCIAL_NER_MODELS.ENGLISH_NER,
        {
          aggregation_strategy: "simple",
          device: "webgpu", // Use WebGPU if available
        }
      )
      console.log("[FinSecure] ✅ Financial NER model loaded successfully")
    }

    // Initialize general NER model for fallback
    if (!generalNERPipeline) {
      console.log("[FinSecure] Loading general NER model...")
      generalNERPipeline = await pipeline(
        "token-classification",
        FINANCIAL_NER_MODELS.MULTILINGUAL_NER,
        {
          aggregation_strategy: "simple",
          device: "webgpu",
        }
      )
      console.log("[FinSecure] ✅ General NER model loaded successfully")
    }

    // Initialize multilingual model
    multilingualNERPipeline = generalNERPipeline

    console.log("[FinSecure] 🎉 All Transformers.js models initialized successfully")
  } catch (error) {
    console.warn("[FinSecure] ⚠️ WebGPU not available, falling back to CPU")
    
    // Fallback to CPU initialization
    try {
      financialNERPipeline = await pipeline(
        "token-classification", 
        FINANCIAL_NER_MODELS.ENGLISH_NER,
        { aggregation_strategy: "simple" }
      )
      
      generalNERPipeline = await pipeline(
        "token-classification",
        FINANCIAL_NER_MODELS.MULTILINGUAL_NER,
        { aggregation_strategy: "simple" }
      )
      
      multilingualNERPipeline = generalNERPipeline
      
      console.log("[FinSecure] ✅ Models initialized with CPU fallback")
    } catch (fallbackError) {
      console.error("[FinSecure] ❌ Failed to initialize models:", fallbackError)
      throw new Error("Failed to initialize NER models")
    }
  }
}

export async function processTextWithTransformersNER(
  text: string,
  language: string = "en",
  confidenceThreshold: number = 0.6
): Promise<NERProcessingResult> {
  const startTime = Date.now()
  
  try {
    console.log(`[FinSecure] Processing text with Transformers.js NER (${text.length} characters)...`)
    
    // Initialize models if needed
    await initializeTransformersNER()
    
    // Select appropriate model based on language
    let selectedPipeline = financialNERPipeline
    let modelUsed = FINANCIAL_NER_MODELS.ENGLISH_NER
    
    if (language !== "en") {
      selectedPipeline = multilingualNERPipeline
      modelUsed = FINANCIAL_NER_MODELS.MULTILINGUAL_NER
    }
    
    console.log(`[FinSecure] Using model: ${modelUsed}`)
    
    // 1. Pattern-based detection (highest priority)
    console.log("[FinSecure] Running pattern-based detection...")
    const patternEntities = detectFinancialPatterns(text)
    console.log(`[FinSecure] Pattern detection found ${patternEntities.length} entities`)
    
    // 2. Transformer-based NER
    console.log("[FinSecure] Running transformer-based NER...")
    const rawResults = await selectedPipeline(text)
    
    const transformerEntities: FinancialEntity[] = rawResults
      .filter((result: any) => result.score >= confidenceThreshold)
      .map((result: any) => {
        const mappedEntity = mapTransformerEntity(result, text)
        return mappedEntity
      })
    
    console.log(`[FinSecure] Transformer NER found ${transformerEntities.length} entities`)
    
    // 3. Combine and deduplicate entities
    const allEntities = [...patternEntities, ...transformerEntities]
    const uniqueEntities = deduplicateEntities(allEntities)
    
    // 4. Filter by confidence and sort by position
    const filteredEntities = uniqueEntities
      .filter((entity) => entity.confidence >= confidenceThreshold)
      .sort((a, b) => a.start - b.start)
    
    // 5. Generate redacted text
    const redactedText = generateRedactedText(text, filteredEntities)
    
    const processingTime = Date.now() - startTime
    const avgConfidence = filteredEntities.length > 0 
      ? filteredEntities.reduce((sum, e) => sum + e.confidence, 0) / filteredEntities.length 
      : 0
    
    // Calculate statistics
    const stats = {
      totalEntities: filteredEntities.length,
      criticalEntities: filteredEntities.filter(e => e.riskLevel === "CRITICAL").length,
      highRiskEntities: filteredEntities.filter(e => e.riskLevel === "HIGH").length,
      mediumRiskEntities: filteredEntities.filter(e => e.riskLevel === "MEDIUM").length,
      lowRiskEntities: filteredEntities.filter(e => e.riskLevel === "LOW").length,
    }
    
    console.log(`[FinSecure] ✅ NER processing completed in ${processingTime}ms`)
    console.log(`[FinSecure] 📊 Found ${stats.totalEntities} entities (${stats.criticalEntities} critical, ${stats.highRiskEntities} high risk)`)
    
    return {
      entities: filteredEntities,
      redactedText,
      processingTime,
      modelUsed,
      confidence: avgConfidence,
      modelStats: stats,
    }
  } catch (error) {
    console.error("[FinSecure] ❌ NER processing error:", error)
    throw new Error("Failed to process text with Transformers.js NER")
  }
}

function detectFinancialPatterns(text: string): FinancialEntity[] {
  const entities: FinancialEntity[] = []
  
  Object.entries(ENHANCED_FINANCIAL_PATTERNS).forEach(([labelKey, config]) => {
    const matches = Array.from(text.matchAll(config.pattern))
    matches.forEach((match) => {
      if (match.index !== undefined) {
        const entityText = match[1] || match[0] // Use capture group if available
        
        // Extract context around the match
        const contextStart = Math.max(0, match.index - 20)
        const contextEnd = Math.min(text.length, match.index + entityText.length + 20)
        const context = text.slice(contextStart, contextEnd)
        
        entities.push({
          text: entityText,
          label: labelKey,
          confidence: 0.95, // High confidence for pattern matches
          start: match.index + match[0].indexOf(entityText),
          end: match.index + match[0].indexOf(entityText) + entityText.length,
          entityType: config.entityType,
          riskLevel: config.riskLevel,
          redactionPolicy: config.redactionPolicy,
          context,
        })
      }
    })
  })
  
  return entities
}

function mapTransformerEntity(result: any, originalText: string): FinancialEntity {
  const entityGroup = result.entity_group?.toUpperCase() || ""
  const text = result.word.replace(/^##/, "") // Remove BERT subword tokens
  
  // Enhanced mapping for financial documents
  let label = "MISC"
  let entityType: FinancialEntity["entityType"] = "ORGANIZATIONAL"
  let riskLevel: FinancialEntity["riskLevel"] = "MEDIUM"
  let redactionPolicy: FinancialEntity["redactionPolicy"] = "PARTIAL"
  
  // Map entity groups to financial categories
  if (entityGroup.includes("PER") || entityGroup.includes("PERSON")) {
    label = "PERSON"
    entityType = "PERSONAL"
    riskLevel = "HIGH"
    redactionPolicy = "PARTIAL"
  } else if (entityGroup.includes("ORG")) {
    label = "ORGANIZATION"
    entityType = "ORGANIZATIONAL"
    riskLevel = "MEDIUM"
    redactionPolicy = "PARTIAL"
  } else if (entityGroup.includes("LOC") || entityGroup.includes("GPE")) {
    label = "LOCATION"
    entityType = "LOCATIONAL"
    riskLevel = "MEDIUM"
    redactionPolicy = "PARTIAL"
  } else if (entityGroup.includes("MISC")) {
    // Smart classification for MISC entities based on content
    const lowerText = text.toLowerCase()
    
    if (lowerText.includes("@")) {
      label = "EMAIL"
      entityType = "PERSONAL"
      riskLevel = "HIGH"
      redactionPolicy = "HASH"
    } else if (/\d{3}-?\d{2}-?\d{4}/.test(text)) {
      label = "SSN"
      entityType = "PERSONAL"
      riskLevel = "CRITICAL"
      redactionPolicy = "FULL"
    } else if (/\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}/.test(text)) {
      label = "CREDIT_CARD"
      entityType = "FINANCIAL"
      riskLevel = "CRITICAL"
      redactionPolicy = "FULL"
    } else if (/\b\d{9}\b/.test(text)) {
      label = "ROUTING_NUMBER"
      entityType = "FINANCIAL"
      riskLevel = "CRITICAL"
      redactionPolicy = "FULL"
    } else if (/\b\d{8,17}\b/.test(text)) {
      label = "BANK_ACCOUNT"
      entityType = "FINANCIAL"
      riskLevel = "CRITICAL"
      redactionPolicy = "FULL"
    } else if (/\$\d+/.test(text) || /\d+\.\d{2}/.test(text)) {
      label = "AMOUNT"
      entityType = "FINANCIAL"
      riskLevel = "MEDIUM"
      redactionPolicy = "PARTIAL"
    } else if (/\b\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}\b/.test(text)) {
      label = "DATE"
      entityType = "TEMPORAL"
      riskLevel = "LOW"
      redactionPolicy = "PARTIAL"
    } else {
      label = "ORGANIZATION"
      entityType = "ORGANIZATIONAL"
      riskLevel = "MEDIUM"
      redactionPolicy = "PARTIAL"
    }
  }
  
  return {
    text,
    label,
    confidence: result.score,
    start: result.start,
    end: result.end,
    entityType,
    riskLevel,
    redactionPolicy,
    context: originalText.slice(Math.max(0, result.start - 20), Math.min(originalText.length, result.end + 20)),
  }
}

function deduplicateEntities(entities: FinancialEntity[]): FinancialEntity[] {
  // Sort by risk level first, then confidence
  const riskOrder = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 }
  const sorted = entities.sort((a, b) => {
    const riskDiff = riskOrder[b.riskLevel] - riskOrder[a.riskLevel]
    return riskDiff !== 0 ? riskDiff : b.confidence - a.confidence
  })
  
  const deduplicated: FinancialEntity[] = []
  
  for (const entity of sorted) {
    const hasOverlap = deduplicated.some(
      (existing) =>
        (entity.start >= existing.start && entity.start < existing.end) ||
        (entity.end > existing.start && entity.end <= existing.end) ||
        (entity.start <= existing.start && entity.end >= existing.end)
    )
    
    if (!hasOverlap) {
      deduplicated.push(entity)
    }
  }
  
  return deduplicated
}

function generateRedactedText(originalText: string, entities: FinancialEntity[]): string {
  let redactedText = originalText
  let offset = 0
  
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

function applyRedaction(text: string, policy: "FULL" | "PARTIAL" | "HASH" | "MASK"): string {
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

// Preload models for faster subsequent processing
export async function preloadTransformersModels(): Promise<void> {
  try {
    await initializeTransformersNER()
    console.log("[FinSecure] ✅ Transformers.js models preloaded successfully")
  } catch (error) {
    console.error("[FinSecure] ❌ Failed to preload models:", error)
  }
}

// Export model information for debugging
export function getModelInfo(): { models: string[], initialized: boolean[] } {
  return {
    models: [
      FINANCIAL_NER_MODELS.ENGLISH_NER,
      FINANCIAL_NER_MODELS.MULTILINGUAL_NER,
      FINANCIAL_NER_MODELS.FINANCIAL_BERT,
    ],
    initialized: [
      !!financialNERPipeline,
      !!generalNERPipeline,
      !!multilingualNERPipeline,
    ]
  }
}
