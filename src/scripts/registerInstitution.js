// scripts/registerInstitution.js
const { ethers } = require("hardhat");
require("dotenv").config();

async function main() {
  try {
    // Get signers
    const [deployer] = await ethers.getSigners();
    
    console.log(`Registering institution with account: ${deployer.address}`);
    console.log(`Account balance: ${ethers.utils.formatEther(await deployer.getBalance())} ETH`);
    
    // Get contract factory and attach to deployed address
    const InstitutionRegistry = await ethers.getContractFactory("InstitutionRegistry");
    
    // Check if we have the address
    if (!process.env.INSTITUTION_REGISTRY_ADDRESS) {
      throw new Error("INSTITUTION_REGISTRY_ADDRESS not set in environment variables");
    }
    
    const institutionRegistry = InstitutionRegistry.attach(
      process.env.INSTITUTION_REGISTRY_ADDRESS
    );
    
    // Institution details
    const institutionAddress = deployer.address;
    const institutionId = "INST001";
    const name = "Babcock University";
    const institutionType = "University";
    const country = "Nigeria";
    
    console.log('Registering institution...');
    console.log({
      institutionAddress,
      institutionId,
      name,
      institutionType,
      country
    });
    
    const tx = await institutionRegistry.registerInstitution(
      institutionAddress,
      institutionId,
      name,
      institutionType,
      country
    );
    
    console.log('Transaction sent. Hash:', tx.hash);
    console.log('Waiting for transaction to be mined...');
    
    await tx.wait();
    
    console.log(`Institution registered! Transaction hash: ${tx.hash}`);
    
    // Verify it worked
    const isRegistered = await institutionRegistry.isRegistered(institutionAddress);
    console.log(`Institution registration status: ${isRegistered ? 'Registered' : 'Not registered'}`);
  } catch (error) {
    console.error('Error registering institution:');
    console.error(error);
  }
}

// Execute the script
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Unhandled error:');
    console.error(error);
    process.exit(1);
  });