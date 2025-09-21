"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Download, Eye, EyeOff, Clock, User, Shield } from "lucide-react"

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

interface AuditTrailProps {
  entries: AuditEntry[]
  onExportAuditLog: () => void
}

export default function AuditTrail({ entries, onExportAuditLog }: AuditTrailProps) {
  const [showSensitiveData, setShowSensitiveData] = useState(false)

  const getActionColor = (action: AuditEntry["action"]) => {
    switch (action) {
      case "DETECTED": return "bg-blue-100 text-blue-800"
      case "APPROVED": return "bg-green-100 text-green-800"
      case "REJECTED": return "bg-red-100 text-red-800"
      case "MODIFIED": return "bg-yellow-100 text-yellow-800"
      case "EXPORTED": return "bg-purple-100 text-purple-800"
      default: return "bg-gray-100 text-gray-800"
    }
  }

  const getRiskLevelColor = (riskLevel: AuditEntry["riskLevel"]) => {
    switch (riskLevel) {
      case "CRITICAL": return "bg-red-100 text-red-800 border-red-200"
      case "HIGH": return "bg-orange-100 text-orange-800 border-orange-200"
      case "MEDIUM": return "bg-yellow-100 text-yellow-800 border-yellow-200"
      case "LOW": return "bg-green-100 text-green-800 border-green-200"
      default: return "bg-gray-100 text-gray-800 border-gray-200"
    }
  }

  const maskSensitiveText = (text: string, entityType: string) => {
    if (!showSensitiveData) {
      const riskLevel = entries.find(e => e.entityText === text)?.riskLevel
      if (riskLevel === "CRITICAL" || riskLevel === "HIGH") {
        return "█".repeat(Math.min(text.length, 20)) + (text.length > 20 ? "..." : "")
      }
    }
    return text
  }

  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Audit Trail
        </CardTitle>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowSensitiveData(!showSensitiveData)}
            className="text-xs px-2 py-1 h-auto"
          >
            {showSensitiveData ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onExportAuditLog}
            className="flex items-center gap-1 text-xs px-2 py-1 h-auto"
          >
            <Download className="h-3 w-3" />
            Export
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {entries.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <Shield className="h-8 w-8 mx-auto mb-3 opacity-50" />
            <p className="text-sm">No audit entries yet</p>
            <p className="text-xs">Start processing documents to see audit trail</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {entries.map((entry) => (
              <div
                key={entry.id}
                className="flex items-start gap-2 p-2 rounded border bg-card/30"
              >
                <div className="flex-shrink-0 mt-0.5">
                  <Clock className="h-3 w-3 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-1 flex-wrap">
                    <Badge className={`${getActionColor(entry.action)} text-xs px-1 py-0`}>
                      {entry.action}
                    </Badge>
                    <Badge variant="outline" className={`${getRiskLevelColor(entry.riskLevel)} text-xs px-1 py-0`}>
                      {entry.riskLevel}
                    </Badge>
                    <span className="text-xs text-muted-foreground truncate">
                      {entry.entityType}
                    </span>
                  </div>
                  <div className="text-xs">
                    <div className="flex items-center gap-2 flex-wrap">
                      <code className="bg-muted px-1 py-0.5 rounded text-xs break-all flex-1 min-w-0">
                        {maskSensitiveText(entry.entityText, entry.entityType)}
                      </code>
                      <span className="text-muted-foreground whitespace-nowrap text-xs">
                        {Math.round(entry.confidence * 100)}%
                      </span>
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {entry.timestamp}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="pt-3 border-t">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="font-medium">Total: </span>
              {entries.length}
            </div>
            <div>
              <span className="font-medium">Critical: </span>
              {entries.filter(e => e.riskLevel === "CRITICAL").length}
            </div>
            <div>
              <span className="font-medium">Approved: </span>
              {entries.filter(e => e.action === "APPROVED").length}
            </div>
            <div>
              <span className="font-medium">Rejected: </span>
              {entries.filter(e => e.action === "REJECTED").length}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
