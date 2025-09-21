"use client"

import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import RedactionViewer from "@/components/RedactionViewer"
import { useMemo, useState } from "react"

export default function Page() {
  const [threshold, setThreshold] = useState<number>(0.85)

  // Demo detections for the hero viewer
  const demoDetections = useMemo(
    () => [
      {
        label: "Name",
        confidence: 0.98,
        boundingBox: [
          { x: 575, y: 405 },
          { x: 690, y: 405 },
          { x: 690, y: 435 },
          { x: 575, y: 435 },
        ],
      },
    ],
    [],
  )

  return (
    <main className="min-h-dvh">
      <header className="border-b bg-background">
        <div className="mx-auto max-w-6xl px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="size-6 rounded-sm bg-blue-600" aria-hidden />
            <span className="font-semibold">Justice Redacted</span>
          </div>
          <nav className="flex items-center gap-4">
            <Link href="/tools/redact-text" className="text-sm text-muted-foreground hover:text-foreground">
              Redact Text
            </Link>
            <Link href="/tools/redact-document" className="text-sm text-muted-foreground hover:text-foreground">
              Redact Document
            </Link>
            <Link href="/review" className="text-sm text-muted-foreground hover:text-foreground">
              Review Dashboard
            </Link>
            <Link href="#features" className="text-sm text-muted-foreground hover:text-foreground">
              Features
            </Link>
            <Link href="#compliance" className="text-sm text-muted-foreground hover:text-foreground">
              Compliance
            </Link>
            <Button asChild className="bg-blue-600 hover:bg-blue-700 text-white">
              <Link href="/review">Process Court Filing</Link>
            </Button>
          </nav>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 py-16 md:py-24">
        <div className="grid md:grid-cols-2 gap-10 items-center">
          <div className="space-y-6">
            <h1 className="text-pretty text-4xl md:text-5xl font-semibold">
              AI-Powered Court Filing Redaction for Privacy-Preserving Justice
            </h1>
            <p className="text-lg text-muted-foreground leading-relaxed">
              Justice Redacted automatically detects and redacts sensitive personal information from court filings, 
              protecting victims, minors, and witnesses while maintaining legal transparency and compliance.
            </p>
            <div className="flex items-center gap-3">
              <Button asChild size="lg" className="bg-blue-600 hover:bg-blue-700 text-white">
                <Link href="/review" className="flex items-center gap-2">
                  Process Court Filing <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button variant="outline" asChild size="lg">
                <Link href="#features">Explore Features</Link>
              </Button>
            </div>
            <ul className="text-sm text-muted-foreground grid grid-cols-2 gap-2 pt-2">
              <li>• Legal document OCR</li>
              <li>• Court-specific NER</li>
              <li>• Signature & face detection</li>
              <li>• Compliance audit trails</li>
            </ul>
          </div>
          <div className="rounded-lg border bg-card p-2">
            <RedactionViewer
              imageUrl="/redaction-ui-with-boxes-over-document.png"
              detections={demoDetections as any}
              confidenceThreshold={threshold}
            />
            <div className="px-4 pb-4">
              <div className="flex items-center justify-between text-sm py-2">
                <span className="text-muted-foreground">Confidence threshold</span>
                <span className="tabular-nums">{Math.round(threshold * 100)}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={threshold}
                onChange={(e) => setThreshold(parseFloat(e.target.value))}
                className="w-full"
              />
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="mx-auto max-w-6xl px-4 pb-16 md:pb-24">
        <div className="grid md:grid-cols-3 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Legal Document Intelligence</CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground">
              Advanced OCR, legal NER, and computer vision for detecting names, addresses, case numbers, signatures, and embedded exhibits.
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Human-in-the-Loop Review</CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground">
              Legal reviewers can accept or modify AI-suggested redactions with a single click. Complete audit trail for compliance.
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Privacy by Design</CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground">
              Compliant with GDPR, HIPAA, DPDP Act. Exportable audit logs, retention controls, and redacted PDFs for public release.
            </CardContent>
          </Card>
        </div>
      </section>

      <section id="compliance" className="mx-auto max-w-6xl px-4 pb-20">
        <div className="rounded-lg border p-6 md:p-10">
          <h2 className="text-2xl font-semibold mb-3">Built for Judicial Systems</h2>
          <p className="text-muted-foreground leading-relaxed">
            Enterprise-grade security, role-based access control, and comprehensive audit trails for every redaction decision. 
            Deploy in cloud or self-host for sensitive legal data requirements.
          </p>
        </div>
      </section>

      <footer className="border-t">
        <div className="mx-auto max-w-6xl px-4 py-8 text-sm text-muted-foreground">
          © {new Date().getFullYear()} Justice Redacted. Privacy by Design for Legal Transparency.
        </div>
      </footer>
    </main>
  )
}
