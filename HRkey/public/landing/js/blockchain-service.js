// HRKey Blockchain Service
class BlockchainService {
  constructor() {
    this.provider = null;
    this.signer = null;
    this.contract = null;
    this.account = null;
  }

  async init() {
    if (typeof window.ethereum === 'undefined') {
      throw new Error('MetaMask not installed');
    }

    this.provider = new ethers.providers.Web3Provider(window.ethereum);
    await window.ethereum.request({ method: 'eth_requestAccounts' });
    this.signer = this.provider.getSigner();
    this.account = await this.signer.getAddress();
    await this.ensureCorrectNetwork();
    
    this.contract = new ethers.Contract(
      window.PEERPROOF_CONTRACT.address,
      window.PEERPROOF_ABI,
      this.signer
    );
    
    console.log('✅ Blockchain initialized:', this.account);
    return this.account;
  }

  async ensureCorrectNetwork() {
    const network = await this.provider.getNetwork();
    const chainId = Number(network.chainId);
    
    if (chainId !== 8453) {
      try {
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: '0x2105' }],
        });
      } catch (switchError) {
        if (switchError.code === 4902) {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [window.BASE_NETWORK_CONFIG],
          });
        } else {
          throw switchError;
        }
      }
    }
  }

  async createReference(employee, reviewer, data) {
    const refId = ethers.utils.keccak256(
      ethers.utils.toUtf8Bytes(JSON.stringify({
        employee,
        reviewer,
        timestamp: Date.now(),
        random: Math.random()
      }))
    );
    
    const dataHash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(JSON.stringify(data)));
    const tx = await this.contract.createReference(refId, employee, reviewer, dataHash);
    await tx.wait();
    
    return { refId, txHash: tx.hash, dataHash };
  }

  async suppressReference(refId) {
    const tx = await this.contract.suppress(refId);
    await tx.wait();
    return tx.hash;
  }

  async revokeReference(refId) {
    const tx = await this.contract.revoke(refId);
    await tx.wait();
    return tx.hash;
  }

  async getReference(refId) {
    return await this.contract.references(refId);
  }
}

window.BlockchainService = BlockchainService;
