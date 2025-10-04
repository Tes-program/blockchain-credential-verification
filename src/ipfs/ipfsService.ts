// src/ipfs/ipfsService.ts
import { create, IPFSHTTPClient } from 'ipfs-http-client';
import config from '../config';
import PinataClient from '@pinata/sdk';

// Initialize Pinata client
let pinata: PinataClient | null = null;

// Initialize IPFS client (fallback)
let ipfsClient: IPFSHTTPClient | null = null;

// Get Pinata client
const getPinataClient = () => {
  if (!pinata) {
    if (!config.ipfs.pinataApiKey || !config.ipfs.pinataApiSecret) {
      throw new Error('Pinata API key and secret are required');
    }
    
    pinata = new PinataClient({
      pinataApiKey: config.ipfs.pinataApiKey,
      pinataSecretApiKey: config.ipfs.pinataApiSecret
    });
  }
  
  return pinata;
};

// Get IPFS client (fallback)
const getIpfsClient = () => {
  if (!ipfsClient) {
    if (config.ipfs.useInfura) {
      ipfsClient = create({
        host: 'ipfs.infura.io',
        port: 5001,
        protocol: 'https',
        headers: {
          authorization: `Basic ${Buffer.from(
            `${config.ipfs.infuraProjectId}:${config.ipfs.infuraProjectSecret}`
          ).toString('base64')}`
        }
      });
    } else {
      ipfsClient = create({
        host: config.ipfs.host,
        port: config.ipfs.port,
        protocol: config.ipfs.protocol
      });
    }
  }
  
  return ipfsClient;
};

// Upload data to IPFS using Pinata
export const uploadToIPFS = async (data: any): Promise<string> => {
  try {
    if (config.ipfs.usePinata) {
      const client = getPinataClient();
      
      // Convert data to JSON string if it's not already a string
      const content = typeof data === 'string' ? data : JSON.stringify(data);
      
      // Generate metadata for the pin
      const metadata = {
        name: `credential-${Date.now()}`
      };
      
      // Custom key-values for pinata
      const pinataOptions = {
        pinataMetadata: metadata,
        pinataOptions: {
          customPinPolicy: {
            regions: [
              {
                id: 'FRA1',
                desiredReplicationCount: 1
              }
            ]
          }
        }
      };
      
      // Upload to Pinata
      const result = await client.pinJSONToIPFS(
        typeof data === 'string' ? JSON.parse(data) : data, 
        pinataOptions
      );
      
      return result.IpfsHash;
    } else {
      // Fallback to regular IPFS
      const client = getIpfsClient();
      
      // Convert data to buffer if it's not already
      const content = Buffer.isBuffer(data) 
        ? data 
        : Buffer.from(JSON.stringify(data));
      
      const result = await client.add(content);
      
      return result.path;
    }
  } catch (error) {
    console.error('Error uploading to IPFS:', error);
    throw new Error(`Failed to upload to IPFS: ${error.message}`);
  }
};

// Get data from IPFS
export const getFromIPFS = async (ipfsHash: string): Promise<any> => {
  try {
    if (config.ipfs.usePinata) {
      // With Pinata, we need to use their gateway or a public gateway
      const gatewayURL = `https://gateway.pinata.cloud/ipfs/${ipfsHash}`;
      
      const response = await fetch(gatewayURL);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch from IPFS: ${response.statusText}`);
      }
      
      const data = await response.text();
      
      // Attempt to parse as JSON, return as string if it fails
      try {
        return JSON.parse(data);
      } catch (e) {
        return data;
      }
    } else {
      // Fallback to regular IPFS
      const client = getIpfsClient();
      
      let data = '';
      
      for await (const chunk of client.cat(ipfsHash)) {
        data += new TextDecoder().decode(chunk);
      }
      
      // Attempt to parse as JSON, return as string if it fails
      try {
        return JSON.parse(data);
      } catch (e) {
        return data;
      }
    }
  } catch (error) {
    console.error('Error getting data from IPFS:', error);
    throw new Error(`Failed to get data from IPFS: ${error.message}`);
  }
};

// Optional: Test Pinata connection
export const testPinataConnection = async (): Promise<boolean> => {
  try {
    if (!config.ipfs.usePinata) {
      return false;
    }
    
    const client = getPinataClient();
    await client.testAuthentication();
    
    console.log('Pinata connection successful');
    return true;
  } catch (error) {
    console.error('Pinata connection failed:', error);
    return false;
  }
};