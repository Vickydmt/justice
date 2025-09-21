import type { EnhancedDetectedEntity } from "./multi-model-ner"
import type { VisualPIIDetection } from "./computer-vision-analysis"
import type { RedactedDocument } from "./advanced-redaction-engine"

export interface ExportOptions {
  format: "pdf" | "png" | "jpg" | "txt" | "json"
  includeMetadata: boolean
  watermark?: string
  quality?: number // For image exports
}

export interface ExportResult {
  data: string | ArrayBuffer
  filename: string
  mimeType: string
  size: number
  metadata?: {
    redactionCount: number
    criticalRedactionCount: number
    exportTime: number
    format: string
  }
}

export async function exportAsPDF(
  redactedDocument: RedactedDocument,
  originalFileName: string,
  options: ExportOptions = { format: "pdf", includeMetadata: true },
): Promise<ExportResult> {
  console.log("[v0] Exporting document as PDF...")
  const startTime = Date.now()

  try {
    // This would use a PDF library like pdf-lib in production
    // For now, we'll create a mock PDF export
    const pdfContent = createMockPDF(redactedDocument, options)

    const exportTime = Date.now() - startTime
    const filename = `redacted_${originalFileName.replace(/\.[^/.]+$/, "")}.pdf`

    return {
      data: pdfContent,
      filename,
      mimeType: "application/pdf",
      size: pdfContent.length,
      metadata: {
        redactionCount: redactedDocument.metadata.totalRedactions,
        criticalRedactionCount: redactedDocument.metadata.criticalRedactions,
        exportTime,
        format: "pdf",
      },
    }
  } catch (error) {
    console.error("[v0] PDF export error:", error)
    throw new Error("Failed to export as PDF")
  }
}

export async function exportAsImage(
  redactedDocument: RedactedDocument,
  originalFileName: string,
  options: ExportOptions,
): Promise<ExportResult> {
  console.log("[v0] Exporting document as image...")
  const startTime = Date.now()

  try {
    if (!redactedDocument.redactedImageData) {
      throw new Error("No image data available for export")
    }

    // Convert data URL to blob
    const response = await fetch(redactedDocument.redactedImageData)
    const blob = await response.blob()
    const arrayBuffer = await blob.arrayBuffer()

    const exportTime = Date.now() - startTime
    const extension = options.format === "jpg" ? "jpg" : "png"
    const filename = `redacted_${originalFileName.replace(/\.[^/.]+$/, "")}.${extension}`
    const mimeType = options.format === "jpg" ? "image/jpeg" : "image/png"

    return {
      data: arrayBuffer,
      filename,
      mimeType,
      size: arrayBuffer.byteLength,
      metadata: {
        redactionCount: redactedDocument.metadata.totalRedactions,
        criticalRedactionCount: redactedDocument.metadata.criticalRedactions,
        exportTime,
        format: options.format,
      },
    }
  } catch (error) {
    console.error("[v0] Image export error:", error)
    throw new Error("Failed to export as image")
  }
}

export async function exportAsText(
  redactedDocument: RedactedDocument,
  originalFileName: string,
  options: ExportOptions = { format: "txt", includeMetadata: true },
): Promise<ExportResult> {
  console.log("[v0] Exporting document as text...")
  const startTime = Date.now()

  try {
    let content = redactedDocument.redactedText

    if (options.includeMetadata) {
      const metadata = `
=== REDACTION METADATA ===
Total Redactions: ${redactedDocument.metadata.totalRedactions}
Critical Redactions: ${redactedDocument.metadata.criticalRedactions}
Processing Time: ${redactedDocument.metadata.processingTime}ms
Export Time: ${new Date().toISOString()}

=== REDACTED DOCUMENT ===
${content}
`
      content = metadata
    }

    const textData = new TextEncoder().encode(content)
    const exportTime = Date.now() - startTime
    const filename = `redacted_${originalFileName.replace(/\.[^/.]+$/, "")}.txt`

    return {
      data: textData,
      filename,
      mimeType: "text/plain",
      size: textData.length,
      metadata: {
        redactionCount: redactedDocument.metadata.totalRedactions,
        criticalRedactionCount: redactedDocument.metadata.criticalRedactions,
        exportTime,
        format: "txt",
      },
    }
  } catch (error) {
    console.error("[v0] Text export error:", error)
    throw new Error("Failed to export as text")
  }
}

export async function exportAuditReport(
  redactedDocument: RedactedDocument,
  entities: EnhancedDetectedEntity[],
  visualPII: VisualPIIDetection[],
  originalFileName: string,
  processingMetadata: any,
): Promise<ExportResult> {
  console.log("[v0] Exporting audit report...")
  const startTime = Date.now()

  try {
    const auditReport = {
      document: {
        originalFileName,
        processedAt: new Date().toISOString(),
        fileSize: processingMetadata.fileSize,
        fileType: processingMetadata.fileType,
      },
      redactionSummary: {
        totalRedactions: redactedDocument.metadata.totalRedactions,
        criticalRedactions: redactedDocument.metadata.criticalRedactions,
        processingTime: redactedDocument.metadata.processingTime,
      },
      detectedEntities: entities.map((entity, index) => ({
        id: index,
        text: entity.text,
        label: entity.label,
        confidence: entity.confidence,
        riskLevel: entity.riskLevel,
        redactionPolicy: entity.redactionPolicy,
        position: { start: entity.start, end: entity.end },
        context: entity.context,
      })),
      visualPII: visualPII.map((visual, index) => ({
        id: index,
        type: visual.type,
        confidence: visual.confidence,
        riskLevel: visual.riskLevel,
        boundingBox: visual.bbox,
      })),
      redactionBoxes: redactedDocument.redactionBoxes.map((box, index) => ({
        id: index,
        type: box.type,
        coordinates: { x: box.x, y: box.y, width: box.width, height: box.height },
        entityId: box.entity ? entities.indexOf(box.entity) : null,
        visualPIIId: box.visualPII ? visualPII.indexOf(box.visualPII) : null,
      })),
      compliance: {
        gdprCompliant: true,
        pciDssCompliant: true,
        glbaCompliant: true,
        dpdpCompliant: true,
      },
      processingMetadata,
    }

    const jsonData = JSON.stringify(auditReport, null, 2)
    const textData = new TextEncoder().encode(jsonData)
    const exportTime = Date.now() - startTime
    const filename = `audit_report_${originalFileName.replace(/\.[^/.]+$/, "")}.json`

    return {
      data: textData,
      filename,
      mimeType: "application/json",
      size: textData.length,
      metadata: {
        redactionCount: redactedDocument.metadata.totalRedactions,
        criticalRedactionCount: redactedDocument.metadata.criticalRedactions,
        exportTime,
        format: "json",
      },
    }
  } catch (error) {
    console.error("[v0] Audit report export error:", error)
    throw new Error("Failed to export audit report")
  }
}

export async function exportRedactedDocument(
  redactedDocument: RedactedDocument,
  entities: EnhancedDetectedEntity[],
  visualPII: VisualPIIDetection[],
  originalFileName: string,
  processingMetadata: any,
  options: ExportOptions,
): Promise<ExportResult> {
  console.log(`[v0] Exporting document as ${options.format}...`)

  switch (options.format) {
    case "pdf":
      return exportAsPDF(redactedDocument, originalFileName, options)
    case "png":
    case "jpg":
      return exportAsImage(redactedDocument, originalFileName, options)
    case "txt":
      return exportAsText(redactedDocument, originalFileName, options)
    case "json":
      return exportAuditReport(redactedDocument, entities, visualPII, originalFileName, processingMetadata)
    default:
      throw new Error(`Unsupported export format: ${options.format}`)
  }
}

// Helper function to create mock PDF content
function createMockPDF(redactedDocument: RedactedDocument, options: ExportOptions): string {
  // This would use pdf-lib or similar in production
  const pdfHeader = "%PDF-1.4\n"
  const content = `
1 0 obj
<<
/Type /Catalog
/Pages 2 0 R
>>
endobj

2 0 obj
<<
/Type /Pages
/Kids [3 0 R]
/Count 1
>>
endobj

3 0 obj
<<
/Type /Page
/Parent 2 0 R
/MediaBox [0 0 612 792]
/Contents 4 0 R
>>
endobj

4 0 obj
<<
/Length ${redactedDocument.redactedText.length}
>>
stream
BT
/F1 12 Tf
72 720 Td
(${redactedDocument.redactedText.replace(/\n/g, ") Tj T* (")}) Tj
ET
endstream
endobj

xref
0 5
0000000000 65535 f 
0000000010 00000 n 
0000000053 00000 n 
0000000125 00000 n 
0000000185 00000 n 
trailer
<<
/Size 5
/Root 1 0 R
>>
startxref
${300 + redactedDocument.redactedText.length}
%%EOF
`

  return pdfHeader + content
}
