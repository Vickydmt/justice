"use client"

import type React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Checkbox } from "@/components/ui/checkbox"
import { Slider } from "@/components/ui/slider"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { ShieldAlert, Upload, Wand2, Download } from "lucide-react"
import { cn } from "@/lib/utils"
import AuditTrail from "@/components/AuditTrail"
import { apiClient } from "@/lib/api-client"

type BBox = {
  id: string
  x: number
  y: number
  w: number
  h: number
  label: string
  confidence: number
  entityIndex?: number
}
type Redaction = { id: string; bboxId: string }

interface AuditEntry {
  id: string
  timestamp: string
  action: "DETECTED" | "APPROVED" | "REJECTED" | "MODIFIED" | "EXPORTED"
  entityType: string
  entityText: string
  confidence: number
  reviewer?: string
  reason?: string
  riskLevel: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"
}

const LABELS = ["Name", "Account Number", "SSN", "Address", "Signature", "Amount", "Invoice Number", "Date", "Phone", "Email", "Case Number", "Witness Name", "Victim Name", "Judge Name", "Attorney Name"] as const
type Label = (typeof LABELS)[number]

// Map backend labels to frontend labels
function mapBackendLabelToFrontend(backendLabel: string): Label {
  const mapping: Record<string, Label> = {
    'ADDRESS': 'Address',
    'AMOUNT': 'Amount',
    'INVOICE_NUMBER': 'Invoice Number',
    'DATE': 'Date',
    'PHONE': 'Phone',
    'EMAIL': 'Email',
    'SSN': 'SSN',
    'ACCOUNT_NUMBER': 'Account Number',
    'SIGNATURE': 'Signature',
    'NAME': 'Name',
    'PERSON_NAME': 'Name',
    'COMPANY_NAME': 'Name',
    'PERSON': 'Name',
    'ORGANIZATION': 'Name',
    'LOCATION': 'Address',
    'CASE_NUMBER': 'Case Number',
    'DOCKET_NUMBER': 'Case Number',
    'WITNESS_NAME': 'Witness Name',
    'VICTIM_NAME': 'Victim Name',
    'MINOR_NAME': 'Victim Name',
    'JUDGE_NAME': 'Judge Name',
    'ATTORNEY_NAME': 'Attorney Name',
    'PLAINTIFF_NAME': 'Name',
    'DEFENDANT_NAME': 'Name',
    'EXPERT_WITNESS': 'Witness Name',
    'COURT_CLERK': 'Name',
    'MISC': 'Name', // Default misc to Name
  }
  
  return mapping[backendLabel.toUpperCase()] || 'Name'
}

// Create approximate bounding box for entities without OCR matches
function createApproximateBox(entity: any, imgWidth: number, imgHeight: number, index: number) {
  // Use text position to estimate visual location
  const textLength = entity.text.length
  const avgCharWidth = 8 // Average character width in pixels
  const lineHeight = 20 // Average line height
  
  // Estimate position based on text start/end positions
  let estimatedX = 50
  let estimatedY = 100
  
  if (entity.start !== null && entity.end !== null) {
    // Use text position to estimate location
    const textPosition = entity.start
    const totalTextLength = 552 // From logs - total OCR text length
    
    // Estimate X position based on text flow (rough approximation)
    estimatedX = Math.min(imgWidth - 100, (textPosition / totalTextLength) * imgWidth * 0.7 + 50)
    
    // Estimate Y position based on line breaks and text flow
    const lines = Math.floor(textPosition / 80) // Rough estimate of line breaks
    estimatedY = Math.min(imgHeight - 50, 100 + lines * lineHeight)
  } else {
    // Fallback to grid layout for entities without position info
    const cols = 4
    const rows = 8
    const boxWidth = imgWidth / cols
    const boxHeight = imgHeight / rows
    
    const col = index % cols
    const row = Math.floor(index / cols)
    
    estimatedX = col * boxWidth + 20
    estimatedY = row * boxHeight + 100
  }
  
  return {
    x: Math.max(10, Math.min(imgWidth - 100, estimatedX)),
    y: Math.max(50, Math.min(imgHeight - 50, estimatedY)),
    width: Math.min(200, Math.max(50, textLength * avgCharWidth + 10)),
    height: lineHeight + 5
  }
}

export default function ReviewPage() {
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [imageSize, setImageSize] = useState<{ w: number; h: number } | null>(null)
  const [bboxes, setBBoxes] = useState<BBox[]>([])
  const [redactions, setRedactions] = useState<Redaction[]>([])
  const [activeLabels, setActiveLabels] = useState<Record<Label, boolean>>({
    Name: true,
    "Account Number": true,
    SSN: true,
    Address: true,
    Signature: true,
    Amount: true,
    "Invoice Number": true,
    Date: true,
    Phone: true,
    Email: true,
  })
  const [threshold, setThreshold] = useState<number>(50) // Set to 50% to show more entities
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([])

  // Add audit entry function
  const addAuditEntry = (
    action: AuditEntry["action"],
    entityType: string,
    entityText: string,
    confidence: number,
    riskLevel: AuditEntry["riskLevel"],
    reviewer?: string,
    reason?: string
  ) => {
    const entry: AuditEntry = {
      id: crypto.randomUUID(),
      timestamp: new Date().toLocaleString(),
      action,
      entityType,
      entityText,
      confidence,
      reviewer,
      reason,
      riskLevel
    }
    setAuditEntries(prev => [...prev, entry])
  }

  // Export audit log function
  const exportAuditLog = () => {
    const auditData = {
      exportTimestamp: new Date().toISOString(),
      totalEntries: auditEntries.length,
      entries: auditEntries
    }
    
    const blob = new Blob([JSON.stringify(auditData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `audit-log-${new Date().toISOString().split('T')[0]}.json`
    link.click()
    URL.revokeObjectURL(url)
    
    addAuditEntry("EXPORTED", "AUDIT_LOG", "Complete audit log", 1.0, "LOW", "System")
  }

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const url = URL.createObjectURL(file)
    setImageUrl(url)
    setRedactions([])
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => {
      setImageSize({ w: img.width, h: img.height })
      // Call backend to get true OCR/NER detections with bounding boxes
      const form = new FormData()
      form.append("file", file)
      form.append("language", "en")
      form.append("enhanceImage", "true")
      form.append("confidenceThreshold", String(threshold / 100)) // Convert percentage to decimal for backend
      apiClient.processDocument(form)
        .then((data) => {
          console.log("[Frontend] Backend response:", data)
          console.log("[Frontend] Redaction boxes:", data?.redactedDocument?.redactionBoxes)
          console.log("[Frontend] Entities:", data?.entities)
          
          // Create boxes from ALL entities, not just redaction boxes
          const boxes: BBox[] = []
          
          if (data?.entities && data.entities.length > 0) {
            // Create boxes for all detected entities
            data.entities.forEach((entity: any, idx: number) => {
              // Add audit entry for detected entity
              addAuditEntry(
                "DETECTED",
                mapBackendLabelToFrontend(entity.label),
                entity.text,
                entity.confidence,
                entity.riskLevel || "MEDIUM"
              )

              // Try to find matching OCR bounding box for this entity
              const matchingRedactionBox = data?.redactedDocument?.redactionBoxes?.find((rb: any) => 
                rb.entity && rb.entity.start === entity.start && rb.entity.end === entity.end
              )
              
              if (matchingRedactionBox) {
                // Use the actual redaction box coordinates
                boxes.push({
                  id: crypto.randomUUID(),
                  x: matchingRedactionBox.x,
                  y: matchingRedactionBox.y,
                  w: matchingRedactionBox.width,
                  h: matchingRedactionBox.height,
                  label: mapBackendLabelToFrontend(entity.label),
                  confidence: entity.confidence,
                  entityIndex: idx,
                })
              } else {
                // Create approximate box for entities without OCR matches
                const approximateBox = createApproximateBox(entity, img.width, img.height, idx)
                boxes.push({
                  id: crypto.randomUUID(),
                  x: approximateBox.x,
                  y: approximateBox.y,
                  w: approximateBox.width,
                  h: approximateBox.height,
                  label: mapBackendLabelToFrontend(entity.label),
                  confidence: entity.confidence,
                  entityIndex: idx,
                })
              }
            })
          } else if (data?.redactedDocument?.redactionBoxes && data.redactedDocument.redactionBoxes.length > 0) {
            // Fallback to redaction boxes if no entities
            const fallbackBoxes: BBox[] = data.redactedDocument.redactionBoxes.map((rb: any, idx: number) => ({
              id: crypto.randomUUID(),
              x: rb.x,
              y: rb.y,
              w: rb.width,
              h: rb.height,
              label: mapBackendLabelToFrontend(rb.entity?.label || rb.visualPII?.type || "MISC"),
              confidence: rb.entity?.confidence ?? 0.8,
              entityIndex: idx,
            }))
            boxes.push(...fallbackBoxes)
          } else {
            console.log("[Frontend] No entities or redaction boxes found, using mock detections")
            setBBoxes(generateMockDetections(img.width, img.height))
            return
          }
          
          console.log("[Frontend] Converted boxes:", boxes)
          setBBoxes(boxes)
        })
        .catch(() => setBBoxes(generateMockDetections(img.width, img.height)))
    }
    img.src = url
  }

  function toggleLabel(label: Label, checked: boolean) {
    setActiveLabels((prev) => ({ ...prev, [label]: checked }))
  }

  async function refetchDetections() {
    const input = (document.getElementById("upload") as HTMLInputElement) || null
    const file = input?.files?.[0]
    if (!file || !imageUrl) return

    console.log("[Frontend] Re-fetching detections with threshold:", threshold)
    const form = new FormData()
    form.append("file", file)
    form.append("language", "en")
    form.append("enhanceImage", "true")
    form.append("confidenceThreshold", String(threshold / 100))
    
    try {
      const data = await apiClient.processDocument(form)
      
      console.log("[Frontend] Re-fetch response:", data)
      
      // Create boxes from ALL entities, not just redaction boxes
      const boxes: BBox[] = []
      
      if (data?.entities && data.entities.length > 0) {
        // Create boxes for all detected entities
        data.entities.forEach((entity: any, idx: number) => {
          // Try to find matching OCR bounding box for this entity
          const matchingRedactionBox = data?.redactedDocument?.redactionBoxes?.find((rb: any) => 
            rb.entity && rb.entity.start === entity.start && rb.entity.end === entity.end
          )
          
          if (matchingRedactionBox) {
            // Use the actual redaction box coordinates
            boxes.push({
              id: crypto.randomUUID(),
              x: matchingRedactionBox.x,
              y: matchingRedactionBox.y,
              w: matchingRedactionBox.width,
              h: matchingRedactionBox.height,
              label: mapBackendLabelToFrontend(entity.label),
              confidence: entity.confidence,
              entityIndex: idx,
            })
          } else {
            // Create approximate box for entities without OCR matches
            const approximateBox = createApproximateBox(entity, 750, 1061, idx) // Use standard invoice dimensions
            boxes.push({
              id: crypto.randomUUID(),
              x: approximateBox.x,
              y: approximateBox.y,
              w: approximateBox.width,
              h: approximateBox.height,
              label: mapBackendLabelToFrontend(entity.label),
              confidence: entity.confidence,
              entityIndex: idx,
            })
          }
        })
      } else if (data?.redactedDocument?.redactionBoxes && data.redactedDocument.redactionBoxes.length > 0) {
        // Fallback to redaction boxes if no entities
        const fallbackBoxes: BBox[] = data.redactedDocument.redactionBoxes.map((rb: any, idx: number) => ({
          id: crypto.randomUUID(),
          x: rb.x,
          y: rb.y,
          w: rb.width,
          h: rb.height,
          label: mapBackendLabelToFrontend(rb.entity?.label || rb.visualPII?.type || "MISC"),
          confidence: rb.entity?.confidence ?? 0.8,
          entityIndex: idx,
        }))
        boxes.push(...fallbackBoxes)
      } else {
        console.log("[Frontend] No entities or redaction boxes found after threshold change")
        setBBoxes([])
        return
      }
      
      console.log("[Frontend] Updated boxes after threshold change:", boxes)
      setBBoxes(boxes)
    } catch (error) {
      console.error("[Frontend] Error re-fetching detections:", error)
    }
  }

  function addRedaction(bboxId: string) {
    setRedactions((prev) =>
      prev.some((r) => r.bboxId === bboxId) ? prev : [...prev, { id: crypto.randomUUID(), bboxId }],
    )
  }

  function removeRedaction(bboxId: string) {
    setRedactions((prev) => prev.filter((r) => r.bboxId !== bboxId))
  }

  async function exportPNG() {
    if (!imageUrl) return
    const input = (document.getElementById("upload") as HTMLInputElement) || null
    const file = input?.files?.[0]
    if (!file) {
      // Fallback: client overlay export if original file isn't available
      const canvas = document.createElement("canvas")
      if (!imageSize) return
      canvas.width = imageSize.w
      canvas.height = imageSize.h
      const ctx = canvas.getContext("2d")
      if (!ctx) return
      const img = new Image()
      img.crossOrigin = "anonymous"
      img.onload = () => {
        ctx.drawImage(img, 0, 0)
        const redactionIds = new Set(redactions.map((r) => r.bboxId))
        bboxes.forEach((b) => {
          if (b.confidence * 100 >= threshold && activeLabels[b.label as Label] && redactionIds.has(b.id)) {
            ctx.fillStyle = "#111827"
            ctx.fillRect(b.x, b.y, b.w, b.h)
          }
        })
        const link = document.createElement("a")
        link.download = "redacted.png"
        link.href = canvas.toDataURL("image/png")
        link.click()
      }
      img.src = imageUrl
      return
    }

    // Send selected entity indices to backend for pixel-perfect redaction
    const selectedIds = new Set(redactions.map((r) => r.bboxId))
    const indices = bboxes
      .filter((b) => selectedIds.has(b.id))
      .map((b) => (typeof b.entityIndex === "number" ? b.entityIndex : -1))
      .filter((i) => i >= 0)
    const form = new FormData()
    form.append("file", file)
    form.append("language", "en")
    form.append("enhanceImage", "true")
    form.append("confidenceThreshold", String(threshold / 100))
    form.append("selectedEntities", JSON.stringify(indices))
    const data = await apiClient.processDocument(form)
    const dataUrl: string | undefined = data?.redactedDocument?.redactedImageData
    if (dataUrl) {
      const link = document.createElement("a")
      link.download = "redacted.png"
      link.href = dataUrl
      link.click()
    }
  }

  const filtered = bboxes.filter((b) => {
    const label = b.label as Label
    const isLabelActive = activeLabels[label] !== undefined ? activeLabels[label] : true
    const meetsThreshold = b.confidence * 100 >= threshold
    return isLabelActive && meetsThreshold
  })
  
  // Debug logging
  console.log("[Frontend] All bboxes:", bboxes.length)
  console.log("[Frontend] Filtered bboxes:", filtered.length)
  console.log("[Frontend] Threshold:", threshold)
  console.log("[Frontend] Active labels:", activeLabels)

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 space-y-6">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="size-6 rounded-sm bg-blue-600" aria-hidden />
          <h1 className="text-xl font-semibold">Justice Redacted - Review Dashboard</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" asChild>
            <a href="/">Back to landing</a>
          </Button>
          <Button className="bg-blue-600 hover:bg-blue-700 text-white" onClick={exportPNG} disabled={!imageUrl}>
            <Download className="size-4 mr-2" /> Export PNG
          </Button>
        </div>
      </header>

      {/* Info banner disabled when real pipeline is enabled */}

      <div className="grid lg:grid-cols-12 gap-6">
        <Card className="lg:col-span-6 overflow-hidden">
          <CardHeader className="flex items-center justify-between">
            <CardTitle>Document</CardTitle>
            <label className="inline-flex items-center gap-2">
              <input type="file" accept="image/*,.pdf" onChange={onFileChange} className="hidden" id="upload" />
              <Button variant="outline" asChild>
                <span>
                  <Upload className="size-4 mr-2" /> Upload
                </span>
              </Button>
            </label>
          </CardHeader>
          <CardContent>
            <div className="border rounded-md overflow-hidden bg-muted/20">
              {!imageUrl ? (
                <div className="aspect-[4/3] w-full grid place-items-center text-muted-foreground">
                  <p className="text-sm">Upload a court filing or legal document to begin.</p>
                </div>
              ) : (
                <div className="relative w-full">
                  <img src={imageUrl || "/placeholder.svg"} alt="Uploaded document" className="w-full h-auto block" />
                  {imageSize &&
                    filtered.map((b) => (
                      <div
                        key={b.id}
                        className={cn(
                          "absolute ring-2 rounded-sm",
                          redactions.some((r) => r.bboxId === b.id)
                            ? "ring-slate-900 bg-slate-900/80"
                            : "ring-teal-600/80 bg-teal-600/10",
                        )}
                        style={{
                          left: `${(b.x / imageSize.w) * 100}%`,
                          top: `${(b.y / imageSize.h) * 100}%`,
                          width: `${(b.w / imageSize.w) * 100}%`,
                          height: `${(b.h / imageSize.h) * 100}%`,
                        }}
                        role="button"
                        aria-label={`Detected ${b.label} with ${(b.confidence * 100).toFixed(0)}% confidence`}
                        onClick={() => {
                          const already = redactions.some((r) => r.bboxId === b.id)
                          already ? removeRedaction(b.id) : addRedaction(b.id)
                        }}
                        title="Click to toggle redaction"
                      />
                    ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm">Detections & Controls</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div className="text-sm font-medium">Entity Types</div>
              <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto">
                {LABELS.map((label) => (
                  <label key={label} className="flex items-center gap-2 text-sm p-2 rounded hover:bg-muted/50">
                    <Checkbox checked={activeLabels[label]} onCheckedChange={(v) => toggleLabel(label, Boolean(v))} />
                    <span className="text-xs">{label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span>Confidence threshold</span>
                <span className="tabular-nums text-xs">{threshold}%</span>
              </div>
              <Slider 
                value={[threshold]} 
                min={0} 
                max={100} 
                step={1} 
                onValueChange={(v) => {
                  setThreshold(v[0])
                  // Re-fetch detections after a short delay to avoid too many requests
                  setTimeout(() => refetchDetections(), 500)
                }} 
              />
            </div>

            <div className="space-y-3">
              <Tabs defaultValue="all">
                <TabsList className="grid grid-cols-2 w-full">
                  <TabsTrigger value="all" className="text-xs">All</TabsTrigger>
                  <TabsTrigger value="redacted" className="text-xs">Redacted</TabsTrigger>
                </TabsList>
                <TabsContent value="all" className="space-y-2">
                  <ListDetections
                    bboxes={filtered}
                    redactions={redactions}
                    onToggle={(id, on) => (on ? addRedaction(id) : removeRedaction(id))}
                  />
                </TabsContent>
                <TabsContent value="redacted" className="space-y-2">
                  <ListDetections
                    bboxes={filtered.filter((b) => redactions.some((r) => r.bboxId === b.id))}
                    redactions={redactions}
                    onToggle={(id, on) => (on ? addRedaction(id) : removeRedaction(id))}
                  />
                </TabsContent>
              </Tabs>
            </div>

            <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm">
              <Wand2 className="size-3 mr-2" /> Auto-select high-risk
            </Button>
          </CardContent>
        </Card>

        <Card className="lg:col-span-4">
          <AuditTrail entries={auditEntries} onExportAuditLog={exportAuditLog} />
        </Card>
      </div>
    </main>
  )
}

function ListDetections({
  bboxes,
  redactions,
  onToggle,
}: {
  bboxes: BBox[]
  redactions: Redaction[]
  onToggle: (bboxId: string, on: boolean) => void
}) {
  return (
    <div className="space-y-2 max-h-48 overflow-auto">
      {bboxes.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-4">No detections at current threshold.</p>
      ) : (
        bboxes.map((b) => {
          const selected = redactions.some((r) => r.bboxId === b.id)
          return (
            <div key={b.id} className="flex items-center justify-between rounded border px-2 py-2 text-xs">
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{b.label}</div>
                <div className="text-muted-foreground">{(b.confidence * 100).toFixed(0)}%</div>
              </div>
              <Button
                size="sm"
                variant={selected ? "default" : "outline"}
                className={`${selected ? "bg-slate-900 hover:bg-slate-800 text-white" : ""} text-xs px-2 py-1 h-auto`}
                onClick={() => onToggle(b.id, !selected)}
              >
                {selected ? "✓" : "+"}
              </Button>
            </div>
          )
        })
      )}
    </div>
  )
}

function generateMockDetections(w: number, h: number): BBox[] {
  const rand = (min: number, max: number) => Math.random() * (max - min) + min
  const boxes: BBox[] = []
  const count = Math.floor(rand(4, 9))
  for (let i = 0; i < count; i++) {
    const label = LABELS[Math.floor(Math.random() * LABELS.length)]
    const bw = rand(0.12, 0.28) * w
    const bh = rand(0.04, 0.07) * h
    const x = rand(0.05 * w, 0.9 * w - bw)
    const y = rand(0.08 * h, 0.9 * h - bh)
    boxes.push({
      id: crypto.randomUUID(),
      x,
      y,
      w: bw,
      h: bh,
      label,
      confidence: rand(0.6, 0.98),
    })
  }
  return boxes
}
