"use client";
import { useState } from "react";
import { getContract } from "@/lib/contract";
import { supabase } from "@/lib/supabaseClient";
import { id as keccak256 } from "ethers"; // ethers v6

export default function CreateRefButton() {
  const [account, setAccount] = useState("");
  const [loading, setLoading] = useState(false);

  // --- Conectar wallet (forzando MetaMask si hay varias extensiones) ---
  async function connect() {
    try {
      const eth = window.ethereum?.providers
        ? window.ethereum.providers.find((p) => p.isMetaMask) ?? window.ethereum.providers[0]
        : window.ethereum;

      if (!eth) throw new Error("No se encontró una wallet inyectada.");

      let accounts = await eth.request({ method: "eth_accounts" });
      if (!accounts || accounts.length === 0) {
        accounts = await eth.request({ method: "eth_requestAccounts" });
      }
      setAccount(accounts[0]);

      try {
        await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x14A34" }] });
      } catch (e) {
        if (e?.code === 4902) {
          await eth.request({
            method: "wallet_addEthereumChain",
            params: [{
              chainId: "0x14A34",
              chainName: "Base Sepolia",
              rpcUrls: ["https://sepolia.base.org"],
              blockExplorerUrls: ["https://sepolia.basescan.org"],
              nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
            }],
          });
        } else if (e?.code !== 4001) {
          throw e;
        }
      }
    } catch (e) {
      const msg = e?.code === 4001 ? "Conexión rechazada en la wallet" : (e?.message || "Failed to connect to MetaMask");
      alert(msg);
      console.error(e);
    }
  }

  // --- Enviar tx detectando overloads y generando refId no nulo ---
  async function run() {
    if (!account) {
      alert("Conectá la wallet primero");
      return;
    }
    setLoading(true);
    try {
      const contract = await getContract(true);
      const iface = contract.interface;

      // Listado de funciones (ethers v6)
      const allFns = [];
      iface.forEachFunction((f) => allFns.push(f));

      // Tomamos una función "write" que probablemente cree/registe referencias
      const writeFns = allFns.filter((f) => f.stateMutability !== "view" && f.stateMutability !== "pure");
      let target =
        writeFns.find((f) => f.name === "createReference") ||
        writeFns.find((f) => /create|register|add/i.test(f.name)) ||
        writeFns[0]; // fallback

      if (!target) {
        console.log("No hay funciones write. Todas las funciones:", allFns.map((f) => f.format()));
        alert("No encontré una función 'write' adecuada. Mirá la consola (F12) para ver las disponibles.");
        return;
      }

      // Firma exacta (para resolver overloads)
      const signature = `${target.name}(${target.inputs.map((i) => i.type).join(",")})`;

      // Preparamos argumentos:
      const cid = "ipfs://ejemplo-cid";
      const zero32 = "0x" + "0".repeat(64);

      const argForInput = (inp) => {
        const t = inp.type;
        const name = (inp.name || "").toLowerCase();
        const base = t.replace(/\[\]$/, "");

        // Si parece un refId/id bytes32 => usamos hash != 0
        if (base === "bytes32" && /ref|id/.test(name)) return keccak256(cid);

        switch (base) {
          case "address": return account;
          case "string": return cid;
          case "bytes32": return keccak256(cid); // evita 0x00…00
          case "bytes": return "0x";
          case "bool": return true;
          case "uint256":
          case "uint128":
          case "uint64":
          case "uint32":
          case "uint16":
          case "uint8":
          case "int256":
          case "int128":
          case "int64":
          case "int32":
          case "int16":
          case "int8": return 0;
          default: return cid; // fallback seguro
        }
      };

      const args = target.inputs.map(argForInput);

      console.log("Llamando:", signature, "args:", args);
      const tx = await contract[signature](...args);
      const receipt = await tx.wait();
      const txHash = receipt?.hash ?? tx.hash;

      // (opcional) persistimos en Supabase (no bloqueante)
      try {
        await supabase.from("references").insert({
          cid,
          tx_hash: txHash,
          address: account || null,
          created_at: new Date().toISOString(),
        });
      } catch (dbErr) {
        console.warn("Insert en Supabase falló:", dbErr?.message || dbErr);
      }

      alert(`✅ Tx enviada: ${txHash.slice(0, 12)}…`);
      window.open(`https://sepolia.basescan.org/tx/${txHash}`, "_blank");
    } catch (e) {
      const code = e?.code ?? e?.error?.code;
      if (code === 4001) {
        alert("Firma cancelada en la wallet.");
      } else if (String(e?.message || "").includes("insufficient funds")) {
        alert("Tu cuenta en Base Sepolia no tiene ETH de test.");
      } else {
        alert(e?.shortMessage || e?.message || "Error on-chain");
      }
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-4">
      <button onClick={connect} className="px-4 py-2 rounded-xl border shadow">
        {account ? `Conectado: ${account.slice(0,6)}…${account.slice(-4)}` : "Conectar wallet"}
      </button>
      <button
        onClick={run}
        disabled={loading || !account}
        className="px-4 py-2 rounded-xl border shadow disabled:opacity-60"
      >
        {loading ? "Firmando…" : "Crear referencia"}
      </button>
    </div>
  );
}
