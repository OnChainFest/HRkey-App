// HRkey/middleware.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Tu lógica actual (si la necesitas) puede quedarse aquí.
// O simplemente deja pasar:
export function middleware(req: NextRequest) {
  return NextResponse.next()
}

/**
 * IMPORTANTÍSIMO:
 * - No correr middleware en:
 *   • /WebDapp/**   (tu mini web estática)
 *   • /_next/**, /static/**, /favicon.ico (assets de Next/Vercel)
 *   • cualquier cosa que tenga un punto: /algo.png, /algo.js, /algo.txt, etc.
 *   • APIs si quieres (quítalo si tu middleware debe correr en /api)
 */
export const config = {
  matcher: [
    // corre SOLO en rutas “HTML” de app (sin punto),
    // excluyendo explícitamente /WebDapp
    '/((?!WebDapp|_next|static|favicon\\.ico|api|.*\\.).*)',
  ],
}
