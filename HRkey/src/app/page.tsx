'use client'

import { useEffect } from 'react'
import { redirect } from 'next/navigation'

export default function Page() {
  useEffect(() => {
    // Verificar si hay un hash de OAuth en la URL
    const hash = window.location.hash

    if (hash && (hash.includes('access_token') || hash.includes('error'))) {
      // Es un callback de OAuth, redirigir a app.html con el hash
      console.log('OAuth callback detected, redirecting to app.html')
      window.location.href = '/WebDapp/app.html' + hash
    } else {
      // No es OAuth callback, redirigir a landing
      window.location.href = '/WebDapp/index.html'
    }
  }, [])

  // Mostrar loading mientras se decide la redirección
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      height: '100vh',
      background: '#0a0a0a',
      color: '#00C4C7',
      fontFamily: 'system-ui, sans-serif'
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{
          width: '40px',
          height: '40px',
          border: '4px solid rgba(0,196,199,0.2)',
          borderTop: '4px solid #00C4C7',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
          margin: '0 auto 20px'
        }} />
        <div>Loading HRKey...</div>
      </div>
      <style jsx>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
