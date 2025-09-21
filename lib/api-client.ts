// API client utility that works with both Next.js API routes and Netlify Functions

const getApiBaseUrl = () => {
  // In development, use Next.js API routes
  if (process.env.NODE_ENV === 'development') {
    return '';
  }
  
  // In production (Netlify), use Netlify Functions
  return '/.netlify/functions';
};

export const apiClient = {
  // Process document endpoint
  async processDocument(formData: FormData): Promise<any> {
    const baseUrl = getApiBaseUrl();
    const url = process.env.NODE_ENV === 'development' 
      ? '/api/pii/process-document'
      : `${baseUrl}/process-document`;
    
    const response = await fetch(url, {
      method: 'POST',
      body: formData,
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    return response.json();
  },

  // NER endpoint
  async processText(text: string, threshold: number = 0.5, language: string = 'en'): Promise<any> {
    const baseUrl = getApiBaseUrl();
    const url = process.env.NODE_ENV === 'development' 
      ? '/api/pii/ner'
      : `${baseUrl}/ner`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text, threshold, language }),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    return response.json();
  },

  // Export endpoint
  async exportDocument(data: any): Promise<any> {
    const baseUrl = getApiBaseUrl();
    const url = process.env.NODE_ENV === 'development' 
      ? '/api/export'
      : `${baseUrl}/export`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    return response.json();
  },
};
