#!/bin/bash
# Script para instalar el sistema QR JUNGLE en HRkey
# Ejecutar desde la raíz del proyecto: bash install-jungle-qr.sh

echo "🎯 Instalando sistema QR JUNGLE..."

# Verificar que estamos en el directorio correcto
if [ ! -d "HRkey/public" ]; then
    echo "❌ Error: No se encuentra la carpeta HRkey/public"
    echo "   Asegúrate de ejecutar este script desde la raíz del proyecto"
    exit 1
fi

# Crear archivo promo-register.html
echo "📄 Creando promo-register.html..."
cat > HRkey/public/promo-register.html << 'EOF'
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Registro HRkey - JUNGLE Promo</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            background: linear-gradient(135deg, #0E1E22 0%, #1a3238 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }

        .container {
            background: white;
            border-radius: 20px;
            padding: 40px;
            max-width: 450px;
            width: 100%;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
        }

        .logo {
            text-align: center;
            margin-bottom: 30px;
        }

        .logo h1 {
            color: #00C4C7;
            font-size: 32px;
            font-weight: 700;
            margin-bottom: 10px;
        }

        .promo-badge {
            background: linear-gradient(135deg, #00C4C7, #4DE7E8);
            color: #0E1E22;
            padding: 8px 20px;
            border-radius: 20px;
            font-weight: 600;
            font-size: 14px;
            display: inline-block;
            margin-bottom: 20px;
            box-shadow: 0 4px 15px rgba(0, 196, 199, 0.3);
        }

        h2 {
            color: #0E1E22;
            font-size: 24px;
            margin-bottom: 10px;
            text-align: center;
        }

        .subtitle {
            color: #666;
            font-size: 14px;
            text-align: center;
            margin-bottom: 30px;
        }

        .form-group {
            margin-bottom: 20px;
        }

        label {
            display: block;
            color: #0E1E22;
            font-weight: 500;
            margin-bottom: 8px;
            font-size: 14px;
        }

        input {
            width: 100%;
            padding: 14px;
            border: 2px solid #e0e0e0;
            border-radius: 10px;
            font-size: 16px;
            transition: all 0.3s ease;
            background: white;
        }

        input:focus {
            outline: none;
            border-color: #00C4C7;
            box-shadow: 0 0 0 3px rgba(0, 196, 199, 0.1);
        }

        input::placeholder {
            color: #999;
        }

        .btn-register {
            width: 100%;
            padding: 16px;
            background: linear-gradient(135deg, #00C4C7, #4DE7E8);
            color: white;
            border: none;
            border-radius: 10px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
            margin-top: 10px;
        }

        .btn-register:hover:not(:disabled) {
            transform: translateY(-2px);
            box-shadow: 0 8px 20px rgba(0, 196, 199, 0.4);
        }

        .btn-register:disabled {
            opacity: 0.6;
            cursor: not-allowed;
        }

        .benefits {
            background: #f8f9fa;
            border-radius: 10px;
            padding: 20px;
            margin: 20px 0;
        }

        .benefits h3 {
            color: #0E1E22;
            font-size: 16px;
            margin-bottom: 12px;
        }

        .benefit-item {
            display: flex;
            align-items: center;
            margin-bottom: 10px;
            color: #333;
            font-size: 14px;
        }

        .benefit-item::before {
            content: "✓";
            color: #00C4C7;
            font-weight: bold;
            margin-right: 10px;
            font-size: 18px;
        }

        .message {
            padding: 12px;
            border-radius: 8px;
            margin-bottom: 20px;
            font-size: 14px;
            display: none;
        }

        .message.success {
            background: #d4edda;
            color: #155724;
            border: 1px solid #c3e6cb;
            display: block;
        }

        .message.error {
            background: #f8d7da;
            color: #721c24;
            border: 1px solid #f5c6cb;
            display: block;
        }

        .footer {
            text-align: center;
            margin-top: 20px;
            color: #666;
            font-size: 12px;
        }

        .spinner {
            border: 3px solid #f3f3f3;
            border-top: 3px solid #00C4C7;
            border-radius: 50%;
            width: 20px;
            height: 20px;
            animation: spin 1s linear infinite;
            display: inline-block;
            margin-right: 10px;
            vertical-align: middle;
        }

        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }

        .loading-text {
            display: none;
        }

        button.loading .loading-text {
            display: inline;
        }

        button.loading .normal-text {
            display: none;
        }

        @media (max-width: 480px) {
            .container {
                padding: 30px 20px;
            }

            .logo h1 {
                font-size: 28px;
            }

            h2 {
                font-size: 20px;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="logo">
            <h1>HRkey</h1>
            <div class="promo-badge">🎉 CÓDIGO JUNGLE</div>
        </div>

        <h2>¡Bienvenido!</h2>
        <p class="subtitle">Regístrate ahora con tu código promocional exclusivo</p>

        <div class="benefits">
            <h3>Beneficios incluidos:</h3>
            <div class="benefit-item">Acceso completo a la plataforma</div>
            <div class="benefit-item">Referencias verificadas en blockchain</div>
            <div class="benefit-item">Gestión profesional de credenciales</div>
            <div class="benefit-item">Wallet digital automático</div>
        </div>

        <div id="message" class="message"></div>

        <form id="registerForm">
            <div class="form-group">
                <label for="name">Nombre completo *</label>
                <input 
                    type="text" 
                    id="name" 
                    name="name" 
                    placeholder="Ej: Juan Pérez"
                    required
                >
            </div>

            <div class="form-group">
                <label for="email">Correo electrónico *</label>
                <input 
                    type="email" 
                    id="email" 
                    name="email" 
                    placeholder="tu@email.com"
                    required
                >
            </div>

            <button type="submit" class="btn-register" id="submitBtn">
                <span class="normal-text">Registrarme ahora</span>
                <span class="loading-text">
                    <span class="spinner"></span>
                    Registrando...
                </span>
            </button>
        </form>

        <div class="footer">
            Al registrarte, aceptas nuestros términos y condiciones
        </div>
    </div>

    <script type="module">
        // TODO: Configurar con tus credenciales de Supabase
        import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
        
        // IMPORTANTE: Reemplaza estos valores con tus credenciales reales
        const SUPABASE_URL = 'https://zzaohwqcyznagpwbthvh.supabase.co';
        const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp6YW9od3FjeXpuYWdwd2J0aHZoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzAxMDY0MTgsImV4cCI6MjA0NTY4MjQxOH0.pVCRfQxhRUh6oWvZEIZZb1eNFe2oPJl19wpUOzWVLb4';
        
        const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

        const urlParams = new URLSearchParams(window.location.search);
        const promoCode = urlParams.get('promo') || 'JUNGLE';
        
        console.log('Código promocional:', promoCode);

        const form = document.getElementById('registerForm');
        const submitBtn = document.getElementById('submitBtn');
        const messageDiv = document.getElementById('message');

        function showMessage(text, type) {
            messageDiv.textContent = text;
            messageDiv.className = `message ${type}`;
            messageDiv.style.display = 'block';
            
            if (type === 'success') {
                setTimeout(() => {
                    messageDiv.style.display = 'none';
                }, 5000);
            }
        }

        function setLoading(isLoading) {
            submitBtn.disabled = isLoading;
            if (isLoading) {
                submitBtn.classList.add('loading');
            } else {
                submitBtn.classList.remove('loading');
            }
        }

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const name = document.getElementById('name').value.trim();
            const email = document.getElementById('email').value.trim();

            if (!name || !email) {
                showMessage('Por favor completa todos los campos', 'error');
                return;
            }

            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                showMessage('Por favor ingresa un email válido', 'error');
                return;
            }

            setLoading(true);
            messageDiv.style.display = 'none';

            try {
                const temporaryPassword = Math.random().toString(36).slice(-12) + 'Aa1!';
                
                const { data: authData, error: authError } = await supabase.auth.signUp({
                    email: email,
                    password: temporaryPassword,
                    options: {
                        data: {
                            full_name: name,
                            promo_code: promoCode,
                            registration_source: 'qr_jungle'
                        }
                    }
                });

                if (authError) {
                    if (authError.message.includes('already registered')) {
                        showMessage('Este correo ya está registrado. Por favor inicia sesión.', 'error');
                    } else {
                        throw authError;
                    }
                    setLoading(false);
                    return;
                }

                if (authData.user) {
                    const { error: dbError } = await supabase
                        .from('users')
                        .insert({
                            id: authData.user.id,
                            email: email,
                            full_name: name,
                            promo_code: promoCode,
                            subscription_tier: 'free',
                            created_at: new Date().toISOString()
                        });

                    if (dbError) {
                        console.error('Error guardando en DB:', dbError);
                    }
                }

                showMessage(
                    '¡Registro exitoso! Revisa tu email para confirmar tu cuenta.',
                    'success'
                );
                
                form.reset();
                
                setTimeout(() => {
                    window.location.href = '/auth.html?registered=true&promo=JUNGLE';
                }, 3000);

            } catch (error) {
                console.error('Error en registro:', error);
                showMessage(
                    'Ocurrió un error al registrarte. Por favor intenta de nuevo.',
                    'error'
                );
            } finally {
                setLoading(false);
            }
        });

        const emailParam = urlParams.get('email');
        if (emailParam) {
            document.getElementById('email').value = emailParam;
        }
    </script>
</body>
</html>
EOF

# Crear archivo qr-generator.html (solo para uso interno)
echo "📄 Creando qr-generator.html..."
cat > HRkey/public/qr-generator.html << 'EOF'
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Generador QR - HRkey JUNGLE</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #0E1E22 0%, #1a3238 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }

        .container {
            background: white;
            border-radius: 20px;
            padding: 40px;
            max-width: 600px;
            width: 100%;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
        }

        h1 {
            color: #00C4C7;
            text-align: center;
            margin-bottom: 10px;
        }

        .subtitle {
            text-align: center;
            color: #666;
            margin-bottom: 30px;
        }

        .input-group {
            margin-bottom: 20px;
        }

        label {
            display: block;
            color: #0E1E22;
            font-weight: 600;
            margin-bottom: 8px;
        }

        input {
            width: 100%;
            padding: 12px;
            border: 2px solid #e0e0e0;
            border-radius: 8px;
            font-size: 16px;
        }

        input:focus {
            outline: none;
            border-color: #00C4C7;
        }

        .btn {
            width: 100%;
            padding: 14px;
            background: linear-gradient(135deg, #00C4C7, #4DE7E8);
            color: white;
            border: none;
            border-radius: 8px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: transform 0.2s;
        }

        .btn:hover {
            transform: translateY(-2px);
        }

        .qr-container {
            margin-top: 30px;
            padding: 30px;
            background: #f8f9fa;
            border-radius: 12px;
            text-align: center;
            display: none;
        }

        .qr-container.visible {
            display: block;
        }

        #qrcode {
            display: inline-block;
            padding: 20px;
            background: white;
            border-radius: 12px;
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
        }

        .url-display {
            margin-top: 20px;
            padding: 12px;
            background: white;
            border-radius: 8px;
            word-break: break-all;
            font-family: monospace;
            font-size: 14px;
            color: #0E1E22;
        }

        .btn-download {
            margin-top: 15px;
            padding: 10px 20px;
            background: #0E1E22;
            color: white;
            border: none;
            border-radius: 8px;
            font-weight: 600;
            cursor: pointer;
        }

        .instructions {
            background: #fff3cd;
            border: 1px solid #ffc107;
            border-radius: 8px;
            padding: 15px;
            margin-bottom: 20px;
        }

        .instructions h3 {
            color: #856404;
            margin-bottom: 10px;
            font-size: 16px;
        }

        .instructions ol {
            margin-left: 20px;
            color: #856404;
        }

        .instructions li {
            margin-bottom: 8px;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🎯 Generador QR Code</h1>
        <p class="subtitle">Código Promocional: JUNGLE</p>

        <div class="instructions">
            <h3>📋 Instrucciones:</h3>
            <ol>
                <li>Ingresa la URL completa de tu sitio (ej: https://hrkey.xyz)</li>
                <li>Se generará automáticamente el QR con el código JUNGLE</li>
                <li>Descarga el QR para imprimirlo o compartirlo</li>
            </ol>
        </div>

        <div class="input-group">
            <label for="baseUrl">URL Base de tu sitio:</label>
            <input 
                type="text" 
                id="baseUrl" 
                placeholder="https://hrkey.xyz"
                value="https://hrkey.xyz"
            >
        </div>

        <button class="btn" onclick="generateQR()">
            Generar QR Code
        </button>

        <div id="qrContainer" class="qr-container">
            <div id="qrcode"></div>
            <div class="url-display" id="urlDisplay"></div>
            <button class="btn-download" onclick="downloadQR()">
                Descargar QR Code
            </button>
        </div>
    </div>

    <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
    <script>
        let qrcode = null;

        function generateQR() {
            const baseUrl = document.getElementById('baseUrl').value.trim();
            
            if (!baseUrl) {
                alert('Por favor ingresa una URL');
                return;
            }

            const fullUrl = `${baseUrl}/promo-register.html?promo=JUNGLE`;
            
            const qrcodeDiv = document.getElementById('qrcode');
            qrcodeDiv.innerHTML = '';
            
            qrcode = new QRCode(qrcodeDiv, {
                text: fullUrl,
                width: 256,
                height: 256,
                colorDark: "#0E1E22",
                colorLight: "#ffffff",
                correctLevel: QRCode.CorrectLevel.H
            });
            
            document.getElementById('urlDisplay').textContent = fullUrl;
            document.getElementById('qrContainer').classList.add('visible');
        }

        function downloadQR() {
            const canvas = document.querySelector('#qrcode canvas');
            if (canvas) {
                const url = canvas.toDataURL('image/png');
                const a = document.createElement('a');
                a.href = url;
                a.download = 'hrkey-jungle-qr.png';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            }
        }

        window.addEventListener('load', () => {
            const baseUrl = document.getElementById('baseUrl').value;
            if (baseUrl) {
                generateQR();
            }
        });
    </script>
</body>
</html>
EOF

# Actualizar vercel.json para añadir redirect del código JUNGLE
echo "⚙️ Actualizando vercel.json..."
cat > HRkey/vercel.json << 'EOF'
{
  "version": 2,
  "framework": null,
  "installCommand": "true",
  "buildCommand": "true",
  "outputDirectory": "public",
  "cleanUrls": false,
  "trailingSlash": false,
  "redirects": [
    { "source": "/auth", "destination": "/auth.html", "permanent": false },
    { "source": "/Auth.html", "destination": "/auth.html", "permanent": false },
    { "source": "/AUTH.html", "destination": "/auth.html", "permanent": false },
    { "source": "/jungle", "destination": "/promo-register.html?promo=JUNGLE", "permanent": false }
  ],
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "Cache-Control", "value": "public, max-age=60" }
      ]
    }
  ]
}
EOF

echo ""
echo "✅ Instalación completada!"
echo ""
echo "📝 Próximos pasos:"
echo "   1. Verifica que las credenciales de Supabase en promo-register.html sean correctas"
echo "   2. Commit y push:"
echo "      git add HRkey/public/promo-register.html HRkey/public/qr-generator.html HRkey/vercel.json"
echo "      git commit -m 'feat: add JUNGLE promo QR registration system'"
echo "      git push origin main"
echo "   3. Espera el deploy automático de Vercel"
echo "   4. Accede a https://hrkey.xyz/qr-generator.html para generar tu QR"
echo ""
echo "🎯 URLs finales:"
echo "   - Registro: https://hrkey.xyz/promo-register.html?promo=JUNGLE"
echo "   - Redirect: https://hrkey.xyz/jungle (más corta)"
echo "   - Generador QR: https://hrkey.xyz/qr-generator.html"
echo ""
