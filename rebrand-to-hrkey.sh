#!/bin/bash

# Script de Rebranding: PeerProof → HRKey
# Ejecutar en GitBash desde la raíz del proyecto

echo "🔄 Iniciando rebranding de PeerProof a HRKey..."
echo ""

# Colores para output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Contador de archivos modificados
count=0

# Función para reemplazar en archivos
replace_in_files() {
    local search=$1
    local replace=$2
    local file_patterns=$3
    
    echo -e "${BLUE}Buscando '$search' en archivos $file_patterns...${NC}"
    
    # Buscar y reemplazar en archivos (excluyendo node_modules, .git, etc.)
    find . -type f \( -name "$file_patterns" \) \
        ! -path "*/node_modules/*" \
        ! -path "*/.git/*" \
        ! -path "*/.next/*" \
        ! -path "*/build/*" \
        ! -path "*/dist/*" \
        -exec grep -l "$search" {} \; | while read file; do
        
        # Hacer backup del archivo
        cp "$file" "$file.backup"
        
        # Reemplazar en el archivo
        sed -i "s/$search/$replace/g" "$file"
        
        echo -e "${GREEN}✓ Modificado: $file${NC}"
        ((count++))
        
        # Eliminar backup si el reemplazo fue exitoso
        rm "$file.backup"
    done
}

# 1. Reemplazar "PeerProof" (con mayúsculas)
echo -e "\n${YELLOW}═══════════════════════════════════════${NC}"
echo -e "${YELLOW}Paso 1: Reemplazando 'PeerProof' → 'HRKey'${NC}"
echo -e "${YELLOW}═══════════════════════════════════════${NC}\n"

replace_in_files "PeerProof" "HRKey" "*.js"
replace_in_files "PeerProof" "HRKey" "*.jsx"
replace_in_files "PeerProof" "HRKey" "*.ts"
replace_in_files "PeerProof" "HRKey" "*.tsx"
replace_in_files "PeerProof" "HRKey" "*.html"
replace_in_files "PeerProof" "HRKey" "*.css"
replace_in_files "PeerProof" "HRKey" "*.json"
replace_in_files "PeerProof" "HRKey" "*.md"

# 2. Reemplazar "peerproof" (todo en minúsculas)
echo -e "\n${YELLOW}═══════════════════════════════════════${NC}"
echo -e "${YELLOW}Paso 2: Reemplazando 'peerproof' → 'hrkey'${NC}"
echo -e "${YELLOW}═══════════════════════════════════════${NC}\n"

replace_in_files "peerproof" "hrkey" "*.js"
replace_in_files "peerproof" "hrkey" "*.jsx"
replace_in_files "peerproof" "hrkey" "*.ts"
replace_in_files "peerproof" "hrkey" "*.tsx"
replace_in_files "peerproof" "hrkey" "*.html"
replace_in_files "peerproof" "hrkey" "*.css"
replace_in_files "peerproof" "hrkey" "*.json"

# 3. Reemplazar "Peer Proof" (con espacio)
echo -e "\n${YELLOW}═══════════════════════════════════════${NC}"
echo -e "${YELLOW}Paso 3: Reemplazando 'Peer Proof' → 'HRKey'${NC}"
echo -e "${YELLOW}═══════════════════════════════════════${NC}\n"

replace_in_files "Peer Proof" "HRKey" "*.js"
replace_in_files "Peer Proof" "HRKey" "*.jsx"
replace_in_files "Peer Proof" "HRKey" "*.ts"
replace_in_files "Peer Proof" "HRKey" "*.tsx"
replace_in_files "Peer Proof" "HRKey" "*.html"
replace_in_files "Peer Proof" "HRKey" "*.md"

# 4. Reemplazar "peer-proof" (con guión)
echo -e "\n${YELLOW}═══════════════════════════════════════${NC}"
echo -e "${YELLOW}Paso 4: Reemplazando 'peer-proof' → 'hrkey'${NC}"
echo -e "${YELLOW}═══════════════════════════════════════${NC}\n"

replace_in_files "peer-proof" "hrkey" "*.js"
replace_in_files "peer-proof" "hrkey" "*.jsx"
replace_in_files "peer-proof" "hrkey" "*.ts"
replace_in_files "peer-proof" "hrkey" "*.tsx"
replace_in_files "peer-proof" "hrkey" "*.html"
replace_in_files "peer-proof" "hrkey" "*.css"
replace_in_files "peer-proof" "hrkey" "*.json"

# 5. Actualizar package.json name
echo -e "\n${YELLOW}═══════════════════════════════════════${NC}"
echo -e "${YELLOW}Paso 5: Actualizando package.json${NC}"
echo -e "${YELLOW}═══════════════════════════════════════${NC}\n"

if [ -f "package.json" ]; then
    cp package.json package.json.backup
    sed -i 's/"name": "peerproof"/"name": "hrkey"/g' package.json
    sed -i 's/"name": "peer-proof"/"name": "hrkey"/g' package.json
    echo -e "${GREEN}✓ package.json actualizado${NC}"
    rm package.json.backup
fi

# 6. Actualizar README.md
echo -e "\n${YELLOW}═══════════════════════════════════════${NC}"
echo -e "${YELLOW}Paso 6: Actualizando README.md${NC}"
echo -e "${YELLOW}═══════════════════════════════════════${NC}\n"

if [ -f "README.md" ]; then
    cp README.md README.md.backup
    sed -i 's/PeerProof/HRKey/g' README.md
    sed -i 's/Peer Proof/HRKey/g' README.md
    echo -e "${GREEN}✓ README.md actualizado${NC}"
    rm README.md.backup
fi

# 7. Buscar archivos que necesiten atención manual
echo -e "\n${YELLOW}═══════════════════════════════════════${NC}"
echo -e "${YELLOW}Paso 7: Archivos que requieren revisión manual${NC}"
echo -e "${YELLOW}═══════════════════════════════════════${NC}\n"

echo "Buscando referencias restantes..."
grep -r "PeerProof\|peerproof\|Peer Proof\|peer-proof" . \
    --exclude-dir=node_modules \
    --exclude-dir=.git \
    --exclude-dir=.next \
    --exclude-dir=build \
    --exclude-dir=dist \
    --exclude="*.sh" \
    2>/dev/null | head -20

# Resumen final
echo -e "\n${GREEN}═══════════════════════════════════════${NC}"
echo -e "${GREEN}✅ Rebranding completado!${NC}"
echo -e "${GREEN}═══════════════════════════════════════${NC}\n"

echo -e "📊 ${BLUE}Estadísticas:${NC}"
echo -e "   • Archivos modificados: $count"
echo ""
echo -e "📝 ${YELLOW}Próximos pasos:${NC}"
echo -e "   1. Revisa los archivos modificados con 'git diff'"
echo -e "   2. Actualiza manualmente los logos/imágenes"
echo -e "   3. Actualiza favicon y assets"
echo -e "   4. Revisa el archivo .env para URLs que contengan 'peerproof'"
echo -e "   5. Prueba la aplicación: npm run dev"
echo ""
echo -e "${BLUE}Para deshacer los cambios (si es necesario):${NC}"
echo -e "   git checkout ."
echo ""
