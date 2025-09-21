const { processVisionBase64WithBounds } = require('../../lib/advanced-ocr');
const { processTextWithEnhancedNER } = require('../../lib/multi-model-ner');
const { analyzeDocumentStructure, detectVisualPII } = require('../../lib/computer-vision-analysis');
const { generateRedactedDocument } = require('../../lib/advanced-redaction-engine');

const GOOGLE_VISION_API_KEY = process.env.GOOGLE_VISION_API_KEY;

exports.handler = async (event, context) => {
  // Set CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  // Handle preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    // Parse multipart form data
    const boundary = event.headers['content-type']?.split('boundary=')[1];
    if (!boundary) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Invalid form data' }),
      };
    }

    const parts = event.body.split(`--${boundary}`);
    let file = null;
    let language = 'en';
    let enhanceImage = false;
    let confidenceThreshold = 0.7;
    let selectedEntityIndices = new Set();

    for (const part of parts) {
      if (part.includes('Content-Disposition: form-data')) {
        if (part.includes('name="file"')) {
          const fileMatch = part.match(/filename="([^"]+)"/);
          const contentTypeMatch = part.match(/Content-Type: ([^\r\n]+)/);
          const fileDataMatch = part.match(/\r\n\r\n(.+)$/s);
          
          if (fileMatch && fileDataMatch) {
            file = {
              name: fileMatch[1],
              type: contentTypeMatch ? contentTypeMatch[1] : 'application/octet-stream',
              data: Buffer.from(fileDataMatch[1], 'base64'),
            };
          }
        } else if (part.includes('name="language"')) {
          const match = part.match(/\r\n\r\n(.+)$/s);
          if (match) language = match[1];
        } else if (part.includes('name="enhanceImage"')) {
          const match = part.match(/\r\n\r\n(.+)$/s);
          if (match) enhanceImage = match[1] === 'true';
        } else if (part.includes('name="confidenceThreshold"')) {
          const match = part.match(/\r\n\r\n(.+)$/s);
          if (match) confidenceThreshold = parseFloat(match[1]) || 0.7;
        } else if (part.includes('name="selectedEntities"')) {
          const match = part.match(/\r\n\r\n(.+)$/s);
          if (match && match[1]) {
            try {
              const indices = JSON.parse(match[1]);
              selectedEntityIndices = new Set(indices);
            } catch (e) {
              console.log('[Netlify Function] Could not parse selected entities, using auto-selection');
            }
          }
        }
      }
    }

    if (!file) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'No file provided' }),
      };
    }

    if (!GOOGLE_VISION_API_KEY) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Google Vision API key not configured' }),
      };
    }

    console.log('[Netlify Function] Processing document:', file.name, file.type);

    const base64Image = file.data.toString('base64');
    const imageDataUrl = `data:${file.type};base64,${base64Image}`;

    console.log('[Netlify Function] Starting OCR extraction with bounding boxes...');
    const ocrStartTime = Date.now();

    const ocrResult = await processVisionBase64WithBounds(base64Image, {
      language,
      enhanceImage,
      detectOrientation: true,
      detectLanguage: true,
      confidenceThreshold,
    });

    const ocrTime = Date.now() - ocrStartTime;

    if (!ocrResult.text || ocrResult.text === 'No text found') {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'No text could be extracted from the document' }),
      };
    }

    console.log('[Netlify Function] OCR completed, extracted text length:', ocrResult.text.length);
    console.log('[Netlify Function] OCR bounding boxes found:', ocrResult.boundingBoxes.length);

    console.log('[Netlify Function] Starting computer vision analysis...');
    const cvStartTime = Date.now();

    const documentAnalysis = await analyzeDocumentStructure(file.data);
    const visualPII = await detectVisualPII(file.data);

    const cvTime = Date.now() - cvStartTime;

    console.log('[Netlify Function] Starting enhanced NER processing...');
    const nerStartTime = Date.now();

    const nerResult = await processTextWithEnhancedNER(ocrResult.text, confidenceThreshold);

    const nerTime = Date.now() - nerStartTime;

    console.log('[Netlify Function] Generating redacted document...');
    const redactionStartTime = Date.now();

    if (selectedEntityIndices.size === 0) {
      // Auto-select entities based on confidence threshold and risk level
      nerResult.entities.forEach((entity, index) => {
        if (entity.confidence >= confidenceThreshold) {
          // Select all entities that meet confidence threshold
          selectedEntityIndices.add(index);
        }
      });
      console.log('[Netlify Function] Auto-selected', selectedEntityIndices.size, 'entities above confidence threshold');
    } else {
      console.log('[Netlify Function] Using user-selected', selectedEntityIndices.size, 'entities');
    }

    const redactedDocument = await generateRedactedDocument(
      ocrResult.text,
      imageDataUrl,
      nerResult.entities,
      visualPII,
      documentAnalysis.regions,
      ocrResult.boundingBoxes,
      selectedEntityIndices,
    );

    const redactionTime = Date.now() - redactionStartTime;
    const totalTime = Date.now() - ocrStartTime;

    console.log('[Netlify Function] Document processing completed');
    console.log(
      `[Netlify Function] Performance: OCR=${ocrTime}ms, CV=${cvTime}ms, NER=${nerResult.processingTime}ms, Redaction=${redactionTime}ms`,
    );

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        originalText: ocrResult.text,
        entities: nerResult.entities,
        redactedText: nerResult.redactedText,
        documentAnalysis,
        visualPII,
        redactedDocument,
        modelStats: nerResult.modelStats,
        processingTime: {
          ocr: ocrTime,
          computerVision: cvTime,
          ner: nerResult.processingTime,
          redaction: redactionTime,
          total: totalTime,
        },
        metadata: {
          fileName: file.name,
          fileSize: file.data.length,
          fileType: file.type,
          language,
          enhanceImage,
          confidenceThreshold,
          entitiesFound: nerResult.entities.length,
          criticalEntitiesFound: nerResult.modelStats.criticalEntities,
          documentType: documentAnalysis.documentType,
          visualPIIFound: visualPII.length,
          ocrBoundingBoxes: ocrResult.boundingBoxes.length,
        },
      }),
    };
  } catch (error) {
    console.error('[Netlify Function] Document processing error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Failed to process document',
        details: error.message || 'Unknown error',
      }),
    };
  }
};
