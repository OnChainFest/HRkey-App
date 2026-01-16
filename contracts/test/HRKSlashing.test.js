import assert from "node:assert/strict";
import { ethers } from "hardhat";

async function deployProxy(factory, args) {
  const implementation = await factory.deploy();
  await implementation.waitForDeployment();
  const initData = implementation.interface.encodeFunctionData("initialize", args);
  const Proxy = await ethers.getContractFactory("ERC1967Proxy");
  const proxy = await Proxy.deploy(await implementation.getAddress(), initData);
  await proxy.waitForDeployment();
  return factory.attach(await proxy.getAddress());
}

describe("HRKSlashing", function () {
  it("burns 100% of slashed stake", async function () {
    const [admin, evaluator] = await ethers.getSigners();

    const HRKToken = await ethers.getContractFactory("HRKToken");
    const token = await deployProxy(HRKToken, [admin.address, admin.address]);
    await token.setTransactionFee(0);

    const HRKStaking = await ethers.getContractFactory("HRKStaking");
    const staking = await deployProxy(HRKStaking, [await token.getAddress(), admin.address]);

    const HRKSlashing = await ethers.getContractFactory("HRKSlashing");
    const slashing = await deployProxy(HRKSlashing, [
      await staking.getAddress(),
      await token.getAddress(),
      admin.address
    ]);

    const slasherRole = ethers.keccak256(ethers.toUtf8Bytes("SLASHER_ROLE"));
    await staking.grantRole(slasherRole, slashing.address);

    await token.transfer(evaluator.address, ethers.parseEther("1000"));
    await token.connect(evaluator).approve(staking.address, ethers.parseEther("1000"));
    await staking.connect(evaluator).stake(ethers.parseEther("100"), 0, 1);

    const supplyBefore = await token.totalSupply();

    await slashing.proposeSlash(
      evaluator.address,
      3,
      ethers.keccak256(ethers.toUtf8Bytes("evidence")),
      "fraud"
    );

    await ethers.provider.send("evm_increaseTime", [48 * 60 * 60 + 1]);
    await ethers.provider.send("evm_mine", []);

    await slashing.executeSlash(0);

    const supplyAfter = await token.totalSupply();
    const burned = supplyBefore - supplyAfter;

    const proposal = await slashing.getProposal(0);
    assert.equal(burned.toString(), proposal.slashAmount.toString());
    assert.equal((await slashing.totalBurned()).toString(), proposal.slashAmount.toString());
    assert.equal((await slashing.totalSlashed()).toString(), proposal.slashAmount.toString());
  });
});
