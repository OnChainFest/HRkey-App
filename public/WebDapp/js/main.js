// main.js
// Servicio global con sistema de límites gasless integrado

(() => {
  const FORCE_FALLBACK = true; // ← déjalo en true hasta tener paymaster/bundler v0.7

  // ========== GASLESS TRACKER ==========
  const GaslessTracker = {
    storageKey: 'hrkey_gasless_usage',

    getUsage(referenceId) {
      const allUsage = JSON.parse(localStorage.getItem(this.storageKey) || '{}');
      return allUsage[referenceId] || {};
    },

    canUseGasless(referenceId, txType) {
      const usage = this.getUsage(referenceId);
      const typeCount = usage[txType] || 0;
      const freeTypes = ['REQUEST', 'REFERENCE', 'CLARIFICATION', 'COMPLEMENT'];
      
      if (freeTypes.includes(txType) && typeCount === 0) {
        return { eligible: true, reason: 'First time free' };
      }

      return { 
        eligible: false, 
        reason: `${txType} already used. Purchase a package to continue.`,
        usedCount: typeCount
      };
    },

    recordUsage(referenceId, txType, txHash) {
      const allUsage = JSON.parse(localStorage.getItem(this.storageKey) || '{}');
      
      if (!allUsage[referenceId]) allUsage[referenceId] = {};
      if (!allUsage[referenceId][txType]) allUsage[referenceId][txType] = 0;
      
      allUsage[referenceId][txType]++;
      allUsage[referenceId][`${txType}_last_tx`] = {
        hash: txHash,
        timestamp: new Date().toISOString()
      };

      localStorage.setItem(this.storageKey, JSON.stringify(allUsage));
      console.log(`✅ Gasless usage recorded: ${txType} for reference ${referenceId}`);
    },

    getStats(referenceId) {
      const usage = this.getUsage(referenceId);
      return {
        REQUEST: usage.REQUEST || 0,
        REFERENCE: usage.REFERENCE || 0,
        CLARIFICATION: usage.CLARIFICATION || 0,
        COMPLEMENT: usage.COMPLEMENT || 0,
        totalFreeUsed: (usage.REQUEST || 0) + (usage.REFERENCE || 0) + 
                       (usage.CLARIFICATION || 0) + (usage.COMPLEMENT || 0),
        maxFree: 4
      };
    },

    resetUsage(referenceId) {
      const allUsage = JSON.parse(localStorage.getItem(this.storageKey) || '{}');
      delete allUsage[referenceId];
      localStorage.setItem(this.storageKey, JSON.stringify(allUsage));
    }
  };

  // ========== BICONOMY SERVICE ==========
  const BiconomyService = {
    // ====== CONFIG ======
    PAYMASTER_URL: "https://paymaster.biconomy.io/api/v2/84532/2eooW_HdO.4e0c67c1-ffe3-49e0-93c7-a9938b127898",
    BUNDLER_URL: "https://bundler.biconomy.io/api/v2/84532/nJPK7B3ru.dd7f7861-190d-41bd-af80-6877f74b8f44",
    CONTRACT_ADDRESS: "0xFE79Ee969C7590467c89df9062846fb39Dbd5DCF",

    // ====== Estado ======
    smartAccount: null,
    gaslessAvailable: false,
    _PaymasterMode: null,
    tracker: GaslessTracker,

    // ====== Utilidades ======
    async ensureBaseSepolia() {
      const targetChainIdHex = "0x14A34";
      try {
        if (!window.ethereum) throw new Error("MetaMask no detectado");
        const current = await window.ethereum.request({ method: "eth_chainId" });
        if (current?.toLowerCase() !== targetChainIdHex.toLowerCase()) {
          try {
            await window.ethereum.request({
              method: "wallet_switchEthereumChain",
              params: [{ chainId: targetChainIdHex }],
            });
          } catch (switchErr) {
            if (switchErr?.code === 4902) {
              await window.ethereum.request({
                method: "wallet_addEthereumChain",
                params: [{
                  chainId: targetChainIdHex,
                  chainName: "Base Sepolia",
                  nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
                  rpcUrls: ["https://sepolia.base.org"],
                  blockExplorerUrls: ["https://sepolia.basescan.org"],
                }],
              });
            } else {
              throw switchErr;
            }
          }
        }
      } catch (e) {
        console.warn("No pude asegurar Base Sepolia:", e);
      }
    },

    buildCreateReferenceData(refId, employee, reviewer, dataHash) {
      if (typeof ethers === "undefined") {
        throw new Error("ethers v5 no está cargado en la página.");
      }
      const iface = new ethers.utils.Interface([
        "function createReference(bytes32,address,address,bytes32)",
      ]);
      return iface.encodeFunctionData("createReference", [
        refId, employee, reviewer, dataHash,
      ]);
    },

    async checkBundlerV7() {
      try {
        const r = await fetch(this.BUNDLER_URL, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "eth_supportedEntryPoints",
            params: [],
          }),
        }).then((x) => x.json());

        const eps = r?.result || [];
        const ok = Array.isArray(eps) && eps.length > 0;
        if (!ok) console.warn("Bundler no anunció entryPoints válidos:", r);
        return ok;
      } catch (e) {
        console.warn("Fallo checkBundlerV7:", e);
        return false;
      }
    },

    // ====== Inicialización ======
    async initialize() {
      if (!window.ethereum) {
        alert("Conecta MetaMask para continuar");
        return false;
      }

      await this.ensureBaseSepolia();

      if (FORCE_FALLBACK) {
        this.gaslessAvailable = false;
        console.log("[main.js] FORCE_FALLBACK activo → tx con gas normal");
        return true;
      }

      return true;
    },

    // ====== Fallback: enviar con gas normal (ethers v5) ======
    async sendWithGas(to, dataHex) {
      if (!window.ethereum) throw new Error("MetaMask no detectado");
      if (typeof window.ethers === "undefined") {
        throw new Error("ethers v5 no está cargado. Agrega el <script> de ethers en el HTML.");
      }
      const provider = new window.ethers.providers.Web3Provider(window.ethereum);
      await provider.send("eth_requestAccounts", []);
      const signer = provider.getSigner();
      const tx = await signer.sendTransaction({ to, data: dataHex, value: 0 });
      const receipt = await tx.wait();
      return receipt;
    },

    // ====== Ac