// src/config/index.ts
import * as dotenv from 'dotenv-safe';

// Load environment variables
dotenv.config();

const config = {
  server: {
    port: process.env.PORT || 5000,
    nodeEnv: process.env.NODE_ENV || 'development'
  },
  mongodb: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/credential-verification'
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'your-secret-key',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  },
  blockchain: {
    network: process.env.BLOCKCHAIN_NETWORK || 'local',
    rpcUrl: process.env.BLOCKCHAIN_RPC_URL || 'http://localhost:8545',
    infuraKey: process.env.INFURA_KEY || '',
    contractAddresses: {
      institutionRegistry: process.env.INSTITUTION_REGISTRY_ADDRESS || '0x...',
      credentialRegistry: process.env.CREDENTIAL_REGISTRY_ADDRESS || '0x...'
    },
    institutionPrivateKey: process.env.INSTITUTION_PRIVATE_KEY || '0x...'
  },
  ipfs: {
    usePinata: true,
    pinataApiKey: process.env.PINATA_API_KEY || '',
    pinataApiSecret: process.env.PINATA_API_SECRET || '',
    useInfura: process.env.IPFS_USE_INFURA === 'true',
    host: process.env.IPFS_HOST || 'localhost',
    port: parseInt(process.env.IPFS_PORT || '5001'),
    protocol: process.env.IPFS_PROTOCOL || 'http',
    infuraProjectId: process.env.IPFS_PROJECT_ID || '',
    infuraProjectSecret: process.env.IPFS_PROJECT_SECRET || ''
  },
  frontend: {
    baseUrl: process.env.FRONTEND_URL || 'http://localhost:3000'
  }
};

export default config;