// Update src/scripts/deployContracts.ts
import { ethers, network } from 'hardhat';

async function main() {
  // Verify we're on the right network
  console.log(`Deploying to network: ${network.name}`);
  
  if (network.name !== 'sepolia') {
    console.error('This script is intended to be run on the Sepolia network');
    console.error('Run with: npx hardhat run --network sepolia src/scripts/deployContracts.ts');
    return;
  }
  
  console.log('Deploying contracts...');

  // Get the deployer account
  const [deployer] = await ethers.getSigners();
  console.log(`Deploying contracts with the account: ${deployer.address}`);
  console.log(`Account balance: ${(await deployer.getBalance()).toString()}`);

  // Deploy InstitutionRegistry first
  const InstitutionRegistry = await ethers.getContractFactory('InstitutionRegistry');
  const institutionRegistry = await InstitutionRegistry.deploy();
  await institutionRegistry.deployed();
  console.log(`InstitutionRegistry deployed to: ${institutionRegistry.address}`);

  // Deploy CredentialRegistry with the institutionRegistry address
  const CredentialRegistry = await ethers.getContractFactory('CredentialRegistry');
  const credentialRegistry = await CredentialRegistry.deploy(institutionRegistry.address);
  await credentialRegistry.deployed();
  console.log(`CredentialRegistry deployed to: ${credentialRegistry.address}`);

  console.log('\nDeployment complete!');
  console.log('\nContractAddresses:');
  console.log(`INSTITUTION_REGISTRY_ADDRESS=${institutionRegistry.address}`);
  console.log(`CREDENTIAL_REGISTRY_ADDRESS=${credentialRegistry.address}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });