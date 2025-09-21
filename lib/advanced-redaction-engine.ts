import type { EnhancedDetectedEntity } from "./multi-model-ner"
import type { VisualPIIDetection, DocumentRegion } from "./computer-vision-analysis"
import type { OCRBoundingBox } from "./advanced-ocr"

export interface RedactionBox {
  x: number
  y: number
  width: number
  height: number
  type: "text" | "visual"
  entity?: EnhancedDetectedEntity
  visualPII?: VisualPIIDetection
}

export interface RedactedDocument {
  redactedImageData?: string
  redactedText: string
  redactionBoxes: RedactionBox[]
  metadata: {
    totalRedactions: number
    criticalRedactions: number
    processingTime: number
  }
}

export function createRedactionBoxes(
  textEntities: EnhancedDetectedEntity[],
  visualPII: VisualPIIDetection[],
  documentRegions: DocumentRegion[],
  ocrBoundingBoxes: OCRBoundingBox[],
  imageWidth: number,
  imageHeight: number,
): RedactionBox[] {
  const boxes: RedactionBox[] = []

  console.log("[v0] Creating redaction boxes with OCR bounding data...")
  console.log("[v0] Text entities:", textEntities.length)
  console.log("[v0] OCR bounding boxes:", ocrBoundingBoxes.length)

  // Add text-based redaction boxes using actual OCR coordinates
  textEntities.forEach((entity) => {
    const unionBox = findMatchingOCRUnionBox(entity, ocrBoundingBoxes)
    if (unionBox) {
      boxes.push({
        x: unionBox.boundingBox.x,
        y: unionBox.boundingBox.y,
        width: unionBox.boundingBox.width,
        height: unionBox.boundingBox.height,
        type: "text",
        entity,
      })
    } else {
      console.log(`[v0] Skipping entity without reliable OCR match: "${entity.text}"`)
    }
  })

  // Add visual PII redaction boxes
  visualPII.forEach((visual) => {
    const [x1, y1, x2, y2] = visual.bbox
    boxes.push({
      x: x1,
      y: y1,
      width: x2 - x1,
      height: y2 - y1,
      type: "visual",
      visualPII: visual,
    })
  })

  console.log(`[v0] Created ${boxes.length} redaction boxes total`)
  return boxes
}

function normalizeToken(t: string): string {
  return t.replace(/[^\p{L}\p{N}]/gu, "").toLowerCase()
}

function findMatchingOCRUnionBox(entity: EnhancedDetectedEntity, ocrBoxes: OCRBoundingBox[]): OCRBoundingBox | null {
  console.log(`[Redaction Engine] Finding OCR box for entity: "${entity.text}" (${entity.label})`)
  
  const entityTokens = entity.text
    .split(/\s+/)
    .map(normalizeToken)
    .filter(Boolean)
  if (entityTokens.length === 0) return null

  // Special handling for names - look for multi-word patterns
  if (entity.label === 'NAME' || entity.label === 'PERSON_NAME') {
    // For names, try to find consecutive words that match the name pattern
    for (let i = 0; i < ocrBoxes.length - 1; i++) {
      const currentBox = ocrBoxes[i]
      const nextBox = ocrBoxes[i + 1]
      
      const combinedText = `${currentBox.text} ${nextBox.text}`.toLowerCase()
      const entityText = entity.text.toLowerCase()
      
      if (combinedText === entityText || 
          combinedText.includes(entityText) || 
          entityText.includes(combinedText)) {
        // Found a match, create a union box
        const left = Math.min(currentBox.boundingBox.x, nextBox.boundingBox.x)
        const top = Math.min(currentBox.boundingBox.y, nextBox.boundingBox.y)
        const right = Math.max(
          currentBox.boundingBox.x + currentBox.boundingBox.width,
          nextBox.boundingBox.x + nextBox.boundingBox.width
        )
        const bottom = Math.max(
          currentBox.boundingBox.y + currentBox.boundingBox.height,
          nextBox.boundingBox.y + nextBox.boundingBox.height
        )
        
        return {
          text: combinedText,
          confidence: Math.min(currentBox.confidence, nextBox.confidence),
          boundingBox: { x: left, y: top, width: right - left, height: bottom - top }
        }
      }
    }
  }

  // Score each OCR word by token overlap
  const scored: Array<{ box: OCRBoundingBox; hit: boolean; score: number }> = ocrBoxes.map((b) => {
    const boxTokens = b.text
      .split(/\s+/)
      .map(normalizeToken)
      .filter(Boolean)
    const overlap = boxTokens.filter((t) => entityTokens.includes(t)).length
    const exactMatch = entityTokens.some(et => boxTokens.some(bt => et === bt))
    const partialMatch = entityTokens.some(et => boxTokens.some(bt => et.includes(bt) || bt.includes(et)))
    
    let score = 0
    if (exactMatch) score = 2
    else if (partialMatch) score = 1
    else if (overlap > 0) score = 0.5
    
    return { box: b, hit: overlap > 0, score }
  })

  // Collect consecutive hits as a span and union their geometry
  const spans: OCRBoundingBox[] = []
  let current: OCRBoundingBox | null = null
  for (const { box, hit } of scored) {
    if (!hit) {
      current = null
      continue
    }
    if (!current) {
      current = {
        text: box.text,
        confidence: box.confidence,
        boundingBox: { ...box.boundingBox },
      }
      spans.push(current)
    } else {
      current.text += " " + box.text
      current.confidence = Math.min(current.confidence, box.confidence)
      const left = Math.min(current.boundingBox.x, box.boundingBox.x)
      const top = Math.min(current.boundingBox.y, box.boundingBox.y)
      const right = Math.max(
        current.boundingBox.x + current.boundingBox.width,
        box.boundingBox.x + box.boundingBox.width,
      )
      const bottom = Math.max(
        current.boundingBox.y + current.boundingBox.height,
        box.boundingBox.y + box.boundingBox.height,
      )
      current.boundingBox = { x: left, y: top, width: right - left, height: bottom - top }
    }
  }

  if (spans.length === 0) {
    // As a last resort, use fuzzy similarity across words and union top-3 matches
    const scoredFuzzy = ocrBoxes
      .map((b) => ({ box: b, sim: calculateTextSimilarity(entity.text.toLowerCase(), b.text.toLowerCase()) }))
      .filter((s) => s.sim >= 0.6)
      .sort((a, b) => b.sim - a.sim)
      .slice(0, 3)
    if (scoredFuzzy.length === 0) return null
    const union = scoredFuzzy.reduce(
      (acc, s) => {
        acc.text += " " + s.box.text
        const left = Math.min(acc.boundingBox.x, s.box.boundingBox.x)
        const top = Math.min(acc.boundingBox.y, s.box.boundingBox.y)
        const right = Math.max(acc.boundingBox.x + acc.boundingBox.width, s.box.boundingBox.x + s.box.boundingBox.width)
        const bottom = Math.max(
          acc.boundingBox.y + acc.boundingBox.height,
          s.box.boundingBox.y + s.box.boundingBox.height,
        )
        acc.boundingBox = { x: left, y: top, width: right - left, height: bottom - top }
        return acc
      },
      {
        text: scoredFuzzy[0].box.text,
        confidence: scoredFuzzy[0].box.confidence,
        boundingBox: { ...scoredFuzzy[0].box.boundingBox },
      } as OCRBoundingBox,
    )
    return union
  }

  // Choose the span whose tokens best cover the entity tokens
  const pick = spans.sort((a, b) => b.text.length - a.text.length)[0]
  return pick
}

function calculateTextSimilarity(text1: string, text2: string): number {
  const longer = text1.length > text2.length ? text1 : text2
  const shorter = text1.length > text2.length ? text2 : text1

  if (longer.length === 0) return 1.0

  const editDistance = levenshteinDistance(longer, shorter)
  return (longer.length - editDistance) / longer.length
}

function levenshteinDistance(str1: string, str2: string): number {
  const matrix = []

  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i]
  }

  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j
  }

  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1)
      }
    }
  }

  return matrix[str2.length][str1.length]
}

export async function generateRedactedDocument(
  originalText: string,
  imageData: string | null,
  textEntities: EnhancedDetectedEntity[],
  visualPII: VisualPIIDetection[],
  documentRegions: DocumentRegion[],
  ocrBoundingBoxes: OCRBoundingBox[],
  selectedEntityIndices: Set<number>,
): Promise<RedactedDocument> {
  const startTime = Date.now()

  console.log("[v0] Generating comprehensive redacted document...")
  console.log("[v0] Selected entities:", selectedEntityIndices.size, "out of", textEntities.length)

  // Filter selected entities
  const selectedEntities = textEntities.filter((_, index) => selectedEntityIndices.has(index))

  // Generate redacted text
  let redactedText = originalText
  let offset = 0

  const sortedEntities = [...selectedEntities].sort((a, b) => a.start - b.start)

  for (const entity of sortedEntities) {
    const redactedValue = applyRedaction(entity.text, entity.redactionPolicy)
    const adjustedStart = entity.start + offset
    const adjustedEnd = entity.end + offset

    redactedText = redactedText.slice(0, adjustedStart) + redactedValue + redactedText.slice(adjustedEnd)
    offset += redactedValue.length - entity.text.length
  }

  // Create redaction boxes using actual OCR coordinates
  const redactionBoxes = imageData
    ? createRedactionBoxes(
        selectedEntities,
        visualPII,
        documentRegions,
        ocrBoundingBoxes,
        // If available, infer from image data URL via a temporary image
        800,
        600,
      )
    : []

  // Apply image redactions if image data exists
  let redactedImageData: string | undefined
  if (imageData && redactionBoxes.length > 0) {
    console.log("[v0] Applying image redactions to", redactionBoxes.length, "areas")
    redactedImageData = await applyImageRedactions(imageData, redactionBoxes)
  } else {
    console.log("[v0] No image redactions to apply")
  }

  const processingTime = Date.now() - startTime
  const criticalRedactions = selectedEntities.filter((e) => e.riskLevel === "CRITICAL").length

  return {
    redactedImageData,
    redactedText,
    redactionBoxes,
    metadata: {
      totalRedactions: selectedEntities.length,
      criticalRedactions,
      processingTime,
    },
  }
}

export async function applyImageRedactions(imageData: string, redactionBoxes: RedactionBox[]): Promise<string> {
  console.log("[Redaction Engine] Applying image redactions...")

  try {
    // Import sharp dynamically for server-side image processing
    const sharp = (await import("sharp")).default
    
    // Convert data URL to buffer
    const base64Data = imageData.replace(/^data:image\/[a-z]+;base64,/, "")
    const imageBuffer = Buffer.from(base64Data, "base64")
    
    // Load image with sharp
    let image = sharp(imageBuffer)
    const metadata = await image.metadata()
    
    console.log("[Redaction Engine] Image dimensions:", metadata.width, "x", metadata.height)
    console.log("[Redaction Engine] Applying", redactionBoxes.length, "redaction boxes")
    
    // Create overlay for redactions using SVG
    const overlayBuffer = Buffer.from(`
      <svg width="${metadata.width}" height="${metadata.height}" xmlns="http://www.w3.org/2000/svg">
        ${redactionBoxes.map(box => 
          `<rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" fill="#000000" opacity="1"/>`
        ).join('')}
      </svg>
    `)
    
    // Apply redactions using sharp
    const redactedBuffer = await image
      .composite([{ input: overlayBuffer, top: 0, left: 0 }])
      .png()
      .toBuffer()
    
    // Convert back to data URL
    const redactedDataUrl = `data:image/png;base64,${redactedBuffer.toString('base64')}`
    console.log("[Redaction Engine] Successfully applied redactions")
    
    return redactedDataUrl
    
  } catch (error) {
    console.error("[Redaction Engine] Image redaction error:", error)
    // Fallback: return original image if redaction fails
    console.log("[Redaction Engine] Falling back to original image")
    return imageData
  }
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
