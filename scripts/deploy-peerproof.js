import hre from "hardhat";

async function main() {
  const issuer = process.env.ISSUER_ADDRESS;
  if (!issuer) throw new Error("Missing ISSUER_ADDRESS");

  const Factory = await hre.ethers.getContractFactory("PeerProofRegistry");
  const contract = await Factory.deploy(issuer);
  await contract.waitForDeployment();

  console.log("PeerProofRegistry deployed to:", await contract.getAddress());
  console.log("Issuer:", issuer);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
