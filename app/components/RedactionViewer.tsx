"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"

type Point = { x: number; y: number }
interface Detection {
  label: string
  confidence: number
  boundingBox: Point[]
}
interface RedactionViewerProps {
  imageUrl: string
  detections: Detection[]
}

const RedactionViewer: React.FC<RedactionViewerProps> = ({ imageUrl, detections }) => {
  const imgRef = useRef<HTMLImageElement | null>(null)
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null)
  const [displaySize, setDisplaySize] = useState<{ w: number; h: number } | null>(null)

  const measure = useCallback(() => {
    const el = imgRef.current
    if (!el) return
    const nw = el.naturalWidth || 1
    const nh = el.naturalHeight || 1
    const dw = el.offsetWidth || 1
    const dh = el.offsetHeight || 1
    setNaturalSize({ w: nw, h: nh })
    setDisplaySize({ w: dw, h: dh })
  }, [])

  const handleLoad = useCallback(() => {
    measure()
  }, [measure])

  useEffect(() => {
    const onResize = () => measure()
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [measure])

  const { scaleX, scaleY } = useMemo(() => {
    if (!naturalSize || !displaySize) return { scaleX: 0, scaleY: 0 }
    return {
      scaleX: displaySize.w / naturalSize.w,
      scaleY: displaySize.h / naturalSize.h,
    }
  }, [naturalSize, displaySize])

  const ready = scaleX > 0 && scaleY > 0

  const rects = useMemo(() => {
    if (!ready) return []
    return (detections || []).map((d) => {
      const xs = d.boundingBox.map((p) => p.x)
      const ys = d.boundingBox.map((p) => p.y)
      const minX = Math.min(...xs)
      const maxX = Math.max(...xs)
      const minY = Math.min(...ys)
      const maxY = Math.max(...ys)
      return {
        left: minX * scaleX,
        top: minY * scaleY,
        width: (maxX - minX) * scaleX,
        height: (maxY - minY) * scaleY,
        label: d.label,
        confidence: d.confidence,
      }
    })
  }, [detections, scaleX, scaleY, ready])

  return (
    <div style={{ position: "relative", display: "inline-block", width: "100%" }}>
      <img
        ref={imgRef}
        src={imageUrl}
        alt="Document for redaction"
        onLoad={handleLoad}
        style={{ maxWidth: "100%", height: "auto", display: "block" }}
      />
      {ready && (
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
          {rects.map((r, i) => (
            <div
              key={i}
              title={`${r.label} ${(r.confidence * 100).toFixed(0)}%`}
              style={{
                position: "absolute",
                left: r.left,
                top: r.top,
                width: r.width,
                height: r.height,
                backgroundColor: "#000",
                opacity: 1,
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default RedactionViewer


