#!/bin/bash

# HRKey Deployment Script
# Este script ayuda a deployar la aplicación paso a paso

set -e

echo "🚀 HRKey Deployment Helper"
echo "=========================="
echo ""

# Colores para output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Función para preguntar si/no
confirm() {
    read -p "$1 (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        return 0
    else
        return 1
    fi
}

# 1. Verificar que estamos en el directorio correcto
if [ ! -d "HRkey" ] || [ ! -f "DEPLOYMENT.md" ]; then
    echo -e "${RED}❌ Error: Ejecuta este script desde el directorio raíz del proyecto${NC}"
    exit 1
fi

echo "📁 Directorio correcto detectado"
echo ""

# 2. Verificar que el build funciona
echo "🔨 Paso 1: Verificando build local..."
if confirm "¿Quieres verificar que el build funciona localmente?"; then
    cd HRkey
    echo "Instalando dependencias..."
    npm install
    echo "Compilando para producción..."
    npm run build
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ Build exitoso!${NC}"
    else
        echo -e "${RED}❌ Build falló. Revisa los errores arriba.${NC}"
        exit 1
    fi
    cd ..
fi
echo ""

# 3. Verificar variables de entorno
echo "🔐 Paso 2: Variables de Entorno"
echo "Has configurado las variables de entorno? Revisa:"
echo "  - HRkey/.env.example"
echo "  - backend/.env.example"
echo "  - .env.example (para Hardhat)"
echo ""
if ! confirm "¿Ya configuraste todas las variables de entorno necesarias?"; then
    echo -e "${YELLOW}⚠️  Por favor configura las variables de entorno antes de continuar${NC}"
    echo "Lee DEPLOYMENT.md para más detalles"
    exit 1
fi
echo ""

# 4. Commit y push
echo "📝 Paso 3: Git"
if confirm "¿Quieres hacer commit de los cambios?"; then
    git status
    echo ""
    read -p "Mensaje del commit: " commit_msg
    git add -A
    git commit -m "$commit_msg" || echo "No hay cambios para commitear"

    if confirm "¿Quieres hacer push?"; then
        current_branch=$(git branch --show-current)
        git push -u origin "$current_branch"
        echo -e "${GREEN}✅ Push exitoso!${NC}"
    fi
fi
echo ""

# 5. Deployment
echo "🚀 Paso 4: Deployment"
echo ""
echo "Opciones de deployment:"
echo "  1. Vercel (Frontend Next.js)"
echo "  2. Backend separado"
echo "  3. Ambos"
echo ""

read -p "Selecciona una opción (1-3): " deploy_option

case $deploy_option in
    1)
        echo "Deploying Frontend a Vercel..."
        cd HRkey
        if command -v vercel &> /dev/null; then
            vercel --prod
        else
            echo -e "${YELLOW}⚠️  Vercel CLI no está instalado${NC}"
            echo "Instálalo con: npm install -g vercel"
            echo "O usa la web: https://vercel.com/new"
        fi
        cd ..
        ;;
    2)
        echo "Deploying Backend..."
        cd backend
        if command -v vercel &> /dev/null; then
            vercel --prod
        else
            echo -e "${YELLOW}⚠️  Vercel CLI no está instalado${NC}"
            echo "Instálalo con: npm install -g vercel"
            echo "O despliega en Railway/Render manualmente"
        fi
        cd ..
        ;;
    3)
        echo "Deploying todo..."
        echo "1. Frontend..."
        cd HRkey
        if command -v vercel &> /dev/null; then
            vercel --prod
        fi
        cd ..

        echo "2. Backend..."
        cd backend
        if command -v vercel &> /dev/null; then
            vercel --prod
        fi
        cd ..
        ;;
    *)
        echo "Opción inválida"
        exit 1
        ;;
esac

echo ""
echo -e "${GREEN}✨ Deployment completado!${NC}"
echo ""
echo "Próximos pasos:"
echo "  1. Verifica tu deployment en Vercel Dashboard"
echo "  2. Configura el webhook de Stripe"
echo "  3. Verifica que todas las rutas funcionen"
echo "  4. Configura tu dominio personalizado (opcional)"
echo ""
echo "📖 Para más detalles, lee DEPLOYMENT.md"
