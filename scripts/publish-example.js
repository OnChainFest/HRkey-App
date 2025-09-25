// scripts/publish-example.js
import "dotenv/config";
import hre from "hardhat";
import {
  JsonRpcProvider, Wallet, Contract,
  keccak256, toUtf8Bytes, concat, getAddress, getBytes
} from "ethers";

// 1) Pega aquí la dirección EXACTA que te dio el deploy
const CONTRACT_ADDRESS = "0xFE79Ee969C7590467c89df9062846fb39Dbd5DCF"; // <-- EJEMPLO, reemplázala

// 2) Validación básica (después de definirla)
if (!/^0x[a-fA-F0-9]{40}$/.test(CONTRACT_ADDRESS)) {
  throw new Error("CONTRACT_ADDRESS inválido: pega la dirección 0x del deploy");
}

function payload() {
  return {
    employeeIdHash: "0xemp...",
    category: "Engineering / Development",
    role: "Software Engineer",
    period: { start: "2024-01-01", end: "2025-06-30" },
    kpisAgreed: ["Code Quality","Collaboration","Deployment Frequency"],
    kpiScores: { "Code Quality":5, "Collaboration":4, "Deployment Frequency":4 },
    reviewerIdHash: "0xrev...",
    notesHash: "0x0"
  };
}
const canon = (o)=> JSON.stringify(o);

async function main() {
  const rpc = process.env.BASE_SEPOLIA_RPC_URL;
  const pk  = process.env.PRIVATE_KEY;
  if (!rpc || !pk) throw new Error("Falta BASE_SEPOLIA_RPC_URL o PRIVATE_KEY en .env");

  const provider = new JsonRpcProvider(rpc);
  const wallet   = new Wallet(pk, provider);

  // ABI de artifacts de Hardhat
  const artifact = await hre.artifacts.readArtifact("PeerProofRegistry");
  const c = new Contract(CONTRACT_ADDRESS, artifact.abi, wallet);

  const employee = await wallet.getAddress();
  const reviewer = getAddress("0x0000000000000000000000000000000000000000");

  const dataHash = keccak256(toUtf8Bytes(canon(payload())));
  const salt     = keccak256(toUtf8Bytes(Date.now().toString()));
  const refId    = keccak256(concat([getBytes(employee), getBytes(dataHash), getBytes(salt)]));

  const tx = await c.createReference(refId, employee, reviewer, dataHash);
  const rc = await tx.wait();
  console.log({ refId, dataHash, txHash: rc.hash });
}

main().catch(e => { console.error(e); process.exit(1); });
