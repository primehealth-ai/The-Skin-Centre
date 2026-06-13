/**
 * Exotel API Client
 */
/**
 * Exotel API Client
 */
export class ExotelClient {
  private apiKey: string;
  private apiToken: string;
  private accountSid: string;
  private exophone: string;

  constructor() {
    this.apiKey = process.env.EXOTEL_API_KEY || '';
    this.apiToken = process.env.EXOTEL_API_TOKEN || '';
    this.accountSid = process.env.EXOTEL_ACCOUNT_SID || '';
    this.exophone = process.env.EXOTEL_EXOPHONE || '';

    // Validate env variables
    if (!this.apiKey || !this.apiToken || !this.accountSid || !this.exophone) {
      console.warn('ExotelClient: Missing one or more Exotel environment variables.');
    }
  }

  /**
   * Helper to make authenticated requests to Exotel API
   */
  private async request(endpoint: string, options: RequestInit = {}): Promise<unknown> {
    if (!this.apiKey || !this.apiToken || !this.accountSid) {
      throw new Error('ExotelClient is not initialized: missing API credentials.');
    }

    const authString = Buffer.from(`${this.apiKey}:${this.apiToken}`).toString('base64');
    const url = `https://api.exotel.com/v1/Accounts/${this.accountSid}/${endpoint}`;
    
    // Add 30s timeout abort signal
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'Authorization': `Basic ${authString}`,
          ...options.headers,
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text().catch(() => response.statusText);
        throw new Error(`Exotel API Error [${response.status}]: ${errorText}`);
      }

      return response.json();
    } catch (error: unknown) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Exotel API request timed out after 30 seconds');
      }
      throw error;
    }
  }

  /**
   * Initiate a call connecting an agent/exophone to a patient
   */
  async connectCall(from: string, to: string): Promise<unknown> {
    if (!this.exophone) {
      throw new Error('ExotelClient is not initialized: missing ExoPhone number.');
    }

    const params = new URLSearchParams({
      From: from,
      To: to,
      CallerId: this.exophone,
    });

    return this.request('Calls/connect.json', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });
  }
}

export const exotel = new ExotelClient();

