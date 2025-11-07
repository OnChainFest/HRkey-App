// backend/utils/appURL.js
// 🌐 Construcción universal del link de referencia sin riesgo de localhost

import dotenv from 'dotenv';
dotenv.config();

/**
 * Retorna la URL base del frontend garantizando que nunca apunte a localhost.
 * Prioriza las variables públicas definidas en el entorno.
 */
export const getFrontendBaseURL = () => {
  const url =
    process.env.NEXT_PUBLIC_BASE_URL ||
    process.env.FRONTEND_URL ||
    process.env.BASE_URL ||
    'https://hrkey.xyz';

  if (url.includes('localhost')) {
    console.warn('⚠️ FRONTEND URL apunta a localhost, usando dominio público por defecto');
    return 'https://hrkey.xyz';
  }

  return url.replace(/\/$/, ''); // quita cualquier "/" al final
};

/**
 * Construye un link seguro para verificar referencias, evitando localhost.
 * @param {string} token - Token único de referencia
 * @returns {string} URL completa para el referee
 */
export const makeRefereeLink = (token) => {
  const base = getFrontendBaseURL();
  return `${base}/ref/verify?token=${encodeURIComponent(token)}`;
};

/**
 * Construye un link seguro para el dashboard del usuario
 * @returns {string} URL al dashboard
 */
export const makeDashboardLink = () => {
  const base = getFrontendBaseURL();
  return `${base}/app`;
};

export default { getFrontendBaseURL, makeRefereeLink, makeDashboardLink };
