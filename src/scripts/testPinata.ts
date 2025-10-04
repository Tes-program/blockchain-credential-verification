// src/scripts/testPinata.ts
import { testPinataConnection, uploadToIPFS, getFromIPFS } from '../ipfs/ipfsService';
import config from '../config';
import * as dotenv from 'dotenv';

dotenv.config();

async function main() {
  try {
    console.log('Testing Pinata connection...');
    
    // Check if Pinata is configured
    if (!config.ipfs.pinataApiKey || !config.ipfs.pinataApiSecret) {
      console.error('Pinata API key and secret are not configured in .env file');
      return;
    }
    
    // Test authentication
    const isConnected = await testPinataConnection();
    
    if (!isConnected) {
      console.error('Failed to connect to Pinata');
      return;
    }
    
    // Test upload
    console.log('Uploading test data to IPFS via Pinata...');
    const testData = {
      message: 'Hello from Academic Credential Verification System',
      timestamp: new Date().toISOString(),
      test: true
    };
    
    const ipfsHash = await uploadToIPFS(testData);
    console.log('Upload successful! IPFS Hash:', ipfsHash);
    
    // Test retrieval
    console.log('Retrieving data from IPFS...');
    const retrievedData = await getFromIPFS(ipfsHash);
    console.log('Retrieved data:', retrievedData);
    
    console.log('IPFS with Pinata integration test completed successfully!');
  } catch (error) {
    console.error('Error testing Pinata integration:', error);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });