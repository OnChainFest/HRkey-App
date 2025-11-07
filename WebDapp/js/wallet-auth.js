// WebDapp/js/wallet-auth.js
import { ethers } from "https://cdn.jsdelivr.net/npm/ethers@6.6.0/dist/ethers.min.js";
import { SiweMessage } from "https://esm.sh/siwe@2.3.2";

const ENDPOINT = "https://wrervcygdrlcndtjboy.supabase.co/functions/v1/siwe-verify";
const DOMAIN   = "hrkey.xyz";   // Ajusta si usas subdominios (p.ej. "www.hrkey.xyz")
const CHAIN_ID = 8453;          // Base mainnet (84532 = Base Sepolia)

// Utilidad: cambia a Base si el usuario está en otra red
async function ensureBaseNetwork() {
  if (!window.ethereum?.request) return;
  try {
    // Intenta cambiar a Base mainnet
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0x2105" }], // 8453 en hex
    });
  } catch (err) {
    // Si no la tiene, intenta agregarla
    if (err?.code === 4902) {
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId: "0x2105",
          chainName: "Base",
          nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
          rpcUrls: ["https://mainnet.base.org"],
          blockExplorerUrls: ["https://basescan.org"]
        }],
      });
    } else {
      throw err;
    }
  }
}

async function signInWithEthereum() {
  try {
    if (!window.ethereum) {
      alert("Instala MetaMask o una wallet compatible.");
      return;
    }

    // Conectar wallet
    const provider = new ethers.BrowserProvider(window.ethereum);
    await provider.send("eth_requestAccounts", []);
    const signer  = await provider.getSigner();
    const address = (await signer.getAddress()).toLowerCase();

    // Asegurar Base mainnet
    await ensureBaseNetwork();
    const net = await provider.getNetwork();
    if (Number(net.chainId) !== CHAIN_ID) {
      alert("Cambia a Base mainnet (8453) para continuar.");
      return;
    }

    // Construir mensaje SIWE
    const siwe = new SiweMessage({
      domain: DOMAIN,
      address,
      statement: "Sign in to HRKey with your wallet",
      uri: "https://hrkey.xyz", // URL pública de la app
      version: "1",
      chainId: CHAIN_ID,
      // Opcional:
      // nonce: crypto.randomUUID().replace(/-/g, '').slice(0,16),
      // issuedAt: new Date().toISOString(),
    });
    const message   = siwe.prepareMessage();

    // Firmar
    const signature = await signer.signMessage(message);

    // Enviar a tu Edge Function
    const resp = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, signature, address }),
    });

    let out;
    try {
      out = await resp.json();
    } catch {
      throw new Error("Respuesta inválida del servidor");
    }
    if (!resp.ok || !out?.success) {
      throw new Error(out?.error || "Verification failed");
    }

    // out.session puede traer access_token y refresh_token creados por el backend
    if (window.supabase?.auth?.setSession && out.session?.access_token && out.session?.refresh_token) {
      const { error } = await window.supabase.auth.setSession({
        access_token: out.session.access_token,
        refresh_token: out.session.refresh_token,
      });
      if (error) console.error("setSession error:", error);
    } else if (out.session) {
      // Fallback: guarda la sesión por si la necesitas luego
      localStorage.setItem("hrkey_session", JSON.stringify(out.session));
    }

    // ✅ Redirige SIEMPRE al dashboard
    window.location.replace("/app.html");

  } catch (err) {
    console.error("SIWE login error:", err);
    alert("Error: " + (err?.message || "No se pudo iniciar sesión"));
  }
}

// Enlazar botón
document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("wallet-login-btn");
  if (btn) btn.addEventListener("click", signInWithEthereum);
});

