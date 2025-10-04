require('ts-node/register');
require('@nomiclabs/hardhat-waffle');
require('@nomiclabs/hardhat-ethers');
require('@typechain/hardhat');
require('dotenv').config();

// Log to debug
console.log("Private key defined:", !!process.env.DEPLOYER_PRIVATE_KEY);
console.log("Infura key defined:", !!process.env.INFURA_KEY);

const PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY || '0x0000000000000000000000000000000000000000000000000000000000000000';

module.exports = {
  solidity: "0.8.4",
  defaultNetwork: "hardhat",
  networks: {
    hardhat: {
      chainId: 31337
    },
    localhost: {
      url: "http://127.0.0.1:8545"
    },
    sepolia: {
      url: `https://sepolia.infura.io/v3/${process.env.INFURA_KEY}`,
      accounts: [PRIVATE_KEY],
      chainId: 11155111
    }
  },
  paths: {
    sources: "./src/contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts"
  },
  typechain: {
    outDir: "src/types/typechain",
    target: "ethers-v5"
  }
};