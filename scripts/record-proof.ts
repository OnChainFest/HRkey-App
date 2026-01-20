import { ethers } from 'ethers';

type ProofConfig = {
  contractAddress: string;
  packHashHex: string;
  candidateIdentifier: string;
  rpcUrl: string;
  privateKey: string;
};

function getArg(flag: string) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return null;
  return process.argv[index + 1] || null;
}

function resolveConfig(): ProofConfig {
  const contractAddress = process.env.CONTRACT_ADDRESS || getArg('--contract');
  const packHashHex = process.env.PACK_HASH_HEX || getArg('--packHash');
  const candidateIdentifier = process.env.CANDIDATE_IDENTIFIER || getArg('--candidate');
  const rpcUrl = process.env.BASE_SEPOLIA_RPC_URL || getArg('--rpc');
  const privateKey = process.env.PROOF_SIGNER_PRIVATE_KEY || getArg('--privateKey');

  if (!contractAddress || !packHashHex || !candidateIdentifier || !rpcUrl || !privateKey) {
    throw new Error(
      'Missing required inputs: CONTRACT_ADDRESS, PACK_HASH_HEX, CANDIDATE_IDENTIFIER, BASE_SEPOLIA_RPC_URL, PROOF_SIGNER_PRIVATE_KEY'
    );
  }

  if (!ethers.isHexString(packHashHex, 32)) {
    throw new Error('PACK_HASH_HEX must be a 32-byte hex string (0x...)');
  }

  return { contractAddress, packHashHex, candidateIdentifier, rpcUrl, privateKey };
}

const PROOF_ABI = [
  'function recordReferencePackProof(bytes32 packHash, string candidateIdentifier) external',
  'event ReferencePackProofRecorded(bytes32 indexed packHash, address indexed recorder, uint256 timestamp, string candidateIdentifier)'
];

async function main() {
  const { contractAddress, packHashHex, candidateIdentifier, rpcUrl, privateKey } = resolveConfig();

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const signer = new ethers.Wallet(privateKey, provider);
  const contract = new ethers.Contract(contractAddress, PROOF_ABI, signer);

  const network = await provider.getNetwork();
  console.log(`Chain ID: ${network.chainId.toString()}`);
  console.log(`Contract: ${contractAddress}`);

  console.log('Submitting proof...');
  const tx = await contract.recordReferencePackProof(packHashHex, candidateIdentifier);
  console.log(`Tx hash: ${tx.hash}`);

  const receipt = await tx.wait();
  console.log(`Mined in block: ${receipt.blockNumber}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
