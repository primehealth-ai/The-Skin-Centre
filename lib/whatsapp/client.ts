// ============================================================
// WARNING: DO NOT USE - WRONG WHATSAPP PROVIDER
// This file implements Meta Cloud API directly.
// PrimeHealth uses Gupshup BSP via Knowlarity.
// Pending: Gupshup API docs confirmation from Rajesh Singh.
// When docs arrive, implement the real endpoint in send.ts
// and delete this file.
// ============================================================

/**
 * Meta WhatsApp Cloud API Client
 */

export interface MetaWhatsAppResponse {
  error?: {
    message: string;
    type?: string;
    code?: number;
    fbtrace_id?: string;
  };
  messages?: Array<{ id: string }>;
  contacts?: Array<{ input: string; wa_id: string }>;
}

const API_VERSION = 'v20.0';

async function makeMetaRequest(endpoint: string, body: object): Promise<MetaWhatsAppResponse> {
  const phoneId = process.env.META_PHONE_NUMBER_ID;
  const token = process.env.META_WHATSAPP_TOKEN;

  if (!phoneId || !token) {
    console.warn('Meta WhatsApp Client: META_PHONE_NUMBER_ID or META_WHATSAPP_TOKEN environment variables are missing.');
    return { error: { message: 'Meta WhatsApp credentials missing' } };
  }

  const url = `https://graph.facebook.com/${API_VERSION}/${phoneId}/${endpoint}`;
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      console.error(`Meta API Error [${response.status}]:`, errData);
      return {
        error: errData.error || { message: `Meta API returned HTTP status ${response.status}` }
      };
    }

    return response.json() as Promise<MetaWhatsAppResponse>;
  } catch (error: unknown) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      console.error('Meta API request timed out after 30 seconds');
      return { error: { message: 'Meta API request timed out after 30 seconds' } };
    }
    console.error('Meta API client error:', error);
    return { error: { message: error instanceof Error ? error.message : 'Unknown client error' } };
  }
}

export async function sendWhatsAppMessage(to: string, message: string): Promise<MetaWhatsAppResponse> {
  return makeMetaRequest('messages', {
    messaging_product: 'whatsapp',
    to: to.replace('+', '').trim(),
    type: 'text',
    text: { body: message }
  });
}

/**
 * Send template-based WhatsApp message (useful for missed call recovery notifications)
 */
export async function sendWhatsAppTemplate(
  to: string,
  templateName: string,
  languageCode: string = 'en',
  components: unknown[] = []
): Promise<MetaWhatsAppResponse> {
  return makeMetaRequest('messages', {
    messaging_product: 'whatsapp',
    to: to.replace('+', '').trim(),
    type: 'template',
    template: {
      name: templateName,
      language: {
        code: languageCode
      },
      components
    }
  });
}
