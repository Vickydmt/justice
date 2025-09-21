"use client"

import type React from "react"

import { useState, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Slider } from "@/components/ui/slider"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Upload, FileText, Download, Loader2, AlertCircle, Eye, Shield, Brain, Zap } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { ENHANCED_PII_LABELS, type EnhancedDetectedEntity } from "@/lib/multi-model-ner"
import type { DocumentAnalysisResult, VisualPIIDetection } from "@/lib/computer-vision-analysis"
import type { RedactedDocument } from "@/lib/advanced-redaction-engine"
import { apiClient } from "@/lib/api-client"

interface EnhancedProcessingResult {
  originalText: string
  entities: EnhancedDetectedEntity[]
  redactedText: string
  documentAnalysis: DocumentAnalysisResult
  visualPII: VisualPIIDetection[]
  redactedDocument: RedactedDocument
  modelStats: {
    patternMatches: number
    transformerMatches: number
    totalEntities: number
    criticalEntities: number
  }
  processingTime: {
    ocr: number
    computerVision: number
    ner: number
    redaction: number
    total: number
  }
  metadata: {
    fileName: string
    fileSize: number
    fileType: string
    language: string
    enhanceImage: boolean
    confidenceThreshold: number
    entitiesFound: number
    criticalEntitiesFound: number
    documentType: string
    visualPIIFound: number
    ocrBoundingBoxes: number
  }
}

export default function RedactDocumentPage() {
  const [file, setFile] = useState<File | null>(null)
  const [language, setLanguage] = useState("en")
  const [enhanceImage, setEnhanceImage] = useState(true)
  const [confidenceThreshold, setConfidenceThreshold] = useState([0.7])
  const [isProcessing, setIsProcessing] = useState(false)
  const [result, setResult] = useState<EnhancedProcessingResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedEntities, setSelectedEntities] = useState<Set<number>>(new Set())
  const [isExporting, setIsExporting] = useState(false)
  const [exportFormat, setExportFormat] = useState<"pdf" | "png" | "txt" | "json">("pdf")

  const handleFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0]
    if (selectedFile) {
      setFile(selectedFile)
      setResult(null)
      setError(null)
    }
  }, [])

  const handleDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    const droppedFile = event.dataTransfer.files[0]
    if (droppedFile) {
      setFile(droppedFile)
      setResult(null)
      setError(null)
    }
  }, [])

  const handleDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
  }, [])

  const processDocument = async () => {
    if (!file) return

    setIsProcessing(true)
    setError(null)

    try {
      const formData = new FormData()
      formData.append("file", file)
      formData.append("language", language)
      formData.append("enhanceImage", enhanceImage.toString())
      formData.append("confidenceThreshold", confidenceThreshold[0].toString())
      formData.append("selectedEntities", JSON.stringify(Array.from(selectedEntities)))

      const data = await apiClient.processDocument(formData)

      setResult(data)
      const criticalEntityIndices = new Set<number>()
      data.entities.forEach((entity: EnhancedDetectedEntity, index: number) => {
        if (entity.riskLevel === "CRITICAL" || entity.riskLevel === "HIGH") {
          criticalEntityIndices.add(index)
        }
      })
      setSelectedEntities(criticalEntityIndices)
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred")
    } finally {
      setIsProcessing(false)
    }
  }

  const toggleEntity = (index: number) => {
    const newSelected = new Set(selectedEntities)
    if (newSelected.has(index)) {
      newSelected.delete(index)
    } else {
      newSelected.add(index)
    }
    setSelectedEntities(newSelected)
  }

  const generateFinalRedactedText = () => {
    if (!result) return ""

    let redactedText = result.originalText
    let offset = 0

    const sortedEntitiesWithOriginalIndex = result.entities
      .map((entity, originalIndex) => ({ ...entity, originalIndex }))
      .sort((a, b) => a.start - b.start)

    sortedEntitiesWithOriginalIndex.forEach((entity) => {
      if (selectedEntities.has(entity.originalIndex)) {
        const redactedValue =
          entity.redactionPolicy === "FULL"
            ? "█".repeat(entity.text.length)
            : entity.redactionPolicy === "PARTIAL"
              ? entity.text.charAt(0) + "█".repeat(entity.text.length - 2) + entity.text.charAt(entity.text.length - 1)
              : entity.redactionPolicy === "HASH"
                ? `[REDACTED-${entity.text.length}]`
                : entity.text.replace(/./g, "*")

        const adjustedStart = entity.start + offset
        const adjustedEnd = entity.end + offset

        redactedText = redactedText.slice(0, adjustedStart) + redactedValue + redactedText.slice(adjustedEnd)

        offset += redactedValue.length - entity.text.length
      }
    })

    return redactedText
  }

  const exportDocument = async () => {
    if (!result || !file) return

    setIsExporting(true)
    try {
      const exportData = {
        redactedDocument: result.redactedDocument,
        entities: result.entities,
        visualPII: result.visualPII,
        originalFileName: file.name,
        processingMetadata: result.metadata,
        exportOptions: {
          format: exportFormat,
          includeMetadata: true,
          quality: 0.9,
        },
      }

      const exportResult = await apiClient.exportDocument(exportData)

      // Download the exported file
      const blob = new Blob([Buffer.from(exportResult.data, "base64")], {
        type: exportResult.mimeType,
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = exportResult.filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed")
    } finally {
      setIsExporting(false)
    }
  }

  const selectEntitiesByRisk = (riskLevel: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW") => {
    if (!result) return
    const riskEntityIndices = new Set<number>()
    result.entities.forEach((entity, index) => {
      if (entity.riskLevel === riskLevel || (riskLevel === "HIGH" && entity.riskLevel === "CRITICAL")) {
        riskEntityIndices.add(index)
      }
    })
    setSelectedEntities(riskEntityIndices)
  }

  const getEnhancedHighlightedText = () => {
    if (!result) return ""

    let highlightedText = result.originalText
    let offset = 0

    const sortedEntitiesWithOriginalIndex = result.entities
      .map((entity, originalIndex) => ({ ...entity, originalIndex }))
      .sort((a, b) => a.start - b.start)

    sortedEntitiesWithOriginalIndex.forEach((entity) => {
      const isSelected = selectedEntities.has(entity.originalIndex)

      let highlightClass = ""
      let icon = ""
      if (isSelected) {
        switch (entity.riskLevel) {
          case "CRITICAL":
            highlightClass = "bg-red-200 border border-red-500 text-red-900"
            icon = "🚨"
            break
          case "HIGH":
            highlightClass = "bg-orange-200 border border-orange-500 text-orange-900"
            icon = "⚠️"
            break
          case "MEDIUM":
            highlightClass = "bg-yellow-200 border border-yellow-500 text-yellow-900"
            icon = "⚡"
            break
          default:
            highlightClass = "bg-blue-200 border border-blue-500 text-blue-900"
            icon = "ℹ️"
        }
      } else {
        highlightClass = "bg-gray-200 border border-gray-400 text-gray-600"
        icon = "👁️"
      }

      const tooltip = `${icon} ${ENHANCED_PII_LABELS[entity.label]} (${(entity.confidence * 100).toFixed(1)}%) - ${entity.riskLevel} Risk - Policy: ${entity.redactionPolicy}`
      const highlightStart = `<span class="${highlightClass} px-1 rounded cursor-pointer hover:shadow-md transition-shadow" title="${tooltip}">`
      const highlightEnd = "</span>"

      const adjustedStart = entity.start + offset
      const adjustedEnd = entity.end + offset

      highlightedText =
        highlightedText.slice(0, adjustedStart) +
        highlightStart +
        highlightedText.slice(adjustedStart, adjustedEnd) +
        highlightEnd +
        highlightedText.slice(adjustedEnd)

      offset += highlightStart.length + highlightEnd.length
    })

    return highlightedText
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-background">
        <div className="mx-auto max-w-6xl px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="size-6 rounded-sm bg-teal-600" aria-hidden />
            <span className="font-semibold">FinSecure-Redact</span>
          </div>
          <h1 className="text-lg font-medium">Advanced Document Redaction</h1>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 space-y-8">
        {/* Upload Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="size-5" />
              Upload Document
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* File Upload */}
            <div
              className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onClick={() => document.getElementById("file-input")?.click()}
            >
              <input id="file-input" type="file" accept="image/*,.pdf" onChange={handleFileChange} className="hidden" />
              {file ? (
                <div className="space-y-2">
                  <FileText className="size-8 mx-auto text-primary" />
                  <p className="font-medium">{file.name}</p>
                  <p className="text-sm text-muted-foreground">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <Upload className="size-8 mx-auto text-muted-foreground" />
                  <p className="text-muted-foreground">Drop your document here or click to browse</p>
                  <p className="text-xs text-muted-foreground">Supports PDF, JPEG, PNG, TIFF</p>
                </div>
              )}
            </div>

            {/* Processing Options */}
            <div className="grid md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="language">Language</Label>
                <Select value={language} onValueChange={setLanguage}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="hi">Hindi</SelectItem>
                    <SelectItem value="bn">Bengali</SelectItem>
                    <SelectItem value="ta">Tamil</SelectItem>
                    <SelectItem value="te">Telugu</SelectItem>
                    <SelectItem value="mr">Marathi</SelectItem>
                    <SelectItem value="gu">Gujarati</SelectItem>
                    <SelectItem value="kn">Kannada</SelectItem>
                    <SelectItem value="ml">Malayalam</SelectItem>
                    <SelectItem value="pa">Punjabi</SelectItem>
                    <SelectItem value="ur">Urdu</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Confidence Threshold: {confidenceThreshold[0]}</Label>
                <Slider
                  value={confidenceThreshold}
                  onValueChange={setConfidenceThreshold}
                  min={0.1}
                  max={1.0}
                  step={0.1}
                  className="w-full"
                />
              </div>

              <div className="flex items-center space-x-2 pt-6">
                <Checkbox id="enhance" checked={enhanceImage} onCheckedChange={setEnhanceImage} />
                <Label htmlFor="enhance">Enhance image quality</Label>
              </div>
            </div>

            <Button
              onClick={processDocument}
              disabled={!file || isProcessing}
              className="w-full bg-teal-600 hover:bg-teal-700"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="size-4 mr-2 animate-spin" />
                  Processing with AI Models...
                </>
              ) : (
                <>
                  <Brain className="size-4 mr-2" />
                  Process with Enhanced AI
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Error Display */}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="size-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Results Section */}
        {result && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="size-5" />
                  AI Processing Results
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                  <div className="space-y-1">
                    <p className="text-muted-foreground">Total Entities</p>
                    <p className="font-medium text-lg">{result.modelStats.totalEntities}</p>
                    <p className="text-xs text-muted-foreground">{result.modelStats.criticalEntities} critical</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-muted-foreground">Document Type</p>
                    <p className="font-medium text-lg capitalize">{result.metadata.documentType}</p>
                    <p className="text-xs text-muted-foreground">{result.metadata.visualPIIFound} visual elements</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-muted-foreground">Processing Time</p>
                    <p className="font-medium text-lg">{result.processingTime.total}ms</p>
                    <p className="text-xs text-muted-foreground">
                      OCR: {result.processingTime.ocr}ms • NER: {result.processingTime.ner}ms
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-muted-foreground">Model Performance</p>
                    <p className="font-medium text-lg">
                      {result.modelStats.patternMatches + result.modelStats.transformerMatches}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Pattern: {result.modelStats.patternMatches} • AI: {result.modelStats.transformerMatches}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Shield className="size-5" />
                    <span>Detected PII Entities</span>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => selectEntitiesByRisk("CRITICAL")}
                      className="text-xs bg-red-50 hover:bg-red-100"
                    >
                      🚨 Critical Only
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => selectEntitiesByRisk("HIGH")}
                      className="text-xs bg-orange-50 hover:bg-orange-100"
                    >
                      ⚠️ High Risk+
                    </Button>
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => selectEntitiesByRisk("HIGH")}
                      className="text-xs bg-green-600 hover:bg-green-700 text-white"
                    >
                      🤖 Auto-select High-risk
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedEntities(new Set(result.entities.map((_, i) => i)))}
                      className="text-xs"
                    >
                      Select All
                    </Button>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {result.entities.map((entity, index) => (
                    <div key={index} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                      <div className="flex items-center space-x-3">
                        <Checkbox checked={selectedEntities.has(index)} onCheckedChange={() => toggleEntity(index)} />
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge
                              variant={
                                entity.riskLevel === "CRITICAL"
                                  ? "destructive"
                                  : entity.riskLevel === "HIGH"
                                    ? "default"
                                    : "secondary"
                              }
                              className="flex items-center gap-1"
                            >
                              {entity.riskLevel === "CRITICAL" && "🚨"}
                              {entity.riskLevel === "HIGH" && "⚠️"}
                              {entity.riskLevel === "MEDIUM" && "⚡"}
                              {entity.riskLevel === "LOW" && "ℹ️"}
                              {ENHANCED_PII_LABELS[entity.label]}
                            </Badge>
                            <span className="font-mono text-sm font-medium">{entity.text}</span>
                            <Badge variant="outline" className="text-xs">
                              {entity.riskLevel}
                            </Badge>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                            <div>
                              <span className="font-medium">Confidence:</span> {(entity.confidence * 100).toFixed(1)}%
                            </div>
                            <div>
                              <span className="font-medium">Policy:</span> {entity.redactionPolicy}
                            </div>
                            <div className="col-span-2">
                              <span className="font-medium">Context:</span> {entity.context?.slice(0, 80)}...
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Eye className="size-5" />
                    <span>Document Preview & Export</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Select value={exportFormat} onValueChange={(value: any) => setExportFormat(value)}>
                      <SelectTrigger className="w-24">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pdf">PDF</SelectItem>
                        <SelectItem value="png">PNG</SelectItem>
                        <SelectItem value="txt">TXT</SelectItem>
                        <SelectItem value="json">JSON</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      onClick={exportDocument}
                      disabled={isExporting}
                      size="sm"
                      className="bg-teal-600 hover:bg-teal-700"
                    >
                      {isExporting ? (
                        <>
                          <Loader2 className="size-4 mr-2 animate-spin" />
                          Exporting...
                        </>
                      ) : (
                        <>
                          <Download className="size-4 mr-2" />
                          Export {exportFormat.toUpperCase()}
                        </>
                      )}
                    </Button>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="highlighted" className="w-full">
                  <TabsList className="grid w-full grid-cols-4">
                    <TabsTrigger value="highlighted">Risk Highlighted</TabsTrigger>
                    <TabsTrigger value="original">Original Text</TabsTrigger>
                    <TabsTrigger value="redacted">Redacted Output</TabsTrigger>
                    <TabsTrigger value="image">Visual Redaction</TabsTrigger>
                  </TabsList>

                  <TabsContent value="highlighted" className="mt-4">
                    <div
                      className="min-h-[300px] p-3 border rounded-md bg-background font-mono text-sm whitespace-pre-wrap overflow-auto max-h-[500px]"
                      dangerouslySetInnerHTML={{ __html: getEnhancedHighlightedText() }}
                    />
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <span className="inline-block w-3 h-3 bg-red-200 border border-red-500 rounded"></span>
                        🚨 Critical Risk
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="inline-block w-3 h-3 bg-orange-200 border border-orange-500 rounded"></span>
                        ⚠️ High Risk
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="inline-block w-3 h-3 bg-yellow-200 border border-yellow-500 rounded"></span>
                        ⚡ Medium Risk
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="inline-block w-3 h-3 bg-blue-200 border border-blue-500 rounded"></span>
                        ℹ️ Low Risk
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="inline-block w-3 h-3 bg-gray-200 border border-gray-400 rounded"></span>
                        👁️ Not Selected
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="original" className="mt-4">
                    <Textarea value={result.originalText} readOnly className="min-h-[300px] font-mono text-sm" />
                  </TabsContent>

                  <TabsContent value="redacted" className="mt-4">
                    <Textarea
                      value={generateFinalRedactedText()}
                      readOnly
                      className="min-h-[300px] font-mono text-sm"
                    />
                  </TabsContent>

                  <TabsContent value="image" className="mt-4">
                    {result.redactedDocument.redactedImageData ? (
                      <div className="space-y-4">
                        <img
                          src={result.redactedDocument.redactedImageData || "/placeholder.svg"}
                          alt="Redacted document"
                          className="max-w-full h-auto border rounded-lg"
                        />
                        <p className="text-sm text-muted-foreground">
                          Visual redactions applied: {result.redactedDocument.redactionBoxes.length} areas blocked
                        </p>
                        <p className="text-xs text-muted-foreground">
                          OCR bounding boxes: {result.metadata.ocrBoundingBoxes || 0} detected
                        </p>
                      </div>
                    ) : (
                      <div className="min-h-[300px] flex items-center justify-center text-muted-foreground">
                        Processing image redaction... Please ensure entities are selected and try again.
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  )
}
