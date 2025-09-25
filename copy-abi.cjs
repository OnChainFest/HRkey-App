// copy-abi.cjs  (CJS a propósito)
const fs = require("fs");
const path = require("path");

const CONTRACT_NAME = "PeerProofRegistry";
const SRC = path.join(__dirname, "artifacts", "contracts", `${CONTRACT_NAME}.sol`, `${CONTRACT_NAME}.json`);
const DEST_DIR = path.join(__dirname, "peerproof", "src", "abi");
const DEST = path.join(DEST_DIR, `${CONTRACT_NAME}.json`);

if (!fs.existsSync(DEST_DIR)) fs.mkdirSync(DEST_DIR, { recursive: true });
fs.copyFileSync(SRC, DEST);
console.log(`✅ ABI copiado a ${DEST}`);
