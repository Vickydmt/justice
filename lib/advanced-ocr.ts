import axios from "axios"

const GOOGLE_VISION_API_KEY = "AIzaSyCLVG91jIazGPPi5GEpxiwWqSqXP4MhmFc"
const GOOGLE_VISION_ENDPOINT = `https://vision.googleapis.com/v1/images:annotate?key=${GOOGLE_VISION_API_KEY}`

// Supported languages for OCR
const SUPPORTED_LANGUAGES = [
  "en", // English
  "hi", // Hindi
  "bn", // Bengali
  "ta", // Tamil
  "te", // Telugu
  "mr", // Marathi
  "gu", // Gujarati
  "kn", // Kannada
  "ml", // Malayalam
  "pa", // Punjabi
  "ur", // Urdu
]

interface OCROptions {
  language?: string
  enhanceImage?: boolean
  detectOrientation?: boolean
  detectLanguage?: boolean
  confidenceThreshold?: number
}

// Interface for OCR bounding box data
export interface OCRBoundingBox {
  text: string
  confidence: number
  boundingBox: {
    x: number
    y: number
    width: number
    height: number
  }
}

export interface OCRResult {
  text: string
  boundingBoxes: OCRBoundingBox[]
  imageWidth?: number
  imageHeight?: number
}

export async function processHistoricalDocument(file: File, options: OCROptions = {}): Promise<string> {
  try {
    if (!GOOGLE_VISION_API_KEY) {
      throw new Error("Google Vision API key not configured")
    }

    // Apply image preprocessing if enhancement is enabled
    const processedImage = options.enhanceImage ? await preprocessImage(file) : await fileToBase64(file)

    const requestData = {
      requests: [
        {
          image: { content: processedImage },
          features: [
            { type: "DOCUMENT_TEXT_DETECTION" }, // Better for dense text & handwriting
            { type: "TEXT_DETECTION" }, // Additional text detection
          ],
          imageContext: {
            languageHints: options.language ? [options.language] : SUPPORTED_LANGUAGES,
            textDetectionParams: {
              enableTextDetectionConfidenceScore: true,
            },
          },
        },
      ],
    }

    const endpoint = `https://vision.googleapis.com/v1/images:annotate?key=${GOOGLE_VISION_API_KEY}`
    const response = await axios.post(endpoint, requestData, {
      headers: { "Content-Type": "application/json" },
    })

    // Process and clean the extracted text
    const extractedText = extractTextFromResponse(response.data, options)
    return postProcessText(extractedText, options)
  } catch (error) {
    console.error("OCR Error:", error)
    throw new Error(`Failed to process document: ${error instanceof Error ? error.message : "Unknown error"}`)
  }
}

export async function processHistoricalDocumentWithBounds(file: File, options: OCROptions = {}): Promise<OCRResult> {
  try {
    if (!GOOGLE_VISION_API_KEY) {
      throw new Error("Google Vision API key not configured")
    }

    // Apply image preprocessing if enhancement is enabled
    const processedImage = options.enhanceImage ? await preprocessImage(file) : await fileToBase64(file)

    const requestData = {
      requests: [
        {
          image: { content: processedImage },
          features: [
            { type: "DOCUMENT_TEXT_DETECTION" }, // Better for dense text & handwriting
            { type: "TEXT_DETECTION" }, // Additional text detection
          ],
          imageContext: {
            languageHints: options.language ? [options.language] : SUPPORTED_LANGUAGES,
            textDetectionParams: {
              enableTextDetectionConfidenceScore: true,
            },
          },
        },
      ],
    }

    const endpoint = `https://vision.googleapis.com/v1/images:annotate?key=${GOOGLE_VISION_API_KEY}`
    const response = await axios.post(endpoint, requestData, {
      headers: { "Content-Type": "application/json" },
    })

    // Process and clean the extracted text
    const extractedText = extractTextFromResponse(response.data, options)
    const boundingBoxes = extractBoundingBoxesFromResponse(response.data, options)

    return {
      text: postProcessText(extractedText, options),
      boundingBoxes,
    }
  } catch (error) {
    console.error("OCR Error:", error)
    throw new Error(`Failed to process document: ${error instanceof Error ? error.message : "Unknown error"}`)
  }
}

// Server-safe: accepts base64 image content, avoids DOM APIs
export async function processVisionBase64WithBounds(
  base64Content: string,
  options: OCROptions = {},
  imageWidth?: number,
  imageHeight?: number,
): Promise<OCRResult> {
  if (!GOOGLE_VISION_API_KEY) {
    throw new Error("Google Vision API key not configured")
  }
  const requestData = {
    requests: [
      {
        image: { content: base64Content },
        features: [
          { type: "DOCUMENT_TEXT_DETECTION" },
          { type: "TEXT_DETECTION" },
        ],
        imageContext: {
          languageHints: options.language ? [options.language] : SUPPORTED_LANGUAGES,
          textDetectionParams: { enableTextDetectionConfidenceScore: true },
        },
      },
    ],
  }
  const endpoint = `https://vision.googleapis.com/v1/images:annotate?key=${GOOGLE_VISION_API_KEY}`
  const response = await axios.post(endpoint, requestData, { headers: { "Content-Type": "application/json" } })
  const extractedText = extractTextFromResponse(response.data, options)
  const boundingBoxes = extractBoundingBoxesFromResponse(response.data, options)
  return {
    text: postProcessText(extractedText, options),
    boundingBoxes,
    imageWidth,
    imageHeight,
  }
}

// Convert file to Base64
async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.readAsDataURL(file)
    reader.onload = () => resolve(reader.result?.toString().split(",")[1] || "")
    reader.onerror = (error) => reject(error)
  })
}

// Preprocess image to improve OCR accuracy
async function preprocessImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const canvas = document.createElement("canvas")
    const ctx = canvas.getContext("2d")

    img.onload = () => {
      // Set canvas dimensions
      canvas.width = img.width
      canvas.height = img.height

      // Draw image
      ctx?.drawImage(img, 0, 0)

      // Apply image processing
      if (ctx) {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
        const processedData = enhanceImageQuality(imageData)
        ctx.putImageData(processedData, 0, 0)
      }

      // Convert to base64
      const base64 = canvas.toDataURL("image/jpeg", 0.95).split(",")[1]
      resolve(base64)
    }

    img.onerror = reject
    img.src = URL.createObjectURL(file)
  })
}

// Enhance image quality for better OCR
function enhanceImageQuality(imageData: ImageData): ImageData {
  const data = imageData.data
  const width = imageData.width
  const height = imageData.height

  // Apply adaptive contrast enhancement
  const contrast = calculateAdaptiveContrast(data, width, height)
  const brightness = calculateAdaptiveBrightness(data, width, height)

  // Apply contrast and brightness
  for (let i = 0; i < data.length; i += 4) {
    // Apply adaptive contrast
    data[i] = contrast * (data[i] - 128) + 128 + brightness
    data[i + 1] = contrast * (data[i + 1] - 128) + 128 + brightness
    data[i + 2] = contrast * (data[i + 2] - 128) + 128 + brightness

    // Ensure values stay within valid range
    data[i] = Math.max(0, Math.min(255, data[i]))
    data[i + 1] = Math.max(0, Math.min(255, data[i + 1]))
    data[i + 2] = Math.max(0, Math.min(255, data[i + 2]))
  }

  // Apply advanced noise reduction
  const denoisedData = applyAdvancedNoiseReduction(data, width, height)

  // Apply sharpening
  const sharpenedData = applyUnsharpMasking(denoisedData, width, height)

  // Apply deskewing if needed
  const deskewedData = detectAndCorrectSkew(sharpenedData, width, height)

  return new ImageData(deskewedData, width, height)
}

// Calculate adaptive contrast based on image content
function calculateAdaptiveContrast(data: Uint8ClampedArray, width: number, height: number): number {
  let min = 255
  let max = 0

  // Find min and max values
  for (let i = 0; i < data.length; i += 4) {
    const gray = (data[i] + data[i + 1] + data[i + 2]) / 3
    min = Math.min(min, gray)
    max = Math.max(max, gray)
  }

  // Calculate adaptive contrast factor
  const range = max - min
  const targetRange = 200 // Target contrast range
  return range > 0 ? targetRange / range : 1.2
}

// Calculate adaptive brightness based on image content
function calculateAdaptiveBrightness(data: Uint8ClampedArray, width: number, height: number): number {
  let sum = 0
  let count = 0

  // Calculate average brightness
  for (let i = 0; i < data.length; i += 4) {
    const gray = (data[i] + data[i + 1] + data[i + 2]) / 3
    sum += gray
    count++
  }

  const avgBrightness = sum / count
  const targetBrightness = 128
  return targetBrightness - avgBrightness
}

// Apply advanced noise reduction using bilateral filter
function applyAdvancedNoiseReduction(data: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray {
  const output = new Uint8ClampedArray(data.length)
  const sigmaSpace = 3
  const sigmaColor = 30

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4
      let sumR = 0,
        sumG = 0,
        sumB = 0
      let weightSum = 0

      // Apply bilateral filter
      for (let ky = -sigmaSpace; ky <= sigmaSpace; ky++) {
        for (let kx = -sigmaSpace; kx <= sigmaSpace; kx++) {
          const nx = x + kx
          const ny = y + ky

          if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            const nidx = (ny * width + nx) * 4
            const spaceWeight = Math.exp(-(kx * kx + ky * ky) / (2 * sigmaSpace * sigmaSpace))
            const colorWeight = Math.exp(
              -(
                Math.pow(data[idx] - data[nidx], 2) +
                Math.pow(data[idx + 1] - data[nidx + 1], 2) +
                Math.pow(data[idx + 2] - data[nidx + 2], 2)
              ) /
                (2 * sigmaColor * sigmaColor),
            )
            const weight = spaceWeight * colorWeight

            sumR += data[nidx] * weight
            sumG += data[nidx + 1] * weight
            sumB += data[nidx + 2] * weight
            weightSum += weight
          }
        }
      }

      // Normalize
      output[idx] = sumR / weightSum
      output[idx + 1] = sumG / weightSum
      output[idx + 2] = sumB / weightSum
      output[idx + 3] = data[idx + 3]
    }
  }

  return output
}

// Apply unsharp masking for better text edges
function applyUnsharpMasking(data: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray {
  const output = new Uint8ClampedArray(data.length)
  const amount = 0.5
  const radius = 1
  const threshold = 0

  // Create blurred version
  const blurred = new Uint8ClampedArray(data.length)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4
      let sumR = 0,
        sumG = 0,
        sumB = 0
      let count = 0

      for (let ky = -radius; ky <= radius; ky++) {
        for (let kx = -radius; kx <= radius; kx++) {
          const nx = x + kx
          const ny = y + ky

          if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            const nidx = (ny * width + nx) * 4
            sumR += data[nidx]
            sumG += data[nidx + 1]
            sumB += data[nidx + 2]
            count++
          }
        }
      }

      blurred[idx] = sumR / count
      blurred[idx + 1] = sumG / count
      blurred[idx + 2] = sumB / count
      blurred[idx + 3] = data[idx + 3]
    }
  }

  // Apply unsharp masking
  for (let i = 0; i < data.length; i += 4) {
    const diffR = data[i] - blurred[i]
    const diffG = data[i + 1] - blurred[i + 1]
    const diffB = data[i + 2] - blurred[i + 2]

    if (Math.abs(diffR) > threshold) {
      output[i] = Math.max(0, Math.min(255, data[i] + diffR * amount))
    } else {
      output[i] = data[i]
    }

    if (Math.abs(diffG) > threshold) {
      output[i + 1] = Math.max(0, Math.min(255, data[i + 1] + diffG * amount))
    } else {
      output[i + 1] = data[i + 1]
    }

    if (Math.abs(diffB) > threshold) {
      output[i + 2] = Math.max(0, Math.min(255, data[i + 2] + diffB * amount))
    } else {
      output[i + 2] = data[i + 2]
    }

    output[i + 3] = data[i + 3]
  }

  return output
}

// Detect and correct skew in the image
function detectAndCorrectSkew(data: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray {
  const output = new Uint8ClampedArray(data.length)
  const angles = [-45, -30, -15, -10, -5, 0, 5, 10, 15, 30, 45]
  let bestAngle = 0
  let maxVariance = 0

  // Find the angle with maximum variance
  for (const angle of angles) {
    const variance = calculateVarianceAtAngle(data, width, height, angle)
    if (variance > maxVariance) {
      maxVariance = variance
      bestAngle = angle
    }
  }

  // Apply rotation if significant skew is detected
  if (Math.abs(bestAngle) > 1) {
    return rotateImage(data, width, height, bestAngle)
  }

  return data
}

// Calculate variance at a specific angle
function calculateVarianceAtAngle(data: Uint8ClampedArray, width: number, height: number, angle: number): number {
  const radians = (angle * Math.PI) / 180
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  let sum = 0
  let count = 0

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4
      const gray = (data[idx] + data[idx + 1] + data[idx + 2]) / 3
      sum += gray
      count++
    }
  }

  const mean = sum / count
  let variance = 0

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4
      const gray = (data[idx] + data[idx + 1] + data[idx + 2]) / 3
      variance += Math.pow(gray - mean, 2)
    }
  }

  return variance / count
}

// Rotate image by specified angle
function rotateImage(data: Uint8ClampedArray, width: number, height: number, angle: number): Uint8ClampedArray {
  const radians = (angle * Math.PI) / 180
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  const output = new Uint8ClampedArray(data.length)

  const centerX = width / 2
  const centerY = height / 2

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4

      // Calculate rotated coordinates
      const dx = x - centerX
      const dy = y - centerY
      const rotatedX = dx * cos - dy * sin + centerX
      const rotatedY = dx * sin + dy * cos + centerY

      // Get interpolated color
      if (rotatedX >= 0 && rotatedX < width && rotatedY >= 0 && rotatedY < height) {
        const sourceIdx = (Math.floor(rotatedY) * width + Math.floor(rotatedX)) * 4
        output[idx] = data[sourceIdx]
        output[idx + 1] = data[sourceIdx + 1]
        output[idx + 2] = data[sourceIdx + 2]
        output[idx + 3] = data[sourceIdx + 3]
      }
    }
  }

  return output
}

// Extract text from Google Vision response with confidence filtering
function extractTextFromResponse(data: any, options: OCROptions): string {
  const confidenceThreshold = options.confidenceThreshold || 0.5 // Lower threshold for better text recognition
  let extractedText = ""

  // First try to use the full text annotation (most accurate)
  if (data.responses?.[0]?.fullTextAnnotation?.text) {
    const fullText = data.responses[0].fullTextAnnotation.text
    console.log("[OCR] Full text annotation found, length:", fullText.length)
    console.log("[OCR] Sample text:", fullText.substring(0, 200))
    return fullText.trim()
  }

  // Process document text detection word by word
  if (data.responses?.[0]?.fullTextAnnotation?.pages) {
    const pages = data.responses[0].fullTextAnnotation.pages || []
    console.log("[OCR] Processing", pages.length, "pages word by word")

    for (const page of pages) {
      for (const block of page.blocks || []) {
        for (const paragraph of block.paragraphs || []) {
          for (const word of paragraph.words || []) {
            // Check word confidence
            const confidence = word.confidence || 0
            if (confidence >= confidenceThreshold) {
              const wordText = word.symbols?.map((symbol: any) => symbol.text).join("")
              if (wordText && wordText.trim()) {
                extractedText += wordText + " "
              }
            }
          }
          extractedText += "\n"
        }
      }
    }
  }

  // Fallback to regular text detection if no document text
  if (!extractedText && data.responses?.[0]?.textAnnotations?.[0]?.description) {
    extractedText = data.responses[0].textAnnotations[0].description
    console.log("[OCR] Using text annotations fallback, length:", extractedText.length)
  }

  // If still no text, try to extract from all text annotations
  if (!extractedText && data.responses?.[0]?.textAnnotations) {
    const allText = data.responses[0].textAnnotations
      .filter((annotation: any) => annotation.description && annotation.confidence >= confidenceThreshold)
      .map((annotation: any) => annotation.description)
      .join(" ")
    
    if (allText) {
      extractedText = allText
      console.log("[OCR] Using all text annotations, length:", extractedText.length)
    }
  }

  const result = extractedText?.trim() || "No text found"
  console.log("[OCR] Final extracted text length:", result.length)
  console.log("[OCR] Sample final text:", result.substring(0, 200))
  
  return result
}

function extractBoundingBoxesFromResponse(data: any, options: OCROptions): OCRBoundingBox[] {
  const confidenceThreshold = options.confidenceThreshold || 0.7
  const boundingBoxes: OCRBoundingBox[] = []

  // Process document text detection for word-level bounding boxes
  if (data.responses?.[0]?.fullTextAnnotation?.pages) {
    const pages = data.responses[0].fullTextAnnotation.pages

    for (const page of pages) {
      for (const block of page.blocks || []) {
        for (const paragraph of block.paragraphs || []) {
          for (const word of paragraph.words || []) {
            const confidence = word.confidence || 0
            if (confidence >= confidenceThreshold && word.boundingBox?.vertices) {
              const wordText = word.symbols?.map((symbol: any) => symbol.text).join("") || ""
              const vertices = word.boundingBox.vertices

              // Calculate bounding box from vertices
              const xs = vertices.map((v: any) => v.x || 0)
              const ys = vertices.map((v: any) => v.y || 0)
              const minX = Math.min(...xs)
              const minY = Math.min(...ys)
              const maxX = Math.max(...xs)
              const maxY = Math.max(...ys)

              boundingBoxes.push({
                text: wordText,
                confidence,
                boundingBox: {
                  x: minX,
                  y: minY,
                  width: maxX - minX,
                  height: maxY - minY,
                },
              })
            }
          }
        }
      }
    }
  }

  // Fallback to text annotations if no document text
  if (boundingBoxes.length === 0 && data.responses?.[0]?.textAnnotations) {
    const annotations = data.responses[0].textAnnotations.slice(1) // Skip first full text annotation

    for (const annotation of annotations) {
      if (annotation.boundingPoly?.vertices && annotation.description) {
        const vertices = annotation.boundingPoly.vertices
        const xs = vertices.map((v: any) => v.x || 0)
        const ys = vertices.map((v: any) => v.y || 0)
        const minX = Math.min(...xs)
        const minY = Math.min(...ys)
        const maxX = Math.max(...xs)
        const maxY = Math.max(...ys)

        boundingBoxes.push({
          text: annotation.description,
          confidence: 1.0, // Text annotations don't have confidence scores
          boundingBox: {
            x: minX,
            y: minY,
            width: maxX - minX,
            height: maxY - minY,
          },
        })
      }
    }
  }

  return boundingBoxes
}

// Language-specific corrections
const languageCorrections: Record<string, Record<string, string[]>> = {
  en: {
    business: ["bussiness", "busines", "bussines", "businness"],
    government: ["govt", "gov", "goverment", "govermant"],
    education: ["edu", "eduction", "educashun", "edukation"],
    technology: ["tech", "technolgy", "technolagy", "techology"],
    health: ["helth", "healh", "helthcare", "healthcare"],
    environment: ["env", "enviroment", "enviromental", "environmental"],
    transportation: ["trans", "transport", "transpotation", "transportation"],
    communication: ["comm", "comunication", "comunication", "communication"],
    development: ["dev", "developement", "develpment", "development"],
    management: ["mngmt", "managment", "mangement", "management"],
  },
  hi: {
    सड़क: ["सड़क", "सडक", "सड़क"],
    सरकार: ["सरकार", "सरकार", "सरकार"],
    शिक्षा: ["शिक्षा", "शिक्षा", "शिक्षा"],
    व्यापार: ["व्यापार", "व्यापार", "व्यापार"],
    स्वास्थ्य: ["स्वास्थ्य", "स्वास्थ्य", "स्वास्थ्य"],
  },
  bn: {
    রাস্তা: ["রাস্তা", "রাস্তা", "রাস্তা"],
    সরকার: ["সরকার", "সরকার", "সরকার"],
    শিক্ষা: ["শিক্ষা", "শিক্ষা", "শিক্ষা"],
    ব্যবসা: ["ব্যবসা", "ব্যবসা", "ব্যবসা"],
    স্বাস্থ্য: ["স্বাস্থ্য", "স্বাস্থ্য", "স্বাস্থ্য"],
  },
  // Add more languages as needed
}

// Common word corrections across languages
const commonWordCorrections: Record<string, string[]> = {
  name: ["nme", "nam", "nmae", "naem"],
  address: ["adrs", "adres", "addr", "adress"],
  phone: ["phn", "phon", "fone", "phone"],
  email: ["eml", "emal", "emil", "emial"],
  date: ["dt", "dte", "dat", "daet"],
  time: ["tm", "tme", "tim", "tiem"],
  number: ["num", "numb", "nmbr", "nubmer"],
  amount: ["amt", "amnt", "amont", "amout"],
  price: ["prc", "prce", "pric", "prize"],
  quantity: ["qty", "qnty", "quant", "quanity"],
}

// Professional domain corrections
const professionalCorrections: Record<string, string[]> = {
  doctor: ["dr", "doc", "dctr", "doctr"],
  engineer: ["eng", "engr", "engnr", "engneer"],
  manager: ["mgr", "mngr", "mnger", "managr"],
  director: ["dir", "dirc", "dirctr", "directr"],
  president: ["pres", "prsdnt", "presdnt", "presidnt"],
  secretary: ["sec", "secr", "secry", "secretr"],
  assistant: ["asst", "ast", "asstnt", "assistnt"],
  supervisor: ["sup", "supv", "supvr", "supervsr"],
  coordinator: ["coord", "cord", "cordntr", "coordntr"],
  administrator: ["admin", "adm", "admn", "adminstr"],
}

// Post-process extracted text
function postProcessText(text: string, options: OCROptions): string {
  let processedText = text

  // Remove extra whitespace
  processedText = processedText.replace(/\s+/g, " ").trim()

  // Apply language-specific corrections
  const language = options.language || "en"
  if (languageCorrections[language]) {
    for (const [correct, variations] of Object.entries(languageCorrections[language])) {
      for (const variation of variations) {
        const regex = new RegExp(`\\b${variation}\\b`, "gi")
        processedText = processedText.replace(regex, correct)
      }
    }
  }

  // Apply common word corrections
  for (const [correct, variations] of Object.entries(commonWordCorrections)) {
    for (const variation of variations) {
      const regex = new RegExp(`\\b${variation}\\b`, "gi")
      processedText = processedText.replace(regex, correct)
    }
  }

  // Apply professional domain corrections
  for (const [correct, variations] of Object.entries(professionalCorrections)) {
    for (const variation of variations) {
      const regex = new RegExp(`\\b${variation}\\b`, "gi")
      processedText = processedText.replace(regex, correct)
    }
  }

  // Fix common OCR errors
  const commonErrors: Record<string, string> = {
    l: "I", // Common OCR error for capital I
    rn: "m", // Common OCR error for m
    cl: "d", // Common OCR error for d
    vv: "w", // Common OCR error for w
  }

  // Domain-specific corrections
  const domainCorrections: Record<string, string[]> = {
    road: ["highwanz", "highway", "highwav", "highwavs", "highwaz", "rd"],
    street: ["stret", "stret", "stret", "stret"],
    avenue: ["avenu", "avenu", "avenu"],
    boulevard: ["blvd", "blvd", "blvd"],
    lane: ["lan", "lan", "lan"],
    drive: ["driv", "driv", "driv"],
    circle: ["cir", "cir", "cir"],
    court: ["ct", "ct", "ct"],
    place: ["pl", "pl", "pl"],
    square: ["sq", "sq", "sq"],
    terrace: ["ter", "ter", "ter"],
    trail: ["trl", "trl", "trl"],
    way: ["wy", "wy", "wy"],
  }

  // Context-aware corrections
  const contextCorrections: Record<string, { pattern: RegExp; replacement: string }[]> = {
    road: [
      { pattern: /\b(highw[a-z]+)\b/g, replacement: "highway" },
      { pattern: /\b(rd|road)\b/g, replacement: "Road" },
      { pattern: /\b(st|street)\b/g, replacement: "Street" },
      { pattern: /\b(ave|avenue)\b/g, replacement: "Avenue" },
      { pattern: /\b(blvd|boulevard)\b/g, replacement: "Boulevard" },
    ],
    address: [
      { pattern: /\b(\d+)\s*(st|nd|rd|th)\b/g, replacement: "$1$2" },
      { pattern: /\b(apt|apartment)\s*#?\s*(\d+)\b/gi, replacement: "Apt $2" },
      { pattern: /\b(unit)\s*#?\s*(\d+)\b/gi, replacement: "Unit $2" },
    ],
    numbers: [
      { pattern: /\b(\d+)\s*-\s*(\d+)\b/g, replacement: "$1-$2" },
      { pattern: /\b(\d+)\s*\.\s*(\d+)\b/g, replacement: "$1.$2" },
    ],
  }

  // Apply existing corrections
  for (const [error, correction] of Object.entries(commonErrors)) {
    processedText = processedText.replace(new RegExp(error, "g"), correction)
  }

  // Apply domain-specific corrections
  for (const [domain, corrections] of Object.entries(domainCorrections)) {
    for (const correction of corrections) {
      const regex = new RegExp(`\\b${correction}\\b`, "gi")
      processedText = processedText.replace(regex, domain)
    }
  }

  // Apply context-aware corrections
  for (const [context, corrections] of Object.entries(contextCorrections)) {
    for (const { pattern, replacement } of corrections) {
      processedText = processedText.replace(pattern, replacement)
    }
  }

  // Fix capitalization
  processedText = fixCapitalization(processedText)

  // Fix line breaks and spacing
  processedText = processedText.replace(/\n\s*\n/g, "\n")
  processedText = processedText.replace(/([.!?])\s*\n/g, "$1\n\n")

  return processedText
}

// Fix capitalization based on context
function fixCapitalization(text: string): string {
  // Capitalize first letter of sentences
  text = text.replace(/(?:^|[.!?]\s+)([a-z])/g, (match, letter) => letter.toUpperCase())

  // Capitalize proper nouns (basic implementation)
  const properNouns = [
    "road",
    "street",
    "avenue",
    "boulevard",
    "lane",
    "drive",
    "circle",
    "court",
    "place",
    "square",
    "terrace",
    "trail",
    "way",
    "north",
    "south",
    "east",
    "west",
    "northeast",
    "northwest",
    "southeast",
    "southwest",
  ]

  for (const noun of properNouns) {
    const regex = new RegExp(`\\b${noun}\\b`, "gi")
    text = text.replace(regex, (match) => match.charAt(0).toUpperCase() + match.slice(1))
  }

  // Capitalize abbreviations
  text = text.replace(/\b(rd|st|ave|blvd|ln|dr|cir|ct|pl|sq|ter|trl|wy)\b/gi, (match) => match.toUpperCase())

  return text
}
