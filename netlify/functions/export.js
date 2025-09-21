const { exportRedactedDocument } = require('../../lib/document-export-system');

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
    const body = JSON.parse(event.body);
    const { redactedDocument, entities, visualPII, originalFileName, processingMetadata, exportOptions } = body;

    if (!redactedDocument || !originalFileName) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing required data for export' }),
      };
    }

    console.log('[Netlify Function] Starting document export:', exportOptions?.format);

    const exportResult = await exportRedactedDocument(
      redactedDocument,
      entities || [],
      visualPII || [],
      originalFileName,
      processingMetadata || {},
      exportOptions || {}
    );

    // Convert ArrayBuffer to base64 for JSON response
    let responseData;
    if (exportResult.data instanceof ArrayBuffer) {
      responseData = Buffer.from(exportResult.data).toString('base64');
    } else {
      responseData = exportResult.data;
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        filename: exportResult.filename,
        mimeType: exportResult.mimeType,
        size: exportResult.size,
        data: responseData,
        metadata: exportResult.metadata,
      }),
    };
  } catch (error) {
    console.error('[Netlify Function] Export error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Failed to export document',
        details: error.message || 'Unknown error',
      }),
    };
  }
};
