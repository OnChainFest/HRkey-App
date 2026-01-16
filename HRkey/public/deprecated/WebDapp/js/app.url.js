// Web Dapp/js/app.url.js
// Función para generar el link absoluto a la página de evaluación del referee
export function makeRefereeLink(token) {
  const base =
    window.PUBLIC_APP_URL ||     // si lo definís en algún <script>
    window.location.origin ||    // usa el dominio actual (producción o test)
    'https://hrkey.xyz';         // fallback por si todo falla

  return `${base}/referee-evaluation-page.html?token=${token}`;
}
