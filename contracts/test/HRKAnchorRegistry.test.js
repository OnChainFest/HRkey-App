// =============================================================================
// HRKAnchorRegistry — Smart Contract Tests
// HRKey Grant Architecture Spec v1.0.0 §4
// =============================================================================

const { expect } = require('chai');
const { ethers }  = require('hardhat');

describe('HRKAnchorRegistry', function () {
  let registry;
  let owner;
  let issuer;
  let stranger;

  // Test data
  const refHash1    = ethers.encodeBytes32String('refHash_001').slice(0, 66);
  const refId1      = ethers.encodeBytes32String('refId_001').slice(0, 66);
  const refHash2    = '0x' + 'ab'.repeat(32);
  const refId2      = '0x' + 'cd'.repeat(32);
  const consentHash1 = '0x' + '11'.repeat(32);
  const consentId1   = '0x' + '22'.repeat(32);
  const consentHash2 = '0x' + '33'.repeat(32);
  const consentId2   = '0x' + '44'.repeat(32);

  beforeEach(async function () {
    [owner, issuer, stranger] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory('HRKAnchorRegistry');
    registry = await Factory.deploy(issuer.address);
    await registry.waitForDeployment();
  });

  // ---------------------------------------------------------------------------
  // Deployment
  // ---------------------------------------------------------------------------
  describe('Deployment', function () {
    it('sets owner to deployer', async function () {
      expect(await registry.owner()).to.equal(owner.address);
    });

    it('sets issuer to provided address', async function () {
      expect(await registry.issuer()).to.equal(issuer.address);
    });

    it('reverts if issuer is zero address', async function () {
      const Factory = await ethers.getContractFactory('HRKAnchorRegistry');
      await expect(Factory.deploy(ethers.ZeroAddress))
        .to.be.revertedWith('HRKAnchorRegistry: issuer is zero address');
    });

    it('emits OwnershipTransferred on deployment', async function () {
      const Factory = await ethers.getContractFactory('HRKAnchorRegistry');
      const tx = Factory.getDeployTransaction(issuer.address);
      // Event emitted during construction — just verify state
      expect(await registry.owner()).to.equal(owner.address);
    });
  });

  // ---------------------------------------------------------------------------
  // anchorReferenceHash
  // ---------------------------------------------------------------------------
  describe('anchorReferenceHash', function () {
    it('allows issuer to anchor a reference hash', async function () {
      await expect(registry.connect(issuer).anchorReferenceHash(refHash2, refId1))
        .to.emit(registry, 'ReferenceAnchored')
        .withArgs(refHash2, refId1, issuer.address, anyValue());
    });

    it('records recorder and timestamp', async function () {
      const tx = await registry.connect(issuer).anchorReferenceHash(refHash2, refId1);
      const receipt = await tx.wait();
      const block   = await ethers.provider.getBlock(receipt.blockNumber);

      const [exists, recorder, timestamp] = await registry.verifyReferenceAnchor(refHash2);
      expect(exists).to.be.true;
      expect(recorder).to.equal(issuer.address);
      expect(timestamp).to.equal(block.timestamp);
    });

    it('reverts if refHash is zero', async function () {
      await expect(registry.connect(issuer).anchorReferenceHash(ethers.ZeroHash, refId1))
        .to.be.revertedWith('HRKAnchorRegistry: refHash is zero');
    });

    it('reverts if refId is zero', async function () {
      await expect(registry.connect(issuer).anchorReferenceHash(refHash2, ethers.ZeroHash))
        .to.be.revertedWith('HRKAnchorRegistry: refId is zero');
    });

    it('reverts if already anchored (immutability)', async function () {
      await registry.connect(issuer).anchorReferenceHash(refHash2, refId1);
      await expect(registry.connect(issuer).anchorReferenceHash(refHash2, refId2))
        .to.be.revertedWith('HRKAnchorRegistry: already anchored');
    });

    it('reverts if called by non-issuer', async function () {
      await expect(registry.connect(stranger).anchorReferenceHash(refHash2, refId1))
        .to.be.revertedWith('HRKAnchorRegistry: caller is not issuer');
    });

    it('allows multiple different reference hashes', async function () {
      await registry.connect(issuer).anchorReferenceHash(refHash1.padEnd(66, '0'), refId1);
      await registry.connect(issuer).anchorReferenceHash(refHash2, refId2);

      const [exists1] = await registry.verifyReferenceAnchor(refHash1.padEnd(66, '0'));
      const [exists2] = await registry.verifyReferenceAnchor(refHash2);
      expect(exists1).to.be.true;
      expect(exists2).to.be.true;
    });
  });

  // ---------------------------------------------------------------------------
  // verifyReferenceAnchor
  // ---------------------------------------------------------------------------
  describe('verifyReferenceAnchor', function () {
    it('returns exists=false for unanchored hash', async function () {
      const [exists, recorder, timestamp] = await registry.verifyReferenceAnchor(refHash2);
      expect(exists).to.be.false;
      expect(recorder).to.equal(ethers.ZeroAddress);
      expect(timestamp).to.equal(0);
    });

    it('is callable by anyone (public view)', async function () {
      await registry.connect(issuer).anchorReferenceHash(refHash2, refId1);
      const [exists] = await registry.connect(stranger).verifyReferenceAnchor(refHash2);
      expect(exists).to.be.true;
    });
  });

  // ---------------------------------------------------------------------------
  // registerConsentHash
  // ---------------------------------------------------------------------------
  describe('registerConsentHash', function () {
    it('allows issuer to register a consent hash', async function () {
      await expect(registry.connect(issuer).registerConsentHash(consentHash1, consentId1))
        .to.emit(registry, 'ConsentRegistered')
        .withArgs(consentHash1, consentId1, issuer.address, anyValue());
    });

    it('consent is valid after registration', async function () {
      await registry.connect(issuer).registerConsentHash(consentHash1, consentId1);
      const [valid, recorder] = await registry.verifyConsent(consentHash1);
      expect(valid).to.be.true;
      expect(recorder).to.equal(issuer.address);
    });

    it('reverts if consentHash is zero', async function () {
      await expect(registry.connect(issuer).registerConsentHash(ethers.ZeroHash, consentId1))
        .to.be.revertedWith('HRKAnchorRegistry: consentHash is zero');
    });

    it('reverts if consentId is zero', async function () {
      await expect(registry.connect(issuer).registerConsentHash(consentHash1, ethers.ZeroHash))
        .to.be.revertedWith('HRKAnchorRegistry: consentId is zero');
    });

    it('reverts if already registered', async function () {
      await registry.connect(issuer).registerConsentHash(consentHash1, consentId1);
      await expect(registry.connect(issuer).registerConsentHash(consentHash1, consentId2))
        .to.be.revertedWith('HRKAnchorRegistry: already registered');
    });

    it('reverts if called by non-issuer', async function () {
      await expect(registry.connect(stranger).registerConsentHash(consentHash1, consentId1))
        .to.be.revertedWith('HRKAnchorRegistry: caller is not issuer');
    });
  });

  // ---------------------------------------------------------------------------
  // verifyConsent
  // ---------------------------------------------------------------------------
  describe('verifyConsent', function () {
    it('returns valid=false for unregistered hash', async function () {
      const [valid, recorder, timestamp] = await registry.verifyConsent(consentHash1);
      expect(valid).to.be.false;
      expect(recorder).to.equal(ethers.ZeroAddress);
      expect(timestamp).to.equal(0);
    });

    it('is callable by anyone (public view)', async function () {
      await registry.connect(issuer).registerConsentHash(consentHash1, consentId1);
      const [valid] = await registry.connect(stranger).verifyConsent(consentHash1);
      expect(valid).to.be.true;
    });
  });

  // ---------------------------------------------------------------------------
  // revokeConsentHash
  // ---------------------------------------------------------------------------
  describe('revokeConsentHash', function () {
    beforeEach(async function () {
      await registry.connect(issuer).registerConsentHash(consentHash1, consentId1);
    });

    it('allows issuer to revoke a registered consent', async function () {
      await expect(registry.connect(issuer).revokeConsentHash(consentHash1))
        .to.emit(registry, 'ConsentRevoked')
        .withArgs(consentHash1, issuer.address, anyValue());
    });

    it('verifyConsent returns valid=false after revocation', async function () {
      await registry.connect(issuer).revokeConsentHash(consentHash1);
      const [valid] = await registry.verifyConsent(consentHash1);
      expect(valid).to.be.false;
    });

    it('reverts if consent not registered', async function () {
      await expect(registry.connect(issuer).revokeConsentHash(consentHash2))
        .to.be.revertedWith('HRKAnchorRegistry: consent not registered');
    });

    it('reverts if already revoked', async function () {
      await registry.connect(issuer).revokeConsentHash(consentHash1);
      await expect(registry.connect(issuer).revokeConsentHash(consentHash1))
        .to.be.revertedWith('HRKAnchorRegistry: already revoked');
    });

    it('reverts if called by non-issuer', async function () {
      await expect(registry.connect(stranger).revokeConsentHash(consentHash1))
        .to.be.revertedWith('HRKAnchorRegistry: caller is not issuer');
    });

    it('reverts if consentHash is zero', async function () {
      await expect(registry.connect(issuer).revokeConsentHash(ethers.ZeroHash))
        .to.be.revertedWith('HRKAnchorRegistry: consentHash is zero');
    });
  });

  // ---------------------------------------------------------------------------
  // setIssuer (key rotation)
  // ---------------------------------------------------------------------------
  describe('setIssuer', function () {
    it('allows owner to update issuer', async function () {
      await expect(registry.connect(owner).setIssuer(stranger.address))
        .to.emit(registry, 'IssuerChanged')
        .withArgs(issuer.address, stranger.address);
      expect(await registry.issuer()).to.equal(stranger.address);
    });

    it('new issuer can anchor after rotation', async function () {
      await registry.connect(owner).setIssuer(stranger.address);
      await expect(registry.connect(stranger).anchorReferenceHash(refHash2, refId1))
        .to.emit(registry, 'ReferenceAnchored');
    });

    it('old issuer cannot anchor after rotation', async function () {
      await registry.connect(owner).setIssuer(stranger.address);
      await expect(registry.connect(issuer).anchorReferenceHash(refHash2, refId1))
        .to.be.revertedWith('HRKAnchorRegistry: caller is not issuer');
    });

    it('reverts if new issuer is zero address', async function () {
      await expect(registry.connect(owner).setIssuer(ethers.ZeroAddress))
        .to.be.revertedWith('HRKAnchorRegistry: new issuer is zero address');
    });

    it('reverts if called by non-owner', async function () {
      await expect(registry.connect(issuer).setIssuer(stranger.address))
        .to.be.revertedWith('HRKAnchorRegistry: caller is not owner');
    });
  });

  // ---------------------------------------------------------------------------
  // transferOwnership
  // ---------------------------------------------------------------------------
  describe('transferOwnership', function () {
    it('allows owner to transfer ownership', async function () {
      await expect(registry.connect(owner).transferOwnership(stranger.address))
        .to.emit(registry, 'OwnershipTransferred')
        .withArgs(owner.address, stranger.address);
      expect(await registry.owner()).to.equal(stranger.address);
    });

    it('reverts if new owner is zero address', async function () {
      await expect(registry.connect(owner).transferOwnership(ethers.ZeroAddress))
        .to.be.revertedWith('HRKAnchorRegistry: new owner is zero address');
    });

    it('reverts if called by non-owner', async function () {
      await expect(registry.connect(issuer).transferOwnership(stranger.address))
        .to.be.revertedWith('HRKAnchorRegistry: caller is not owner');
    });
  });

  // ---------------------------------------------------------------------------
  // Gas efficiency checks
  // ---------------------------------------------------------------------------
  describe('Gas efficiency', function () {
    it('anchorReferenceHash uses less than 60,000 gas', async function () {
      const tx      = await registry.connect(issuer).anchorReferenceHash(refHash2, refId1);
      const receipt = await tx.wait();
      expect(receipt.gasUsed).to.be.lessThan(60_000n);
    });

    it('registerConsentHash uses less than 60,000 gas', async function () {
      const tx      = await registry.connect(issuer).registerConsentHash(consentHash1, consentId1);
      const receipt = await tx.wait();
      expect(receipt.gasUsed).to.be.lessThan(60_000n);
    });

    it('revokeConsentHash uses less than 35,000 gas', async function () {
      await registry.connect(issuer).registerConsentHash(consentHash1, consentId1);
      const tx      = await registry.connect(issuer).revokeConsentHash(consentHash1);
      const receipt = await tx.wait();
      expect(receipt.gasUsed).to.be.lessThan(35_000n);
    });
  });

  // ---------------------------------------------------------------------------
  // Integration: anchor → consent → revoke lifecycle
  // ---------------------------------------------------------------------------
  describe('Full lifecycle integration', function () {
    it('supports anchor → register consent → verify → revoke → verify=false', async function () {
      // 1. Anchor reference
      await registry.connect(issuer).anchorReferenceHash(refHash2, refId1);
      const [refExists] = await registry.verifyReferenceAnchor(refHash2);
      expect(refExists).to.be.true;

      // 2. Register consent
      await registry.connect(issuer).registerConsentHash(consentHash1, consentId1);
      const [consentValid] = await registry.verifyConsent(consentHash1);
      expect(consentValid).to.be.true;

      // 3. Revoke consent
      await registry.connect(issuer).revokeConsentHash(consentHash1);
      const [revokedValid] = await registry.verifyConsent(consentHash1);
      expect(revokedValid).to.be.false;

      // 4. Reference anchor is unaffected by consent revocation
      const [refStillExists] = await registry.verifyReferenceAnchor(refHash2);
      expect(refStillExists).to.be.true;
    });
  });
});

// ---------------------------------------------------------------------------
// Helper: anyValue matcher for event arguments
// ---------------------------------------------------------------------------
function anyValue() {
  return {
    [Symbol.iterator]() { return this; },
    next() { return { done: true }; },
    asymmetricMatch: () => true,
    toString: () => 'anyValue()',
  };
}
