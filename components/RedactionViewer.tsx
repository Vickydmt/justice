"use client"

import React, { useEffect, useMemo, useRef, useState } from "react"

type Point = { x: number; y: number }
type Detection = {
  label: string
  confidence: number
  boundingBox: Point[] // clockwise quadrilateral on the original image
}

export interface RedactionViewerProps {
  imageUrl: string
  detections: Detection[]
  confidenceThreshold: number // 0..1
}

export default function RedactionViewer({ imageUrl, detections, confidenceThreshold }: RedactionViewerProps) {
  const imgRef = useRef<HTMLImageElement | null>(null)
  const [natural, setNatural] = useState<{ w: number; h: number }>({ w: 1, h: 1 })
  const [display, setDisplay] = useState<{ w: number; h: number }>({ w: 1, h: 1 })

  // Measure natural and displayed size
  useEffect(() => {
    const el = imgRef.current
    if (!el) return

    function measure() {
      if (!el) return
      // naturalWidth/Height are intrinsic image dimensions
      const nw = el.naturalWidth || 1
      const nh = el.naturalHeight || 1
      setNatural({ w: nw, h: nh })
      // offsetWidth/Height are rendered size in CSS pixels
      setDisplay({ w: el.offsetWidth || 1, h: el.offsetHeight || 1 })
    }

    if (el.complete) {
      measure()
    } else {
      el.onload = measure
      el.onerror = measure
    }

    window.addEventListener("resize", measure)
    return () => window.removeEventListener("resize", measure)
  }, [imageUrl])

  const scaleX = display.w / natural.w
  const scaleY = display.h / natural.h

  const filtered = useMemo(() => {
    return (detections || []).filter((d) => (d?.confidence ?? 0) >= confidenceThreshold && Array.isArray(d.boundingBox))
  }, [detections, confidenceThreshold])

  // Convert polygon to axis-aligned rectangle for redaction
  function toRect(points: Point[]) {
    if (!points || points.length === 0) return { x: 0, y: 0, w: 0, h: 0 }
    const xs = points.map((p) => p.x)
    const ys = points.map((p) => p.y)
    const minX = Math.min(...xs)
    const minY = Math.min(...ys)
    const maxX = Math.max(...xs)
    const maxY = Math.max(...ys)
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
  }

  return (
    <div className="relative inline-block w-full">
      <img ref={imgRef} src={imageUrl} alt="Document" className="max-w-full h-auto block" />

      {/* absolutely positioned redaction boxes on top */}
      <div className="pointer-events-none absolute inset-0">
        {filtered.map((det, idx) => {
          const r = toRect(det.boundingBox)
          const left = r.x * scaleX
          const top = r.y * scaleY
          const width = r.w * scaleX
          const height = r.h * scaleY
          return (
            <div
              key={idx}
              style={{ left, top, width, height, position: "absolute", backgroundColor: "#000", opacity: 1 }}
              title={`${det.label} ${(det.confidence * 100).toFixed(0)}%`}
            />
          )
        })}
      </div>
    </div>
  )
}


