import { type NextRequest, NextResponse } from "next/server"
import { processVisionBase64WithBounds } from "@/lib/advanced-ocr"
import { processTextWithEnhancedNER } from "@/lib/multi-model-ner"
import { analyzeDocumentStructure, detectVisualPII } from "@/lib/computer-vision-analysis"
import { generateRedactedDocument } from "@/lib/advanced-redaction-engine"

const GOOGLE_VISION_API_KEY = "AIzaSyCLVG91jIazGPPi5GEpxiwWqSqXP4MhmFc"

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get("file") as File
    const language = (formData.get("language") as string) || "en"
    const enhanceImage = formData.get("enhanceImage") === "true"
    const confidenceThreshold = Number.parseFloat(formData.get("confidenceThreshold") as string) || 0.7
    const selectedEntitiesParam = formData.get("selectedEntities") as string
    let selectedEntityIndices = new Set<number>()

    if (selectedEntitiesParam) {
      try {
        const indices = JSON.parse(selectedEntitiesParam)
        selectedEntityIndices = new Set(indices)
      } catch (e) {
        console.log("[v0] Could not parse selected entities, using auto-selection")
      }
    }

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    if (!GOOGLE_VISION_API_KEY) {
      return NextResponse.json({ error: "Google Vision API key not configured" }, { status: 500 })
    }

    console.log("[v0] Processing document:", file.name, file.type)

    const fileBuffer = await file.arrayBuffer()
    const base64Image = Buffer.from(fileBuffer).toString("base64")
    const imageDataUrl = `data:${file.type};base64,${base64Image}`

    console.log("[v0] Starting OCR extraction with bounding boxes...")
    const ocrStartTime = Date.now()

    const ocrResult = await processVisionBase64WithBounds(base64Image, {
      language,
      enhanceImage,
      detectOrientation: true,
      detectLanguage: true,
      confidenceThreshold,
    })

    const ocrTime = Date.now() - ocrStartTime

    if (!ocrResult.text || ocrResult.text === "No text found") {
      return NextResponse.json({ error: "No text could be extracted from the document" }, { status: 400 })
    }

    console.log("[v0] OCR completed, extracted text length:", ocrResult.text.length)
    console.log("[v0] OCR bounding boxes found:", ocrResult.boundingBoxes.length)

    console.log("[v0] Starting computer vision analysis...")
    const cvStartTime = Date.now()

    const documentAnalysis = await analyzeDocumentStructure(fileBuffer)
    const visualPII = await detectVisualPII(fileBuffer)

    const cvTime = Date.now() - cvStartTime

    console.log("[v0] Starting enhanced NER processing...")
    const nerStartTime = Date.now()

    const nerResult = await processTextWithEnhancedNER(ocrResult.text, confidenceThreshold)

    const nerTime = Date.now() - nerStartTime

    console.log("[v0] Generating redacted document...")
    const redactionStartTime = Date.now()

    if (selectedEntityIndices.size === 0) {
      // Auto-select entities based on confidence threshold and risk level
      nerResult.entities.forEach((entity, index) => {
        if (entity.confidence >= confidenceThreshold) {
          // Select all entities that meet confidence threshold
          selectedEntityIndices.add(index)
        }
      })
      console.log("[v0] Auto-selected", selectedEntityIndices.size, "entities above confidence threshold")
    } else {
      console.log("[v0] Using user-selected", selectedEntityIndices.size, "entities")
    }

    const redactedDocument = await generateRedactedDocument(
      ocrResult.text,
      imageDataUrl,
      nerResult.entities,
      visualPII,
      documentAnalysis.regions,
      ocrResult.boundingBoxes,
      selectedEntityIndices,
    )

    const redactionTime = Date.now() - redactionStartTime
    const totalTime = Date.now() - ocrStartTime

    console.log("[v0] Document processing completed")
    console.log(
      `[v0] Performance: OCR=${ocrTime}ms, CV=${cvTime}ms, NER=${nerResult.processingTime}ms, Redaction=${redactionTime}ms`,
    )

    return NextResponse.json({
      success: true,
      originalText: ocrResult.text,
      entities: nerResult.entities,
      redactedText: nerResult.redactedText,
      documentAnalysis,
      visualPII,
      redactedDocument,
      modelStats: nerResult.modelStats,
      processingTime: {
        ocr: ocrTime,
        computerVision: cvTime,
        ner: nerResult.processingTime,
        redaction: redactionTime,
        total: totalTime,
      },
      metadata: {
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
        language,
        enhanceImage,
        confidenceThreshold,
        entitiesFound: nerResult.entities.length,
        criticalEntitiesFound: nerResult.modelStats.criticalEntities,
        documentType: documentAnalysis.documentType,
        visualPIIFound: visualPII.length,
        ocrBoundingBoxes: ocrResult.boundingBoxes.length,
      },
    })
  } catch (error) {
    console.error("[v0] Document processing error:", error)
    return NextResponse.json(
      { error: "Failed to process document", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    )
  }
}
