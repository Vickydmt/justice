import { pipeline, env } from "@xenova/transformers"

// Configure transformers.js for better performance
env.allowRemoteModels = true
env.allowLocalModels = true
env.remoteURL = "https://huggingface.co"

// Financial domain specific models from Hugging Face
export const FINANCIAL_NER_MODELS = {
  // General financial NER models
  FINANCIAL_BERT: "nlpaueb/finbert",
  FINANCIAL_ROBERTA: "yiyanghkust/finbert-tone",
  
  // Specialized PII detection models
  PII_DETECTION: "microsoft/DialoGPT-medium",
  
  // Multi-language NER models
  MULTILINGUAL_NER: "Babelscape/wikineural-multilingual-ner",
  ENGLISH_NER: "dbmdz/bert-large-cased-finetuned-conll03-english",
  
  // Document understanding models
  DOCUMENT_LAYOUT: "microsoft/layoutlm-base-uncased",
  FORM_UNDERSTANDING: "microsoft/layoutlmv3-base",
  
  // OCR and text extraction
  OCR_MODEL: "microsoft/trocr-base-printed",
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
}

export interface HuggingFaceNERResult {
  entities: FinancialEntity[]
  processingTime: number
  modelUsed: string
  confidence: number
}

// Initialize multiple NER pipelines for ensemble approach
let financialNERPipeline: any = null
let generalNERPipeline: any = null
let multilingualNERPipeline: any = null

export async function initializeHuggingFaceModels(): Promise<void> {
  console.log("[v0] Initializing Hugging Face financial NER models...")
  
  try {
    // Initialize financial domain model
    if (!financialNERPipeline) {
      financialNERPipeline = await pipeline(
        "token-classification", 
        FINANCIAL_NER_MODELS.ENGLISH_NER,
        {
          aggregation_strategy: "simple",
          device: "webgpu", // Use WebGPU if available
        }
      )
      console.log("[v0] Financial NER model initialized")
    }

    // Initialize general NER model
    if (!generalNERPipeline) {
      generalNERPipeline = await pipeline(
        "token-classification",
        FINANCIAL_NER_MODELS.MULTILINGUAL_NER,
        {
          aggregation_strategy: "simple",
          device: "webgpu",
        }
      )
      console.log("[v0] General NER model initialized")
    }

    // Initialize multilingual model for non-English documents
    if (!multilingualNERPipeline) {
      multilingualNERPipeline = await pipeline(
        "token-classification",
        FINANCIAL_NER_MODELS.MULTILINGUAL_NER,
        {
          aggregation_strategy: "simple",
          device: "webgpu",
        }
      )
      console.log("[v0] Multilingual NER model initialized")
    }

    console.log("[v0] All Hugging Face models initialized successfully")
  } catch (error) {
    console.warn("[v0] WebGPU not available, falling back to CPU")
    
    // Fallback to CPU initialization
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
    
    multilingualNERPipeline = generalNERPipeline // Use same pipeline for both
    
    console.log("[v0] Models initialized with CPU fallback")
  }
}

export async function processTextWithHuggingFace(
  text: string,
  language: string = "en",
  confidenceThreshold: number = 0.6
): Promise<HuggingFaceNERResult> {
  const startTime = Date.now()
  
  try {
    console.log("[v0] Processing text with Hugging Face models...")
    
    // Initialize models if needed
    await initializeHuggingFaceModels()
    
    // Select appropriate model based on language
    let selectedPipeline = financialNERPipeline
    let modelUsed = FINANCIAL_NER_MODELS.ENGLISH_NER
    
    if (language !== "en") {
      selectedPipeline = multilingualNERPipeline
      modelUsed = FINANCIAL_NER_MODELS.MULTILINGUAL_NER
    }
    
    // Run NER processing
    const rawResults = await selectedPipeline(text)
    
    // Convert to our format with enhanced financial entity mapping
    const entities: FinancialEntity[] = rawResults
      .filter((result: any) => result.score >= confidenceThreshold)
      .map((result: any) => {
        const mappedEntity = mapHuggingFaceEntity(result, text)
        return mappedEntity
      })
    
    // Remove duplicates and sort by position
    const uniqueEntities = deduplicateEntities(entities)
    const sortedEntities = uniqueEntities.sort((a, b) => a.start - b.start)
    
    const processingTime = Date.now() - startTime
    const avgConfidence = sortedEntities.length > 0 
      ? sortedEntities.reduce((sum, e) => sum + e.confidence, 0) / sortedEntities.length 
      : 0
    
    console.log(`[v0] Hugging Face NER completed in ${processingTime}ms, found ${sortedEntities.length} entities`)
    
    return {
      entities: sortedEntities,
      processingTime,
      modelUsed,
      confidence: avgConfidence,
    }
  } catch (error) {
    console.error("[v0] Hugging Face NER processing error:", error)
    throw new Error("Failed to process text with Hugging Face models")
  }
}

function mapHuggingFaceEntity(result: any, originalText: string): FinancialEntity {
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
      label = "ACCOUNT_NUMBER"
      entityType = "FINANCIAL"
      riskLevel = "CRITICAL"
      redactionPolicy = "FULL"
    } else if (/\$\d+/.test(text) || /\d+\.\d{2}/.test(text)) {
      label = "MONETARY_AMOUNT"
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

// Preload models for faster subsequent processing
export async function preloadHuggingFaceModels(): Promise<void> {
  try {
    await initializeHuggingFaceModels()
    console.log("[v0] Hugging Face models preloaded successfully")
  } catch (error) {
    console.error("[v0] Failed to preload Hugging Face models:", error)
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
