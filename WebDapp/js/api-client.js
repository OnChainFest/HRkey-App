// WebDapp/js/api-client.js
// 🌐 HRKey API Client - Configurable baseURL para backend sin localhost

export default class APIClient {
  constructor() {
    this.baseURL = this.computeBaseURL();
  }

  /**
   * Determina la URL base para llamadas al backend.
   * Usa variables globales, .env o fallback seguro.
   */
  computeBaseURL() {
    try {
      // 1️⃣ Variable global (inyectada desde HTML o build)
      if (window.HRKEY_API_URL) {
        return window.HRKEY_API_URL.replace(/\/$/, '');
      }

      // 2️⃣ Variable del entorno de Vercel (Next.js style)
      if (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_API_URL) {
        return process.env.NEXT_PUBLIC_API_URL.replace(/\/$/, '');
      }

      // 3️⃣ Si corre en localhost → usar dominio oficial
      const hostname = window.location.hostname;
      const isLocal = ['localhost', '127.0.0.1'].includes(hostname);
      if (isLocal) {
        return 'https://hrkey.xyz'; // fallback seguro
      }

      // 4️⃣ Por defecto, usar el mismo origen del sitio actual
      return window.location.origin.replace(/\/$/, '');
    } catch (err) {
      console.warn('⚠️ Error resolving API baseURL:', err);
      return 'https://hrkey.xyz'; // fallback definitivo
    }
  }

  // Ejemplo: GET
  async get(path) {
    const response = await fetch(`${this.baseURL}${path}`);
    if (!response.ok) throw new Error(`GET ${path} failed`);
    return await response.json();
  }

  // Ejemplo: POST
  async post(path, data) {
    const response = await fetch(`${this.baseURL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error(`POST ${path} failed`);
    return await response.json();
  }
}
