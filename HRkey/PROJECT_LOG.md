# HRKey – Project Log

## 🔥 Active Blockers
- [ ] Hero image aún servida local → mover a Cloudflare R2 y actualizar URL

## ✅ Recently Completed
- [x] Landing real restaurada y sirviendo en /
- [x] Dominio hrkey.xyz correctamente apuntado
- [x] Video del hero subido a Cloudflare R2
- [x] Video accesible vía https://video.hrkey.xyz/HRkey%20Video.mp4

## 🚧 In Progress
- [ ] Migrar hero image a Cloudflare R2
- [ ] Reemplazar URL de imagen en landing
- [ ] Revisar peso total de assets del landing

## 🧠 Ideas / Notes
- Usar Cloudflare R2 para todos los assets pesados
- Separar claramente marketing landing vs app frontend

## 🗺 Architecture Decisions
- Vercel → aplicación
- Cloudflare R2 → assets estáticos pesados

## 🔜 Next Up
- [ ] Subir imagen hero a R2
- [ ] Cambiar src en landing
- [ ] Testear tiempos de carga

## 2026-01-28 — Repo guardrails + cleanup de archivos pesados

### PR #141 — OSS guardrails (OPEN vs CLOSED)
- Se definieron boundaries OPEN/CLOSED/REVIEW en `docs/OPEN_VS_CLOSED.md`.
- Se agregó `docs/REPO_GUARDRAILS.md` con recomendaciones de branch protections.
- Se agregaron placeholders `/open` y `/closed` (staging de separación futura).
- Se implementó enforcement con `.github/CODEOWNERS` para paths sensibles (scoring/pricing/ml/correlation + rails de pagos/webhooks/privileged clients).
- Se agregaron PR/Issue templates para forzar declaración de boundaries y mejores reportes de seguridad.
- Se agregaron `SECURITY.md` y `CONTRIBUTING.md`.
- Se endureció `.gitignore` para evitar secretos y artefactos de datasets/modelos.

### PR #142 — Cleanup de media pesado (CDN)
- Se removió `HRkey/public/deprecated/WebDapp/images/HRkey Video.mp4` (~57MB) del repo (ya hosteado en Cloudflare).
- Se agregaron ignores para formatos de video (`*.mp4`, `*.mov`, `*.mkv`, `*.avi`) para prevenir futuros commits grandes.

