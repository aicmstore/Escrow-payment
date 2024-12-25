const { network } = require("hardhat");
const { developmentChains } = require("../helper-hardhat.config");
const { verify } = require("../utils/verify");

module.exports = async ({ getNamedAccounts, deployments }) => {
  const { deploy, log } = deployments;
  const { deployer, user } = await getNamedAccounts();

  log("-------------------------------------------------");
  log("Deploying Escrow...");

  const args = [deployer, user];

  const escrow = await deploy("Escrow", {
    from: deployer,
    log: true,
    args: args,
    waitConfirmations: network.config.blockConfirmations || 1,
  });

  if (!developmentChains.includes(network.name)) {
    await verify(escrow.address, args);
  }
  log("-------------------------------------------------");
  log("successfully deployed Escrow...");
};

module.exports.tags = ["all", "Escrow"];
