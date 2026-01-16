// WebDapp/js/wallet-connector.js
// Unified wallet authentication supporting MetaMask, Coinbase Wallet, and WalletConnect

import { ethers } from "https://cdn.jsdelivr.net/npm/ethers@6.6.0/dist/ethers.min.js";

const CHAIN_ID = 8453; // Base mainnet (84532 = Base Sepolia)
const BASE_CHAIN_CONFIG = {
  chainId: "0x2105", // 8453 in hex
  chainName: "Base",
  nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
  rpcUrls: ["https://mainnet.base.org"],
  blockExplorerUrls: ["https://basescan.org"]
};

// ===== UTILITY: Ensure Base Network =====
async function ensureBaseNetwork(provider) {
  try {
    const network = await provider.getNetwork();
    if (Number(network.chainId) === CHAIN_ID) {
      return true; // Already on Base
    }

    // Try to switch to Base
    if (window.ethereum?.request) {
      try {
        await window.ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: BASE_CHAIN_CONFIG.chainId }],
        });
        return true;
      } catch (switchError) {
        // If chain not added, try to add it
        if (switchError?.code === 4902) {
          await window.ethereum.request({
            method: "wallet_addEthereumChain",
            params: [BASE_CHAIN_CONFIG],
          });
          return true;
        }
        throw switchError;
      }
    }
    return false;
  } catch (err) {
    console.error("Failed to switch to Base network:", err);
    throw new Error("Please switch to Base network manually");
  }
}

// ===== UTILITY: Save User Data =====
function saveUserData(address, walletType, refereeInfo) {
  const userData = {
    name: `${walletType} User`,
    email: `${address.slice(0, 6)}...${address.slice(-4)}@wallet.xyz`,
    wallet: address,
    walletType: walletType,
    authenticated: true,
    loginDate: new Date().toISOString(),
    source: refereeInfo ? `referee_conversion_${walletType.toLowerCase()}` : `direct_signup_${walletType.toLowerCase()}`
  };

  localStorage.setItem("hrkey_user_data", JSON.stringify(userData));
  localStorage.setItem("hrkey_user_plan", JSON.stringify({
    plan: "free",
    features: { maxReferences: 1, canUseBlockchain: false, canExportPDF: false },
    usage: { referencesUsed: 0 }
  }));

  console.log(`✅ ${walletType} authenticated:`, address);
  return userData;
}

// ===== METAMASK CONNECTION =====
export async function connectMetaMask(refereeInfo) {
  try {
    if (!window.ethereum) {
      throw new Error("MetaMask is not installed. Please install MetaMask extension.");
    }

    // Connect to MetaMask
    const provider = new ethers.BrowserProvider(window.ethereum);
    await provider.send("eth_requestAccounts", []);
    const signer = await provider.getSigner();
    const address = (await signer.getAddress()).toLowerCase();

    // Ensure Base network
    await ensureBaseNetwork(provider);

    // Verify we're on Base
    const network = await provider.getNetwork();
    if (Number(network.chainId) !== CHAIN_ID) {
      throw new Error("Please switch to Base network (8453) in MetaMask");
    }

    // Save user data
    saveUserData(address, "MetaMask", refereeInfo);

    // Redirect to dashboard
    window.location.replace("/WebDapp/app.html");
  } catch (err) {
    console.error("MetaMask connection error:", err);
    throw err;
  }
}

// ===== COINBASE WALLET CONNECTION =====
export async function connectCoinbaseWallet(refereeInfo) {
  try {
    // Load Coinbase Wallet SDK dynamically
    const CoinbaseWalletSDK = (await import("https://esm.sh/@coinbase/wallet-sdk@3.9.3")).default;

    // Initialize Coinbase Wallet
    const coinbaseWallet = new CoinbaseWalletSDK({
      appName: "HRKey",
      appLogoUrl: "https://hrkey.xyz/images/favicon.ico",
      darkMode: false
    });

    // Create WalletProvider for Base network
    const ethereum = coinbaseWallet.makeWeb3Provider(
      BASE_CHAIN_CONFIG.rpcUrls[0],
      CHAIN_ID
    );

    // Request accounts
    const accounts = await ethereum.request({
      method: "eth_requestAccounts"
    });

    if (!accounts || accounts.length === 0) {
      throw new Error("No accounts found in Coinbase Wallet");
    }

    const address = accounts[0].toLowerCase();

    // Create provider to verify network
    const provider = new ethers.BrowserProvider(ethereum);
    const network = await provider.getNetwork();

    // Coinbase Wallet SDK should already be on Base, but verify
    if (Number(network.chainId) !== CHAIN_ID) {
      console.warn(`Coinbase Wallet on chain ${network.chainId}, expected ${CHAIN_ID}`);
      // Try to switch
      try {
        await ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: BASE_CHAIN_CONFIG.chainId }],
        });
      } catch (switchError) {
        if (switchError?.code === 4902) {
          await ethereum.request({
            method: "wallet_addEthereumChain",
            params: [BASE_CHAIN_CONFIG],
          });
        }
      }
    }

    // Save user data
    saveUserData(address, "CoinbaseWallet", refereeInfo);

    // Redirect to dashboard
    window.location.replace("/WebDapp/app.html");
  } catch (err) {
    console.error("Coinbase Wallet connection error:", err);
    throw new Error("Failed to connect with Coinbase Wallet: " + (err?.message || "Unknown error"));
  }
}

// ===== WALLETCONNECT CONNECTION =====
export async function connectWalletConnect(refereeInfo) {
  try {
    // Load WalletConnect v2
    const { EthereumProvider } = await import("https://esm.sh/@walletconnect/ethereum-provider@2.13.0");

    // Initialize WalletConnect
    const provider = await EthereumProvider.init({
      projectId: "f4c8f5f8a4c8c4f4c8f5f8a4c8c4f4c8", // Replace with your WalletConnect project ID
      chains: [CHAIN_ID], // Base mainnet
      showQrModal: true,
      metadata: {
        name: "HRKey",
        description: "Build your verified professional profile on Base blockchain",
        url: "https://hrkey.xyz",
        icons: ["https://hrkey.xyz/images/favicon.ico"]
      }
    });

    // Enable session (shows QR modal)
    const accounts = await provider.enable();

    if (!accounts || accounts.length === 0) {
      throw new Error("No accounts connected via WalletConnect");
    }

    const address = accounts[0].toLowerCase();

    // Create ethers provider
    const ethersProvider = new ethers.BrowserProvider(provider);
    const network = await ethersProvider.getNetwork();

    // Verify we're on Base
    if (Number(network.chainId) !== CHAIN_ID) {
      console.warn(`WalletConnect on chain ${network.chainId}, requesting switch to Base`);
      try {
        await provider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: BASE_CHAIN_CONFIG.chainId }],
        });
      } catch (switchError) {
        if (switchError?.code === 4902) {
          await provider.request({
            method: "wallet_addEthereumChain",
            params: [BASE_CHAIN_CONFIG],
          });
        }
      }
    }

    // Save user data
    saveUserData(address, "WalletConnect", refereeInfo);

    // Redirect to dashboard
    window.location.replace("/WebDapp/app.html");
  } catch (err) {
    console.error("WalletConnect connection error:", err);

    // Handle user rejection gracefully
    if (err?.message?.includes("User rejected") || err?.message?.includes("User closed modal")) {
      throw new Error("Connection cancelled by user");
    }

    throw new Error("Failed to connect with WalletConnect: " + (err?.message || "Unknown error"));
  }
}

// ===== EXPORT ALL =====
export default {
  connectMetaMask,
  connectCoinbaseWallet,
  connectWalletConnect
};
