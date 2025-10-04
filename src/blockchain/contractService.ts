// src/blockchain/contractService.ts
import { ethers } from 'ethers';
import config from '../config';
import CredentialRegistryABI from '../contracts/abi/CredentialRegistry.json';
import InstitutionRegistryABI from '../contracts/abi/InstitutionRegistry.json';

// Define interface for the contract functions we'll use
interface CredentialRegistry extends ethers.Contract {
  issueCredential(
    credentialId: string,
    recipientId: string,
    credentialHash: string,
    ipfsHash: string,
    expiryDate: number
  ): Promise<ethers.ContractTransaction>;
  
  revokeCredential(
    credentialId: string
  ): Promise<ethers.ContractTransaction>;
  
  verifyCredential(
    credentialId: string
  ): Promise<[boolean, string, string, string, ethers.BigNumber, boolean]>;
}

interface InstitutionRegistry extends ethers.Contract {
  registerInstitution(
    institutionAddress: string,
    institutionId: string,
    name: string,
    institutionType: string,
    country: string
  ): Promise<ethers.ContractTransaction>;
  
  isRegistered(
    institutionAddress: string
  ): Promise<boolean>;
}

// Create provider based on environment
const getProvider = () => {
  if (config.blockchain.network === 'local') {
    return new ethers.providers.JsonRpcProvider(config.blockchain.rpcUrl);
  } else {
    return new ethers.providers.InfuraProvider(
      config.blockchain.network, 
      config.blockchain.infuraKey
    );
  }
};

// Get contract instances
export const getContracts = (walletOrProvider: ethers.Wallet | ethers.providers.Provider) => {
  const institutionRegistry = new ethers.Contract(
    config.blockchain.contractAddresses.institutionRegistry,
    InstitutionRegistryABI.abi,
    walletOrProvider
  ) as InstitutionRegistry;
  
  const credentialRegistry = new ethers.Contract(
    config.blockchain.contractAddresses.credentialRegistry,
    CredentialRegistryABI.abi,
    walletOrProvider
  ) as CredentialRegistry;
  
  return {
    institutionRegistry,
    credentialRegistry
  };
};

// Get read-only contract instances
export const getReadContracts = () => {
  const provider = getProvider();
  return getContracts(provider);
};

// Get wallet with private key for signing transactions
export const getWallet = (privateKey: string) => {
  const provider = getProvider();
  return new ethers.Wallet(privateKey, provider);
};

// Issue credential on the blockchain
export const issueCredential = async (
  privateKey: string,
  credentialId: string,
  recipientId: string,
  credentialHash: string,
  ipfsHash: string,
  expiryDate?: number
) => {
  try {
    const wallet = getWallet(privateKey);
    const { credentialRegistry } = getContracts(wallet);
    
    const tx = await credentialRegistry.issueCredential(
      credentialId,
      recipientId,
      credentialHash,
      ipfsHash,
      expiryDate || 0
    );
    
    const receipt = await tx.wait();
    return {
      success: true,
      txHash: receipt.transactionHash
    };
  } catch (error) {
    console.error('Error issuing credential on blockchain:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

// Revoke credential on the blockchain
export const revokeCredential = async (
  privateKey: string,
  credentialId: string
) => {
  try {
    const wallet = getWallet(privateKey);
    const { credentialRegistry } = getContracts(wallet);
    
    const tx = await credentialRegistry.revokeCredential(credentialId);
    const receipt = await tx.wait();
    
    return {
      success: true,
      txHash: receipt.transactionHash
    };
  } catch (error) {
    console.error('Error revoking credential on blockchain:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

// Verify credential on the blockchain
export const verifyCredential = async (credentialId: string) => {
  try {
    const { credentialRegistry } = getReadContracts();
    
    const [isValid, issuer, recipientId, ipfsHash, issueDate, isRevoked] = 
      await credentialRegistry.verifyCredential(credentialId);
    
    return {
      success: true,
      data: {
        isValid,
        issuer,
        recipientId,
        ipfsHash,
        issueDate: new Date(issueDate.toNumber() * 1000),
        isRevoked
      }
    };
  } catch (error) {
    console.error('Error verifying credential on blockchain:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

// Register institution on the blockchain
export const registerInstitution = async (
  adminPrivateKey: string,
  institutionAddress: string,
  institutionId: string,
  name: string,
  institutionType: string,
  country: string
) => {
  try {
    const wallet = getWallet(adminPrivateKey);
    const { institutionRegistry } = getContracts(wallet);
    
    const tx = await institutionRegistry.registerInstitution(
      institutionAddress,
      institutionId,
      name,
      institutionType,
      country
    );
    
    const receipt = await tx.wait();
    
    return {
      success: true,
      txHash: receipt.transactionHash
    };
  } catch (error) {
    console.error('Error registering institution on blockchain:', error);
    return {
      success: false,
      error: error.message
    };
  }
};