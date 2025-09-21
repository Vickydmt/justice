"use client"

import React from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Slider } from "@/components/ui/slider"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

type Span = { start: number; end: number; label: string; score?: number }

const fetcher = async (url: string, body: any) => {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(t)
  }
  return res.json()
}

export default function RedactTextPage() {
  const [text, setText] = React.useState<string>(
    "John Doe's SSN is 123-45-6789 and his email is john.doe@example.com.\n" +
      "Wire 1,250.00 USD to IBAN DE44500105175407324931, routing 021000021, acct 0011223344.",
  )
  const [threshold, setThreshold] = React.useState<number>(0.5)
  const [spans, setSpans] = React.useState<Span[]>([])
  const [redacted, setRedacted] = React.useState<string>("")
  const [loading, setLoading] = React.useState<boolean>(false)
  const [error, setError] = React.useState<string | null>(null)

  const detect = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetcher("/api/pii/ner", { text, threshold })
      setSpans(data.spans)
      setRedacted(data.redacted)
    } catch (e: any) {
      setError(e?.message || "Detection failed")
    } finally {
      setLoading(false)
    }
  }

  const copyRedacted = async () => {
    try {
      await navigator.clipboard.writeText(redacted || text)
    } catch {}
  }

  return (
    <main className="mx-auto max-w-5xl p-6 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-balance">Text Redaction (Open-Source + Hugging Face)</h1>
        <p className="text-sm text-muted-foreground">
          Paste text, detect PII with an open-source NER model, and generate a redacted copy. Requires
          HUGGINGFACE_API_KEY (server).
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Input</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              aria-label="Input text"
              className="min-h-[260px]"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <div className="space-y-2">
              <label htmlFor="threshold" className="text-sm text-muted-foreground">
                Confidence threshold: {threshold.toFixed(2)}
              </label>
              <Slider
                id="threshold"
                value={[threshold]}
                min={0}
                max={0.99}
                step={0.01}
                onValueChange={(v) => setThreshold(v[0])}
              />
            </div>
            <div className="flex items-center gap-3">
              <Button onClick={detect} disabled={loading}>
                {loading ? "Detecting..." : "Detect & Redact"}
              </Button>
              <Button variant="secondary" onClick={copyRedacted} disabled={loading || (!redacted && !text)}>
                Copy Redacted
              </Button>
            </div>
            {error && <p className="text-sm text-destructive">Error: {error}</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Result</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <HighlightedText text={text} spans={spans} />
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">Redacted Output</label>
              <Textarea readOnly className="min-h-[160px]" value={redacted || ""} />
            </div>
            <Legend />
          </CardContent>
        </Card>
      </div>
    </main>
  )
}

function HighlightedText({ text, spans }: { text: string; spans: Span[] }) {
  if (!spans?.length) return <p className="text-sm text-muted-foreground">No PII spans detected yet.</p>
  const sorted = [...spans].sort((a, b) => a.start - b.start)
  const chunks: React.ReactNode[] = []
  let cursor = 0
  for (const s of sorted) {
    const before = text.slice(cursor, s.start)
    if (before) chunks.push(<span key={`${cursor}-b`}>{before}</span>)
    const part = text.slice(s.start, s.end)
    chunks.push(
      <mark
        key={`${s.start}-${s.end}`}
        className={cn("rounded px-1 py-0.5", labelClass(s.label))}
        title={`${s.label}${s.score ? ` (${(s.score * 100).toFixed(1)}%)` : ""}`}
      >
        {part}
      </mark>,
    )
    cursor = s.end
  }
  const tail = text.slice(cursor)
  if (tail) chunks.push(<span key={`tail-${cursor}`}>{tail}</span>)
  return <p className="whitespace-pre-wrap leading-6">{chunks}</p>
}

function labelClass(label: string) {
  const l = label.toUpperCase()
  if (l.includes("SSN")) return "bg-destructive/20 text-destructive"
  if (l.includes("CREDIT_CARD")) return "bg-destructive/20 text-destructive"
  if (l.includes("IBAN")) return "bg-primary/20 text-primary"
  if (l.includes("ACCOUNT") || l.includes("ROUTING")) return "bg-primary/20 text-primary"
  if (l.includes("EMAIL") || l.includes("PHONE")) return "bg-primary/20 text-primary"
  if (l.includes("PERSON") || l.includes("ORG")) return "bg-amber-200 text-amber-900"
  return "bg-muted text-foreground"
}

function Legend() {
  const items = [
    { label: "SSN / Credit Card", class: "bg-destructive/20 text-destructive" },
    { label: "IBAN / Account / Routing / Email / Phone", class: "bg-primary/20 text-primary" },
    { label: "Person / Org", class: "bg-amber-200 text-amber-900" },
  ]
  return (
    <div className="flex flex-wrap items-center gap-2">
      {items.map((i) => (
        <Badge key={i.label} variant="outline" className={i.class}>
          {i.label}
        </Badge>
      ))}
    </div>
  )
}
