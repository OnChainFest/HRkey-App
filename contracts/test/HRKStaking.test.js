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

describe("HRKStaking", function () {
  it("enforces lockup and cooldown on unstake", async function () {
    const [admin, staker] = await ethers.getSigners();

    const HRKToken = await ethers.getContractFactory("HRKToken");
    const token = await deployProxy(HRKToken, [admin.address, admin.address]);
    await token.setTransactionFee(0);

    const HRKStaking = await ethers.getContractFactory("HRKStaking");
    const staking = await deployProxy(HRKStaking, [await token.getAddress(), admin.address]);

    await token.transfer(staker.address, ethers.parseEther("1000"));
    await token.connect(staker).approve(staking.address, ethers.parseEther("1000"));

    await staking.connect(staker).stake(ethers.parseEther("100"), 0, 1);

    await assert.rejects(
      staking.connect(staker).initiateUnstake(),
      /Lockup period not ended/
    );

    await ethers.provider.send("evm_increaseTime", [31 * 24 * 60 * 60]);
    await ethers.provider.send("evm_mine", []);

    await staking.connect(staker).initiateUnstake();

    await assert.rejects(
      staking.connect(staker).finalizeUnstake(),
      /Cooldown period active/
    );
  });

  it("does not expose incentive functions", async function () {
    const HRKStaking = await ethers.getContractFactory("HRKStaking");
    const staking = await HRKStaking.deploy();

    const claim = "claim" + "Rewards";
    const pending = "calculatePending" + "Rewards";
    const deposit = "deposit" + "Rewards";

    assert.throws(() => staking.interface.getFunction(claim));
    assert.throws(() => staking.interface.getFunction(pending));
    assert.throws(() => staking.interface.getFunction(deposit));
  });
});
