import { expect } from "chai";
import { ethers } from "hardhat";

describe("ReferenceAnchor", function () {
  let anchor: any;
  let owner: any;
  let addr1: any;

  beforeEach(async function () {
    [owner, addr1] = await ethers.getSigners();

    const ReferenceAnchor = await ethers.getContractFactory("ReferenceAnchor");
    anchor = await ReferenceAnchor.deploy();
  });

  it("Should deploy successfully", async function () {
    expect(anchor.target).to.be.properAddress;
  });

  it("Should emit ReferenceAnchored event", async function () {
    const hash = ethers.keccak256(ethers.toUtf8Bytes('{"referenceId":"test123"}'));
    const tx = await anchor.anchorReference(hash);
    const receipt = await tx.wait();

    // FIXED: Read actual timestamp from receipt block, don't predict future
    const block = await ethers.provider.getBlock(receipt!.blockNumber);

    await expect(tx)
      .to.emit(anchor, "ReferenceAnchored")
      .withArgs(hash, owner.address, block!.timestamp);
  });

  it("Should increment totalAnchored counter", async function () {
    const hash1 = ethers.keccak256(ethers.toUtf8Bytes('{"referenceId":"ref1"}'));
    const hash2 = ethers.keccak256(ethers.toUtf8Bytes('{"referenceId":"ref2"}'));

    await anchor.anchorReference(hash1);
    expect(await anchor.totalAnchored()).to.equal(1);

    await anchor.anchorReference(hash2);
    expect(await anchor.totalAnchored()).to.equal(2);
  });

  it("Should reject zero hash", async function () {
    const zeroHash = ethers.ZeroHash;

    await expect(anchor.anchorReference(zeroHash))
      .to.be.revertedWith("ReferenceAnchor: zero hash");
  });

  it("Should allow multiple addresses to anchor", async function () {
    const hash = ethers.keccak256(ethers.toUtf8Bytes('{"referenceId":"multi"}'));

    await anchor.connect(owner).anchorReference(hash);
    await anchor.connect(addr1).anchorReference(hash);

    expect(await anchor.totalAnchored()).to.equal(2);
  });
});
