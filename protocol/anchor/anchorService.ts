import { ethers, Contract } from 'ethers';
import { buildCanonicalReference, canonicalizeReference, hashReference } from './canonicalizeReference.js';
import { CanonicalReference, AnchorResult } from './types.js';
import { config } from './config.js';

export class AnchorService {
  private provider: ethers.JsonRpcProvider;
  private wallet: ethers.Wallet;
  private contract: Contract;
  private chainId: number;

  constructor(rpcUrl: string, privateKey: string, contractAddress: string, chainId: number) {
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.wallet = new ethers.Wallet(privateKey, this.provider);
    this.chainId = chainId;

    const abi = ['function anchorReference(bytes32 referenceHash) external'];
    this.contract = new Contract(contractAddress, abi, this.wallet);
  }

  async anchorReference(referenceObject: CanonicalReference | any): Promise<AnchorResult> {
    // Normalize to canonical format
    let canonicalObject: CanonicalReference;
    if ('metadata' in referenceObject && referenceObject.metadata?.version === '1.0.0') {
      canonicalObject = referenceObject as CanonicalReference;
    } else {
      canonicalObject = buildCanonicalReference(referenceObject);
    }

    // FIXED: Clear variable naming - canonicalJsonString is the RFC 8785 string
    const canonicalJsonString = canonicalizeReference(canonicalObject);
    const hash = hashReference(canonicalJsonString);

    console.log(`Anchoring reference ${canonicalObject.referenceId} with hash ${hash}`);

    // Submit transaction
    const tx = await this.contract.anchorReference(hash);
    console.log(`Transaction submitted: ${tx.hash}`);

    const receipt = await tx.wait();

    if (!receipt || receipt.status !== 1) {
      throw new Error(`Transaction failed (status ${receipt?.status}): ${tx.hash}`);
    }

    console.log(`Transaction confirmed in block ${receipt.blockNumber}`);

    return {
      referenceId: canonicalObject.referenceId,
      canonicalJson: canonicalJsonString,  // Return exact string for DB storage
      hash,
      txHash: receipt.hash,
      blockNumber: receipt.blockNumber!,
      chainId: this.chainId,
      timestamp: new Date(),
      explorerUrl: `${config.explorerUrl}/tx/${receipt.hash}`
    };
  }
}

export function createAnchorService(): AnchorService {
  const rpcUrl = process.env.BASE_SEPOLIA_RPC || 'https://sepolia.base.org';
  const privateKey = process.env.ANCHOR_PRIVATE_KEY;
  const contractAddress = process.env.ANCHOR_CONTRACT_ADDRESS;
  const chainId = parseInt(process.env.CHAIN_ID || '84532');

  if (!privateKey) {
    throw new Error('ANCHOR_PRIVATE_KEY environment variable is required');
  }

  if (!contractAddress) {
    throw new Error('ANCHOR_CONTRACT_ADDRESS environment variable is required');
  }

  return new AnchorService(rpcUrl, privateKey, contractAddress, chainId);
}
