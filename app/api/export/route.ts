import { type NextRequest, NextResponse } from "next/server"
import { exportRedactedDocument, type ExportOptions } from "@/lib/document-export-system"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { redactedDocument, entities, visualPII, originalFileName, processingMetadata, exportOptions } = body

    if (!redactedDocument || !originalFileName) {
      return NextResponse.json({ error: "Missing required data for export" }, { status: 400 })
    }

    console.log("[v0] Starting document export:", exportOptions.format)

    const exportResult = await exportRedactedDocument(
      redactedDocument,
      entities || [],
      visualPII || [],
      originalFileName,
      processingMetadata || {},
      exportOptions as ExportOptions,
    )

    // Convert ArrayBuffer to base64 for JSON response
    let responseData: string
    if (exportResult.data instanceof ArrayBuffer) {
      responseData = Buffer.from(exportResult.data).toString("base64")
    } else {
      responseData = exportResult.data as string
    }

    return NextResponse.json({
      success: true,
      filename: exportResult.filename,
      mimeType: exportResult.mimeType,
      size: exportResult.size,
      data: responseData,
      metadata: exportResult.metadata,
    })
  } catch (error) {
    console.error("[v0] Export error:", error)
    return NextResponse.json(
      { error: "Failed to export document", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    )
  }
}
