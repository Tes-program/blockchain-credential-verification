// src/tests/scalability-test.ts
import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';
import { performance } from 'perf_hooks';
import config from '../config';
import { 
  generateBatchWithIPFS, 
  createTestStudents,
  cleanupTestData 
} from '../utils/testDataGenerator';
import rateLimiter, { getOptimalBatchConfig } from '../utils/rateLimiter';
import axios from 'axios';

interface ScalabilityMetrics {
  volume: number;
  total_duration_seconds: number;
  avg_time_per_credential_ms: number;
  total_gas_used: string;
  avg_gas_per_credential: string;
  ipfs_upload_times_ms: number[];
  blockchain_confirmation_times_ms: number[];
  success_rate: number;
  failed_credentials: string[];
  sepolia_eth_consumed: string;
  estimated_mainnet_cost_usd: number;
}

class ScalabilityTest {
  private provider: ethers.providers.Provider;
  private wallet: ethers.Wallet;
  private apiUrl: string;
  private authToken: string;
  private results: ScalabilityMetrics[] = [];

  constructor() {
    // Initialize provider and wallet
    this.provider = new ethers.providers.InfuraProvider(
      'sepolia',
      config.blockchain.infuraKey
    );
    this.wallet = new ethers.Wallet(
      config.blockchain.institutionPrivateKey,
      this.provider
    );
    this.apiUrl = `http://localhost:${config.server.port}/api`;
    this.authToken = ''; // Will be set after authentication
  }

  /**
   * Run scalability tests for different volumes
   */
  async runTests(volumes: number[] = [10, 100, 500, 1000, 1500, 2000]): Promise<void> {
    console.log('🚀 Starting Scalability Tests');
    console.log('================================');

    // Check initial balance
    const initialBalance = await this.checkBalance();
    console.log(`Initial Sepolia ETH balance: ${ethers.utils.formatEther(initialBalance)} ETH`);

    if (initialBalance.lt(ethers.utils.parseEther('0.05'))) {
      throw new Error('Insufficient Sepolia ETH balance. Need at least 0.05 ETH');
    }

    // Authenticate first (you'll need to implement proper auth)
    await this.authenticate();

    for (const volume of volumes) {
      console.log(`\n📊 Testing with ${volume} credentials...`);
      
      try {
        const metrics = await this.testVolume(volume);
        this.results.push(metrics);
        
        // Save intermediate results
        await this.saveResults();
        
        // Check balance after each test
        const currentBalance = await this.checkBalance();
        console.log(`Remaining balance: ${ethers.utils.formatEther(currentBalance)} ETH`);
        
        if (currentBalance.lt(ethers.utils.parseEther('0.05'))) {
          console.warn('⚠️  Low balance detected, stopping tests');
          break;
        }
        
        // Delay between test volumes
        console.log('Cooling down for 30 seconds...');
        await this.delay(30000);
        
      } catch (error) {
        console.error(`❌ Test failed for volume ${volume}:`, error);
      }
    }

    // Final report
    await this.generateReport();
  }

  /**
   * Test a specific volume of credentials
   */
  private async testVolume(volume: number): Promise<ScalabilityMetrics> {
    const startTime = performance.now();
    const metrics: ScalabilityMetrics = {
      volume,
      total_duration_seconds: 0,
      avg_time_per_credential_ms: 0,
      total_gas_used: '0',
      avg_gas_per_credential: '0',
      ipfs_upload_times_ms: [],
      blockchain_confirmation_times_ms: [],
      success_rate: 0,
      failed_credentials: [],
      sepolia_eth_consumed: '0',
      estimated_mainnet_cost_usd: 0
    };

    // Get batch configuration
    const batchConfig = getOptimalBatchConfig();
    const numBatches = Math.ceil(volume / batchConfig.batchSize);
    
    console.log(`Processing ${numBatches} batches of max ${batchConfig.batchSize} credentials`);

    // Step 1: Generate test data
    console.log('1️⃣  Generating test credentials...');
    const testCredentials = await generateBatchWithIPFS(volume, false); // Don't upload to IPFS yet
    
    // Step 2: Create test students
    console.log('2️⃣  Creating test students...');
    const testStudents = await createTestStudents(volume, 'Test University');

    // Map credentials to students
    testCredentials.forEach((cred, index) => {
      cred.studentId = testStudents[index].studentId;
    });

    // Step 3: Process in batches
    console.log('3️⃣  Issuing credentials in batches...');
    let totalGasUsed = ethers.BigNumber.from(0);
    let successCount = 0;
    const balanceBefore = await this.wallet.getBalance();

    for (let i = 0; i < numBatches; i++) {
      const batchStart = i * batchConfig.batchSize;
      const batchEnd = Math.min(batchStart + batchConfig.batchSize, volume);
      const batch = testCredentials.slice(batchStart, batchEnd);
      
      console.log(`  Batch ${i + 1}/${numBatches}: Processing ${batch.length} credentials`);

      // Upload to IPFS with timing
      for (const cred of batch) {
        const ipfsStart = performance.now();
        try {
          const ipfsHash = await this.uploadToIPFSWithRetry(cred);
          cred.ipfsHash = ipfsHash;
          metrics.ipfs_upload_times_ms.push(performance.now() - ipfsStart);
        } catch (error) {
          console.error('IPFS upload failed:', error);
          metrics.failed_credentials.push(cred.studentId);
        }
      }

      // Issue batch via API
      try {
        const blockchainStart = performance.now();
        const response = await axios.post(
          `${this.apiUrl}/credentials/batch`,
          { credentials: batch },
          {
            headers: { Authorization: `Bearer ${this.authToken}` },
            timeout: 300000 // 5 minute timeout
          }
        );

        if (response.data.success) {
          successCount += response.data.summary.successful;
          totalGasUsed = totalGasUsed.add(
            ethers.BigNumber.from(response.data.summary.totalGasUsed || '0')
          );
          
          // Track confirmation times
          const confirmationTime = performance.now() - blockchainStart;
          batch.forEach(() => {
            metrics.blockchain_confirmation_times_ms.push(confirmationTime / batch.length);
          });

          // Track failures
          response.data.results.failed.forEach((failure: any) => {
            metrics.failed_credentials.push(failure.studentId);
          });
        }
      } catch (error) {
        console.error(`Batch ${i + 1} failed:`, error.message);
        batch.forEach(cred => metrics.failed_credentials.push(cred.studentId));
      }

      // Rate limiting delay between batches
      if (i < numBatches - 1) {
        console.log(`  Waiting ${batchConfig.delayBetweenBatches}ms before next batch...`);
        await this.delay(batchConfig.delayBetweenBatches);
      }
    }

    // Calculate final metrics
    const balanceAfter = await this.wallet.getBalance();
    const ethConsumed = balanceBefore.sub(balanceAfter);
    
    metrics.total_duration_seconds = (performance.now() - startTime) / 1000;
    metrics.avg_time_per_credential_ms = (performance.now() - startTime) / volume;
    metrics.total_gas_used = totalGasUsed.toString();
    metrics.avg_gas_per_credential = totalGasUsed.div(volume || 1).toString();
    metrics.success_rate = successCount / volume;
    metrics.sepolia_eth_consumed = ethers.utils.formatEther(ethConsumed);
    
    // Estimate mainnet cost
    metrics.estimated_mainnet_cost_usd = await this.estimateMainnetCost(totalGasUsed);

    // Clean up test data
    console.log('4️⃣  Cleaning up test data...');
    await cleanupTestData('TEST_');

    return metrics;
  }

  /**
   * Upload to IPFS with retry logic
   */
  private async uploadToIPFSWithRetry(credential: any, maxRetries: number = 3): Promise<string> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Simulate IPFS upload (replace with actual implementation)
        const ipfsHash = `Qm${Math.random().toString(36).substring(2, 15)}`;
        return ipfsHash;
      } catch (error) {
        if (attempt === maxRetries) throw error;
        await this.delay(1000 * attempt); // Exponential backoff
      }
    }
    throw new Error('IPFS upload failed after retries');
  }

  /**
   * Estimate cost on mainnet
   */
  private async estimateMainnetCost(gasUsed: ethers.BigNumber): Promise<number> {
    try {
      // Fetch current gas price from Etherscan
      const response = await axios.get(
        `https://api.etherscan.io/api?module=gastracker&action=gasoracle&apikey=${process.env.ETHERSCAN_API_KEY}`
      );
      
      const gasPriceGwei = response.data.result.ProposeGasPrice || 30; // Default 30 Gwei
      const ethPriceResponse = await axios.get(
        'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd'
      );
      const ethPrice = ethPriceResponse.data.ethereum.usd;
      
      const costInEth = gasUsed.mul(gasPriceGwei).div(ethers.utils.parseUnits('1', 'gwei'));
      const costInUsd = parseFloat(ethers.utils.formatEther(costInEth)) * ethPrice;
      
      return costInUsd;
    } catch (error) {
      console.error('Failed to estimate mainnet cost:', error);
      return 0;
    }
  }

  /**
   * Helper functions
   */
  private async checkBalance(): Promise<ethers.BigNumber> {
    return this.wallet.getBalance();
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async authenticate(): Promise<void> {
    // Implement authentication logic
    // This is a placeholder - you'll need to implement proper auth
    this.authToken = 'test-token';
  }

  /**
   * Save results to file
   */
  private async saveResults(): Promise<void> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `scalability_results_${timestamp}.json`;
    const filepath = path.join(__dirname, '../../experimental-results/raw-data', filename);
    
    // Ensure directory exists
    const dir = path.dirname(filepath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    fs.writeFileSync(filepath, JSON.stringify(this.results, null, 2));
    console.log(`✅ Results saved to ${filename}`);
  }

  /**
   * Generate final report
   */
  private async generateReport(): Promise<void> {
    console.log('\n📈 Scalability Test Report');
    console.log('==========================');
    
    for (const metric of this.results) {
      console.log(`\nVolume: ${metric.volume} credentials`);
      console.log(`  Total Duration: ${metric.total_duration_seconds.toFixed(2)} seconds`);
      console.log(`  Average Time per Credential: ${metric.avg_time_per_credential_ms.toFixed(2)} ms`);
      console.log(`  Success Rate: ${(metric.success_rate * 100).toFixed(2)}%`);
      console.log(`  Total Gas Used: ${metric.total_gas_used}`);
      console.log(`  Sepolia ETH Consumed: ${metric.sepolia_eth_consumed}`);
      console.log(`  Estimated Mainnet Cost: $${metric.estimated_mainnet_cost_usd.toFixed(2)}`);
    }
    
    // Get rate limiter stats
    const rateLimiterStats = rateLimiter.getStats();
    console.log('\n📊 Rate Limiter Statistics:');
    console.log(`  Total Requests: ${rateLimiterStats.totalRequests}`);
    console.log(`  Throttled Requests: ${rateLimiterStats.throttledRequests}`);
    console.log(`  Failed Requests: ${rateLimiterStats.failedRequests}`);
    console.log(`  Daily Credits Used: ${rateLimiterStats.dailyCreditsUsed}`);
  }
}

// Export for use in other scripts
export default ScalabilityTest;

// Run if executed directly
if (require.main === module) {
  const test = new ScalabilityTest();
  test.runTests([10])
    .then(() => {
      console.log('✅ Scalability tests completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Scalability tests failed:', error);
      process.exit(1);
    });
}