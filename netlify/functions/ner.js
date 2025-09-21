const { processTextWithTransformersNER } = require('../../lib/transformers-ner-enhanced');

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
    const { text, threshold = 0.5, language = 'en' } = JSON.parse(event.body);
    
    if (!text || typeof text !== 'string') {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Missing 'text' string" }),
      };
    }

    console.log('[Netlify Function] Processing text with Transformers.js NER...');
    
    // Use Transformers.js NER
    const result = await processTextWithTransformersNER(text, language, Number(threshold));

    // Convert to legacy format for compatibility
    const legacyEntities = result.entities.map((entity) => ({
      entity_group: entity.label.toUpperCase(),
      score: entity.confidence,
      word: entity.text,
      start: entity.start,
      end: entity.end,
      pii_type: entity.label,
      risk_level: entity.riskLevel,
      redaction_policy: entity.redactionPolicy,
    }));

    const regexSpans = findRegexPii(text);
    const spans = mergeSpans(
      [
        ...result.entities.map((e) => ({ 
          start: e.start, 
          end: e.end, 
          label: e.label, 
          score: e.confidence 
        })),
        ...regexSpans,
      ],
      1,
    );

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        inputLength: text.length,
        threshold: Number(threshold),
        entities: legacyEntities,
        regexFinds: regexSpans,
        spans,
        redacted: result.redactedText,
        processingTime: result.processingTime,
        modelUsed: result.modelUsed,
        confidence: result.confidence,
        modelStats: result.modelStats,
      }),
    };
  } catch (error) {
    console.error('[Netlify Function] Error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message || 'Unknown error' }),
    };
  }
};

function findRegexPii(text) {
  const spans = [];
  // SSN: 3-2-4 with basic safeguards
  matchAllPush(text, /\b(?!000|666|9\d\d)\d{3}-(?!00)\d{2}-(?!0000)\d{4}\b/g, 'SSN', spans);

  // Credit card (naive, may include non-card long numbers)
  matchAllPush(text, /\b(?:\d[ -]?){13,19}\b/g, 'CREDIT_CARD', spans);

  // IBAN (broad)
  matchAllPush(text, /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g, 'IBAN', spans);

  // US phone
  matchAllPush(text, /\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?){2}\d{4}\b/g, 'PHONE_NUMBER', spans);

  // Email
  matchAllPush(text, /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, 'EMAIL', spans);

  // Routing number (9 digits) and account (6-12 digits, naive)
  matchAllPush(text, /\b\d{9}\b/g, 'ROUTING_NUMBER', spans);
  matchAllPush(text, /\b\d{6,12}\b/g, 'ACCOUNT_NUMBER', spans);

  return spans;
}

function matchAllPush(text, regex, label, out) {
  let m;
  while ((m = regex.exec(text)) !== null) {
    const start = m.index;
    const end = start + m[0].length;
    out.push({ start, end, label });
  }
}

function mergeSpans(spans, padding = 0) {
  if (spans.length === 0) return [];
  const sorted = [...spans]
    .map((s) => ({ ...s, start: Math.max(0, s.start - padding), end: s.end + padding }))
    .sort((a, b) => (a.start === b.start ? b.end - a.end : a.start - b.start));
  const merged = [];
  let cur = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    const s = sorted[i];
    if (s.start <= cur.end) {
      cur.end = Math.max(cur.end, s.end);
      cur.label = cur.label === s.label ? cur.label : `${cur.label}|${s.label}`;
      cur.score = Math.max(cur.score || 0, s.score || 0);
    } else {
      merged.push(cur);
      cur = s;
    }
  }
  merged.push(cur);
  return merged;
}
