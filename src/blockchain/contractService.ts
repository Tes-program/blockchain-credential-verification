// src/blockchain/contractService.ts
import { ethers } from 'ethers';
import config from '../config';
import CredentialRegistryABI from '../contracts/abi/CredentialRegistry.json';
import InstitutionRegistryABI from '../contracts/abi/InstitutionRegistry.json';
import { rateLimitedWeb3Call } from '../utils/rateLimiter';

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

        // Wrap transaction with rate limiter
    const tx = await rateLimitedWeb3Call(
      'eth_sendRawTransaction',
      () => credentialRegistry.issueCredential(
        credentialId,
        recipientId,
        credentialHash,
        ipfsHash,
        expiryDate || 0
      )
    ) as ethers.ContractTransaction;

      const receipt = await rateLimitedWeb3Call(
      'eth_getTransactionReceipt',
      () => tx.wait()
    ) as ethers.ContractReceipt;
    
    return {
      success: true,
      txHash: receipt.transactionHash,
      gasUsed: receipt.gasUsed.toString()
    };
  } catch (error) {
    console.error('Error issuing credential on blockchain:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

// Modify revokeCredential function
export const revokeCredential = async (
  privateKey: string,
  credentialId: string
) => {
  try {
    const wallet = getWallet(privateKey);
    const { credentialRegistry } = getContracts(wallet);
    
    const tx = await rateLimitedWeb3Call(
      'eth_sendRawTransaction',
      () => credentialRegistry.revokeCredential(credentialId)
    ) as ethers.ContractTransaction;
    
    const receipt = await rateLimitedWeb3Call(
      'eth_getTransactionReceipt',
      () => tx.wait()
    ) as ethers.ContractReceipt;
    
    return {
      success: true,
      txHash: receipt.transactionHash
    };
  } catch (error) {
    console.error('Error revoking credential:', error);
    return { success: false, error: error.message };
  }
};

// Verify credential on the blockchain
export const verifyCredential = async (credentialId: string) => {
  try {
    const { credentialRegistry } = getReadContracts();
    
    // Wrap read call with rate limiter
    const result = await rateLimitedWeb3Call(
      'eth_call',
      () => credentialRegistry.verifyCredential(credentialId)
    ) as [boolean, string, string, string, ethers.BigNumber, boolean];
    
    const [isValid, issuer, recipientId, ipfsHash, issueDate, isRevoked] = result;
    
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
    console.error('Error verifying credential:', error);
    return { success: false, error: error.message };
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