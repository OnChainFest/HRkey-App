// utils/appURL.ts
// Construye URLs seguras de la aplicación

export function makeRefereeLink(token: string): string {
  // Para producción, usa la variable de entorno o construye la URL base
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ||
                  process.env.NEXT_PUBLIC_VERCEL_URL ||
                  'https://hrkey.xyz';

  return `${baseUrl}/ref/verify?token=${encodeURIComponent(token)}`;
}
