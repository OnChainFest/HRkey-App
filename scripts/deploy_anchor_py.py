#!/usr/bin/env python3
"""
Standalone Python deployment script for ReferenceAnchor.
Used when node_modules are not installed (CI bootstrap scenario).
Reads compiled artifact from artifacts/ and deploys via raw JSON-RPC.
"""
import json, os, sys, time, subprocess, urllib.request, hashlib

def rpc(url, method, params=None):
    body = json.dumps({"jsonrpc":"2.0","method":method,"params":params or [],"id":1}).encode()
    req  = urllib.request.Request(url, data=body, headers={"Content-Type":"application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        data = json.loads(r.read())
    if "error" in data:
        raise RuntimeError(f"RPC error: {data['error']}")
    return data["result"]

# ── tiny secp256k1 / keccak / rlp primitives using eth_account if available ──
try:
    from eth_account import Account
    from eth_account.signers.local import LocalAccount
    HAS_ETH_ACCOUNT = True
except ImportError:
    HAS_ETH_ACCOUNT = False

def keccak256(data: bytes) -> bytes:
    from Crypto.Hash import keccak
    k = keccak.new(digest_bits=256)
    k.update(data)
    return k.digest()

# ── rlp encoding (minimal, sufficient for legacy txs) ─────────────────────────
def rlp_encode(item):
    if isinstance(item, (bytes, bytearray)):
        b = bytes(item)
        if len(b) == 1 and b[0] < 0x80:
            return b
        prefix = rlp_length_prefix(len(b), 0x80)
        return prefix + b
    elif isinstance(item, list):
        encoded = b"".join(rlp_encode(i) for i in item)
        prefix = rlp_length_prefix(len(encoded), 0xc0)
        return prefix + encoded
    raise TypeError(type(item))

def rlp_length_prefix(length, offset):
    if length < 56:
        return bytes([offset + length])
    len_bytes = length.to_bytes((length.bit_length() + 7) // 8, "big")
    return bytes([offset + 55 + len(len_bytes)]) + len_bytes

def int_to_bytes(n: int) -> bytes:
    if n == 0:
        return b""
    return n.to_bytes((n.bit_length() + 7) // 8, "big")

NETWORKS = {
    "coston2":    {"chainId": 114,      "rpcEnvKey": "COSTON2_RPC_URL",     "defaultRpc": "https://coston2-api.flare.network/ext/bc/C/rpc"},
    "baseSepolia":{"chainId": 84532,    "rpcEnvKey": "BASE_SEPOLIA_RPC_URL", "defaultRpc": "https://sepolia.base.org"},
    "opSepolia":  {"chainId": 11155420, "rpcEnvKey": "OP_SEPOLIA_RPC_URL",   "defaultRpc": "https://sepolia.optimism.io"},
}

def get_git_short():
    try:
        return subprocess.check_output(["git","rev-parse","--short","HEAD"], cwd=os.getcwd()).decode().strip()
    except Exception:
        return "unknown"

def deploy(network_name: str, private_key: str):
    meta = NETWORKS[network_name]
    chain_id = meta["chainId"]
    rpc_url  = os.environ.get(meta["rpcEnvKey"]) or meta["defaultRpc"]

    print(f"\n=== ReferenceAnchor Deployment ===")
    print(f"Network  : {network_name}")
    print(f"Chain ID : {chain_id}")
    print(f"RPC      : {rpc_url}")

    # Load artifact
    artifact_path = os.path.join(os.getcwd(), "artifacts","contracts","ReferenceAnchor.sol","ReferenceAnchor.json")
    with open(artifact_path) as f:
        artifact = json.load(f)
    bytecode = artifact["bytecode"]  # 0x-prefixed

    # Use eth_account for signing (it's a dependency of py-solc-x transitive deps)
    from eth_account import Account
    acct = Account.from_key(private_key)
    deployer_addr = acct.address
    print(f"Deployer : {deployer_addr}")

    # Get nonce and gas price
    nonce     = int(rpc(rpc_url, "eth_getTransactionCount", [deployer_addr, "latest"]), 16)
    gas_price = int(rpc(rpc_url, "eth_gasPrice"), 16)
    # Estimate gas
    gas_est   = int(rpc(rpc_url, "eth_estimateGas", [{"from": deployer_addr, "data": bytecode}]), 16)
    gas_limit = int(gas_est * 1.2)

    # Sign and send deployment transaction
    tx = {
        "nonce":    nonce,
        "gasPrice": gas_price,
        "gas":      gas_limit,
        "to":       "",          # contract creation
        "value":    0,
        "data":     bytecode,
        "chainId":  chain_id,
    }

    print(f"\nDeploying ReferenceAnchor...")
    signed = acct.sign_transaction(tx)
    tx_hash = rpc(rpc_url, "eth_sendRawTransaction", [signed.raw_transaction.hex()])
    print(f"Tx hash  : {tx_hash}")
    print("Waiting for confirmation...")

    # Poll for receipt
    receipt = None
    for _ in range(120):
        time.sleep(2)
        try:
            receipt = rpc(rpc_url, "eth_getTransactionReceipt", [tx_hash])
            if receipt:
                break
        except Exception:
            pass

    if not receipt:
        raise RuntimeError(f"Timed out waiting for receipt: {tx_hash}")
    if int(receipt["status"], 16) != 1:
        raise RuntimeError(f"Deployment tx failed: {tx_hash}")

    address    = receipt["contractAddress"]
    block_num  = int(receipt["blockNumber"], 16)
    deployed_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    commit     = get_git_short()

    print(f"\n✅ ReferenceAnchor deployed!")
    print(f"Address  : {address}")
    print(f"Block    : {block_num}")
    print(f"Deployed : {deployed_at}")
    print(f"Commit   : {commit}")

    # ── Smoke anchor ──────────────────────────────────────────────────────────
    TEST_HASH = "0xdeadbeef00000000000000000000000000000000000000000000000000c0ffee"
    print(f"\n--- Post-deploy smoke anchor ---")
    print(f"Test hash: {TEST_HASH}")

    # Encode anchorReference(bytes32) call: selector + padded arg
    from eth_hash.auto import keccak as _keccak
    selector = _keccak(b"anchorReference(bytes32)")[:4]
    arg = bytes.fromhex(TEST_HASH[2:])  # already 32 bytes
    calldata = "0x" + selector.hex() + arg.hex()

    nonce2     = int(rpc(rpc_url, "eth_getTransactionCount", [deployer_addr, "latest"]), 16)
    gas_est2   = int(rpc(rpc_url, "eth_estimateGas", [{"from": deployer_addr, "to": address, "data": calldata}]), 16)
    gas_limit2 = int(gas_est2 * 1.2)

    tx2 = {
        "nonce":    nonce2,
        "gasPrice": gas_price,
        "gas":      gas_limit2,
        "to":       address,
        "value":    0,
        "data":     calldata,
        "chainId":  chain_id,
    }
    signed2  = acct.sign_transaction(tx2)
    tx_hash2 = rpc(rpc_url, "eth_sendRawTransaction", [signed2.raw_transaction.hex()])
    print(f"Anchor tx: {tx_hash2}")
    print("Waiting for confirmation...")

    receipt2 = None
    for _ in range(120):
        time.sleep(2)
        try:
            receipt2 = rpc(rpc_url, "eth_getTransactionReceipt", [tx_hash2])
            if receipt2:
                break
        except Exception:
            pass

    if not receipt2 or int(receipt2["status"], 16) != 1:
        print("⚠️  Smoke anchor failed or timed out")
    else:
        print(f"✅ Smoke anchor confirmed in block {int(receipt2['blockNumber'], 16)}")
        print(f"   Contract : {address}")
        print(f"   Tx hash  : {receipt2['transactionHash']}")

    # ── Write deployment record ───────────────────────────────────────────────
    deployments_dir  = os.path.join(os.getcwd(), "deployments")
    deployments_file = os.path.join(deployments_dir, "referenceAnchor.json")
    os.makedirs(deployments_dir, exist_ok=True)

    existing = {}
    if os.path.exists(deployments_file):
        with open(deployments_file) as f:
            existing = json.load(f)

    existing[network_name] = {
        "chainId":    chain_id,
        "address":    address,
        "txHash":     tx_hash,
        "deployedAt": deployed_at,
        "commit":     commit,
    }

    with open(deployments_file, "w") as f:
        json.dump(existing, f, indent=2)

    print(f"\n📄 Deployment record saved to deployments/referenceAnchor.json")
    print(json.dumps(existing[network_name], indent=2))
    return address, tx_hash

if __name__ == "__main__":
    network = sys.argv[1] if len(sys.argv) > 1 else "coston2"
    pk = os.environ.get("DEPLOYER_PRIVATE_KEY")
    if not pk:
        print("❌ Set DEPLOYER_PRIVATE_KEY env var", file=sys.stderr)
        sys.exit(1)
    try:
        deploy(network, pk)
    except Exception as e:
        print(f"\n❌ Deployment failed: {e}", file=sys.stderr)
        sys.exit(1)
