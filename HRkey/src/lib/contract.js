"use client";
import { BrowserProvider, Contract } from "ethers";
import abi from "../abi/HRKeyRegistry.json"; // <-- ABI correcto copiado al front

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS;
const BASE_SEPOLIA_ID = Number(process.env.NEXT_PUBLIC_BASE_SEPOLIA_ID || 84532);

// --- helpers ---
function pickInjectedProvider() {
  const eth = globalThis.window?.ethereum;
  if (!eth) return null;
  if (Array.isArray(eth.providers) && eth.providers.length) {
    const metamask = eth.providers.find((p) => p.isMetaMask);
    const coinbase = eth.providers.find((p) => p.isCoinbaseWallet);
    const phantom = eth.providers.find((p) => p.isPhantom);
    return metamask ?? coinbase ?? phantom ?? eth.providers[0];
  }
  return eth;
}

function ensureEnv() {
  if (!CONTRACT_ADDRESS) throw new Error("Falta NEXT_PUBLIC_CONTRACT_ADDRESS en .env.local");
  if (!BASE_SEPOLIA_ID) throw new Error("Falta NEXT_PUBLIC_BASE_SEPOLIA_ID en .env.local");
}

export async function getProvider() {
  const injected = pickInjectedProvider();
  if (!injected) throw new Error("No se encontró wallet. Instala MetaMask.");
  return new BrowserProvider(injected);
}

export async function switchToBaseSepolia(injected) {
  try {
    await injected.request?.({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0x14A34" }], // 84532
    });
  } catch (e) {
    if (e?.code === 4902) {
      await injected.request?.({
        method: "wallet_addEthereumChain",
        params: [{
          chainId: "0x14A34",
          chainName: "Base Sepolia",
          nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
          rpcUrls: ["https://sepolia.base.org"],
          blockExplorerUrls: ["https://sepolia.basescan.org"],
        }],
      });
    } else {
      throw e;
    }
  }
}

export async function getSigner() {
  const injected = pickInjectedProvider();
  if (!injected) throw new Error("No se encontró wallet. Instala MetaMask.");
  await injected.request?.({ method: "eth_requestAccounts" });
  await switchToBaseSepolia(injected);
  const provider = new BrowserProvider(injected);
  return provider.getSigner();
}

export async function getContract(withSigner = false) {
  ensureEnv();
  const injected = pickInjectedProvider();
  if (!injected) throw new Error("No se encontró wallet. Instala MetaMask.");
  const provider = new BrowserProvider(injected);
  try {
    const net = await provider.getNetwork();
    if (Number(net.chainId) !== BASE_SEPOLIA_ID) {
      await switchToBaseSepolia(injected);
    }
  } catch {}
  const signer = withSigner ? await getSigner() : undefined;
  return new Contract(CONTRACT_ADDRESS, abi.abi, signer ?? provider);
}
