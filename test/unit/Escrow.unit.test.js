const { assert } = require("chai");
const { developmentChains } = require("../../helper-hardhat.config");
const { network, getNamedAccounts, ethers, deployments } = require("hardhat");
const { expect } = require("chai");

!developmentChains.includes(network.name)
  ? describe.skip
  : describe("Escrow contract (AICM) unit tests", () => {
      let escrow,
        deployer,
        user,
        user2,
        user2Signer,
        deployerSigner,
        userSigner;
      beforeEach(async () => {
        deployer = (await getNamedAccounts()).deployer;
        user2 = (await getNamedAccounts()).user2;
        user = (await getNamedAccounts()).user;
        deployerSigner = await ethers.getSigner(deployer);
        userSigner = await ethers.getSigner(user);
        user2Signer = await ethers.getSigner(user2);
        await deployments.fixture(["all"]);
        escrow = await ethers.getContract("Escrow", deployer);
      });
      describe("Constructor tests", function () {
        it("Should set the seller and the escrow correctly", async () => {
          const sellerAddressFromCall = await escrow.getSellerAddress();
          const escrowAddressFromCall = await escrow.getEscrowAddress();

          assert.equal(sellerAddressFromCall, deployer);
          assert.equal(escrowAddressFromCall, user);
        });
      });
      describe("setPrice function", function () {
        it("Should revert if someone else tries to change price", async () => {
          const newPrice = ethers.parseEther("0.05");
          await expect(
            escrow.connect(userSigner).setPrice(newPrice)
          ).to.be.revertedWithCustomError(escrow, "OwnableUnauthorizedAccount");
        });
        it("Should revert if the price is less than or equal to 0", async () => {
          const newPrice = ethers.parseEther("0");
          await expect(escrow.setPrice(newPrice)).to.be.revertedWithCustomError(
            escrow,
            "Escrow__INVALID_PRICE_VALUE"
          );
        });
        it("Should set the new price", async () => {
          const newPrice = ethers.parseEther("0.008");
          await escrow.setPrice(newPrice);

          const currentPrice = await escrow.getCurrentPrice();
          assert.equal(newPrice, currentPrice);
        });
      });
      describe("depositFunds function", function () {
        it("Should revert if the value is not the current price", async () => {
          const fund = ethers.parseEther("0");
          await expect(
            escrow.connect(user2Signer).depositFunds({ value: fund })
          ).to.be.revertedWithCustomError(
            escrow,
            "Escrow__INVALID_PAYMENT_AMOUNT"
          );
        });
        it("Should transfer funds from user's wallet to the contract", async () => {
          const fundValue = ethers.parseEther("0.005");
          const contractBalanceBefore = await ethers.provider.getBalance(
            escrow.target
          );
          const transactionResponse = await escrow
            .connect(user2Signer)
            .depositFunds({
              value: fundValue,
            });
          await transactionResponse.wait(1);
          const contractBalanceAfter = await ethers.provider.getBalance(
            escrow.target
          );

          assert(contractBalanceAfter > contractBalanceBefore);
          assert.equal(contractBalanceAfter, fundValue);
        });
        it("Should update the s_buyerToAmountDeposited variable", async () => {
          const fundValue = await escrow.getCurrentPrice();
          const transactionResponse = await escrow
            .connect(user2Signer)
            .depositFunds({
              value: fundValue,
            });
          await transactionResponse.wait(1);
          const buyerToAmountDepositedFromCall =
            await escrow.getBuyerToAmountDeposited(user2);
          assert.equal(buyerToAmountDepositedFromCall, fundValue);
        });
        it("Should emit an event", async () => {
          const fundValue = await escrow.getCurrentPrice();
          await expect(
            escrow.connect(user2Signer).depositFunds({ value: fundValue })
          ).to.emit(escrow, "FundsDeposited");
        });
      });
      describe("releaseFunds function revert response", function () {
        it("Should revert if no funds are deposited by the buyer", async () => {
          await expect(
            escrow.connect(userSigner).releaseFunds(user2)
          ).to.be.revertedWithCustomError(escrow, "Escrow__NO_FUNDS_DEPOSITED");
        });
      });
      describe("releaseFunds function", function () {
        beforeEach(async () => {
          const fundValue = await escrow.getCurrentPrice();
          const transactionResponse = await escrow
            .connect(user2Signer)
            .depositFunds({
              value: fundValue,
            });
          await transactionResponse.wait(1);
        });
        it("Should revert if the caller isn't escrow agent", async () => {
          await expect(
            escrow.releaseFunds(user2)
          ).to.be.revertedWithCustomError(escrow, "Escrow__ESCROW_AGENT_ONLY");
        });
        it("Should send the funds to the seller", async () => {
          const fundValue = await escrow.getCurrentPrice();
          const sellerInitialBalance = await ethers.provider.getBalance(
            deployer
          );

          const tx = await escrow.connect(userSigner).releaseFunds(user2);
          await tx.wait(1);

          const sellerFinalBalance = await ethers.provider.getBalance(deployer);

          expect(sellerFinalBalance).to.equal(sellerInitialBalance + fundValue);
        });
        it("Should set a new sale ID for the transaction", async () => {
          const tx = await escrow.connect(userSigner).releaseFunds(user2);
          await tx.wait(1);

          const salesId = await escrow.getSalesIds(user2);

          expect(salesId).to.exist;
        });
        it("Should emit FundsReleased and NewSaleMade events", async () => {
          const tx = await escrow.connect(userSigner).releaseFunds(user2);
          await tx.wait(1);

          await expect(tx)
            .to.emit(escrow, "FundsReleased")
            .withArgs(user2, deployer, await escrow.getCurrentPrice());
          await expect(tx).to.emit(escrow, "NewSaleMade");
        });
      });
      describe("cancelTransaction function revert response", function () {
        it("Should revert if no funds are deposited by the buyer", async () => {
          await expect(
            escrow.connect(userSigner).cancelTransaction(user2)
          ).to.be.revertedWithCustomError(escrow, "Escrow__NO_FUNDS_DEPOSITED");
        });
      });
      describe("cancelTransaction function", function () {
        beforeEach(async () => {
          const fundValue = await escrow.getCurrentPrice();
          const transactionResponse = await escrow
            .connect(user2Signer)
            .depositFunds({
              value: fundValue,
            });
          await transactionResponse.wait(1);
        });
        it("Should revert if the caller isn't escrow agent", async () => {
          await expect(
            escrow.cancelTransaction(user2)
          ).to.be.revertedWithCustomError(escrow, "Escrow__ESCROW_AGENT_ONLY");
        });
      });
      describe("cancelTransaction Refunding", function () {
        it("Should send the funds back to the buyer", async () => {
          const fundValue = await escrow.getCurrentPrice();
          const transactionResponse = await escrow
            .connect(user2Signer)
            .depositFunds({
              value: fundValue,
            });
          await transactionResponse.wait(1);
          const buyerBalanceAfterDeposit = await ethers.provider.getBalance(
            user2
          );

          const tx = await escrow.connect(userSigner).cancelTransaction(user2);
          await tx.wait(1);

          const buyerFinalBalance = await ethers.provider.getBalance(user2);

          expect(buyerFinalBalance).to.equal(
            buyerBalanceAfterDeposit + fundValue
          );
        });
        it("Should emit the TransactionCancelled event", async () => {
          const fundValue = await escrow.getCurrentPrice();
          const transactionResponse = await escrow
            .connect(user2Signer)
            .depositFunds({
              value: fundValue,
            });
          await transactionResponse.wait(1);

          const tx = await escrow.connect(userSigner).cancelTransaction(user2);
          await tx.wait(1);

          await expect(tx)
            .to.emit(escrow, "TransactionCancelled")
            .withArgs(user2, fundValue);
        });
      });
    });
