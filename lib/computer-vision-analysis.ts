export interface DocumentRegion {
  type: "text" | "signature" | "table" | "image" | "form_field"
  bbox: [number, number, number, number] // [x1, y1, x2, y2]
  confidence: number
  content?: string
}

export interface VisualPIIDetection {
  type: "signature" | "handwritten_text" | "stamp" | "logo" | "barcode"
  bbox: [number, number, number, number]
  confidence: number
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
}

export interface DocumentAnalysisResult {
  regions: DocumentRegion[]
  visualPII: VisualPIIDetection[]
  documentType: "invoice" | "bank_statement" | "loan_document" | "tax_form" | "other"
  confidence: number
}

export async function analyzeDocumentStructure(imageData: string | ArrayBuffer): Promise<DocumentAnalysisResult> {
  console.log("[v0] Starting computer vision document analysis...")

  try {
    // This would integrate with actual CV models in production
    // For now, we'll simulate the analysis based on common document patterns

    // Mock analysis - in production this would use actual CV models
    const mockRegions: DocumentRegion[] = [
      {
        type: "text",
        bbox: [50, 50, 500, 100],
        confidence: 0.95,
        content: "Header region",
      },
      {
        type: "table",
        bbox: [50, 150, 500, 400],
        confidence: 0.9,
      },
      {
        type: "signature",
        bbox: [350, 450, 500, 500],
        confidence: 0.85,
      },
      {
        type: "form_field",
        bbox: [100, 200, 300, 220],
        confidence: 0.8,
      },
    ]

    const mockVisualPII: VisualPIIDetection[] = [
      {
        type: "signature",
        bbox: [350, 450, 500, 500],
        confidence: 0.85,
        riskLevel: "HIGH",
      },
      {
        type: "handwritten_text",
        bbox: [200, 480, 320, 520],
        confidence: 0.75,
        riskLevel: "MEDIUM",
      },
    ]

    return {
      regions: mockRegions,
      visualPII: mockVisualPII,
      documentType: "invoice",
      confidence: 0.88,
    }
  } catch (error) {
    console.error("[v0] Computer vision analysis error:", error)
    throw new Error("Failed to analyze document structure")
  }
}

export async function detectVisualPII(imageData: string | ArrayBuffer): Promise<VisualPIIDetection[]> {
  console.log("[v0] Detecting visual PII elements...")

  // This would use actual computer vision models in production
  // For now, return mock detections
  return [
    {
      type: "signature",
      bbox: [350, 450, 500, 500],
      confidence: 0.85,
      riskLevel: "HIGH",
    },
  ]
}
