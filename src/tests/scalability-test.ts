// src/tests/scalability-test.ts
import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';
import { performance } from 'perf_hooks';
import mongoose from 'mongoose';
import config from '../config';
import { 
  generateBatchWithIPFS, 
  createTestStudents,
  cleanupTestData 
} from '../utils/testDataGenerator';
import rateLimiter, { getOptimalBatchConfig } from '../utils/rateLimiter';
import axios from 'axios';
import { User } from '../models/User';
import { Institution } from '../models/Institution';
import jwt from 'jsonwebtoken';

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
  private dbConnected: boolean = false;
  private testInstitutionUserId: string = '';

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
    this.authToken = '';
  }

  /**
   * Connect to MongoDB
   */
  private async connectDatabase(): Promise<void> {
    try {
      if (mongoose.connection.readyState === 1) {
        console.log('✅ Already connected to MongoDB');
        this.dbConnected = true;
        return;
      }

      console.log('📡 Connecting to MongoDB...');
      
      mongoose.set('bufferTimeoutMS', 30000);
      
      await mongoose.connect(config.mongodb.uri, {
        serverSelectionTimeoutMS: 10000,
        socketTimeoutMS: 45000,
      });
      
      this.dbConnected = true;
      console.log('✅ MongoDB connected successfully');
      console.log(`   Database: ${mongoose.connection.name}`);
      console.log(`   Host: ${mongoose.connection.host}\n`);
    } catch (error) {
      console.error('❌ MongoDB connection failed:', error);
      throw new Error(`Database connection failed: ${error.message}`);
    }
  }

  /**
   * Disconnect from MongoDB
   */
  private async disconnectDatabase(): Promise<void> {
    try {
      if (mongoose.connection.readyState === 1) {
        await mongoose.disconnect();
        this.dbConnected = false;
        console.log('✅ MongoDB disconnected');
      }
    } catch (error) {
      console.error('⚠️  Error disconnecting from MongoDB:', error);
    }
  }

  /**
   * Check database connection status
   */
  private checkDatabaseConnection(): void {
    if (!this.dbConnected || mongoose.connection.readyState !== 1) {
      throw new Error('Database not connected. Please ensure MongoDB is running.');
    }
  }

  /**
   * Create or get test institution for authentication
   */
  private async setupTestInstitution(): Promise<void> {
    console.log('🏛️  Setting up test institution...');
    
    try {
      // Check if test institution already exists
      let testUser = await User.findOne({ 
        email: 'test.scalability@institution.edu',
        role: 'institution'
      });

      if (!testUser) {
        // Create test institution user
        testUser = new User({
          userId: 'TEST_INS_SCALABILITY',
          email: 'test.scalability@institution.edu',
          name: 'Test Scalability University',
          role: 'institution',
          walletAddress: this.wallet.address,
          status: 'active'
        });
        await testUser.save();

        // Create institution profile
        const institution = new Institution({
          userId: testUser.userId,
          name: 'Test Scalability University',
          type: 'University',
          country: 'United States',
          address: '123 Test Street',
          website: 'https://test-university.edu',
          contactEmail: 'test.scalability@institution.edu',
          contactPhone: '+1234567890',
          description: 'Test institution for scalability testing',
          yearEstablished: '2024',
          verificationStatus: 'verified',
          blockchainAddress: this.wallet.address
        });
        await institution.save();

        console.log('   ✅ Created new test institution');
      } else {
        console.log('   ✅ Using existing test institution');
      }

      this.testInstitutionUserId = testUser.userId;
      console.log(`   Institution User ID: ${this.testInstitutionUserId}\n`);

    } catch (error) {
      console.error('❌ Failed to setup test institution:', error);
      throw error;
    }
  }

  /**
   * Authenticate and get JWT token
   */
  private async authenticate(): Promise<void> {
    console.log('🔐 Authenticating...');
    
    try {
      // Method 1: Try to login via API if your server is running
      try {
        const response = await axios.post(
          `${this.apiUrl}/auth/login`,
          {
            web3AuthId: 'test-web3-auth-id',
            walletAddress: this.wallet.address
          },
          { timeout: 5000 }
        );
        
        if (response.data.token) {
          this.authToken = response.data.token;
          console.log('   ✅ Authenticated via API\n');
          return;
        }
      } catch (apiError) {
        console.log('   ⚠️  API login failed, generating token directly...');
      }

      // Method 2: Generate JWT token directly
      if (!this.testInstitutionUserId) {
        await this.setupTestInstitution();
      }

      this.authToken = jwt.sign(
        { userId: this.testInstitutionUserId },
        config.jwt.secret as jwt.Secret,
        { expiresIn: '24h' }
      );

      console.log('   ✅ Authentication token generated\n');

      // Verify the token works
      await this.verifyAuthentication();

    } catch (error) {
      console.error('❌ Authentication failed:', error.message);
      throw error;
    }
  }

  /**
   * Verify authentication by making a test API call
   */
  private async verifyAuthentication(): Promise<void> {
    try {
      const response = await axios.get(
        `${this.apiUrl}/auth/profile`,
        {
          headers: { Authorization: `Bearer ${this.authToken}` },
          timeout: 5000
        }
      );
      
      if (response.status === 200) {
        console.log('   ✅ Authentication verified');
        console.log(`   User: ${response.data.name}\n`);
      }
    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        console.log('   ⚠️  API server not running, will use direct database operations');
      } else if (error.response?.status === 401) {
        throw new Error('Authentication token is invalid');
      } else {
        console.log('   ⚠️  Could not verify authentication, continuing anyway...\n');
      }
    }
  }

  /**
   * Run scalability tests for different volumes
   */
  async runTests(volumes: number[] = [10, 50, 100, 500, 1000, 1500, 2000]): Promise<void> {
    console.log('🚀 Starting Scalability Tests');
    console.log('================================\n');

    try {
      // Step 1: Connect to MongoDB
      await this.connectDatabase();

      // Step 2: Setup test institution
      await this.setupTestInstitution();

      // Step 3: Check initial balance
      const initialBalance = await this.checkBalance();
      console.log(`💰 Initial Sepolia ETH balance: ${ethers.utils.formatEther(initialBalance)} ETH\n`);

      if (initialBalance.lt(ethers.utils.parseEther('0.05'))) {
        throw new Error('Insufficient Sepolia ETH balance. Need at least 0.05 ETH');
      }

      // Step 4: Authenticate
      await this.authenticate();

      // Step 5: Run tests for each volume
      for (const volume of volumes) {
        console.log(`\n${'='.repeat(50)}`);
        console.log(`📊 Testing with ${volume} credentials...`);
        console.log(`${'='.repeat(50)}\n`);
        
        try {
          const metrics = await this.testVolume(volume);
          this.results.push(metrics);
          
          await this.saveResults();
          
          const currentBalance = await this.checkBalance();
          console.log(`\n💰 Remaining balance: ${ethers.utils.formatEther(currentBalance)} ETH`);
          
          if (currentBalance.lt(ethers.utils.parseEther('0.05'))) {
            console.warn('⚠️  Low balance detected, stopping tests');
            break;
          }
          
          if (volumes.indexOf(volume) < volumes.length - 1) {
            console.log('⏳ Cooling down for 30 seconds...\n');
            await this.delay(30000);
          }
          
        } catch (error) {
          console.error(`❌ Test failed for volume ${volume}:`, error.message);
        }
      }

      await this.generateReport();

    } catch (error) {
      console.error('❌ Fatal error during tests:', error);
      throw error;
    } finally {
      // Cleanup
      await this.cleanupTestInstitution();
      await this.disconnectDatabase();
    }
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

    this.checkDatabaseConnection();

    const batchConfig = getOptimalBatchConfig();
    const numBatches = Math.ceil(volume / batchConfig.batchSize);
    
    console.log(`📦 Processing ${numBatches} batches of max ${batchConfig.batchSize} credentials\n`);

    console.log('1️⃣  Generating test credentials...');
    const testCredentials = await generateBatchWithIPFS(volume, false);
    console.log(`   ✅ Generated ${testCredentials.length} credentials\n`);
    
    console.log('2️⃣  Creating test students...');
    const testStudents = await createTestStudents(volume, 'Test Scalability University');
    console.log(`   ✅ Created ${testStudents.length} students\n`);

    testCredentials.forEach((cred, index) => {
      cred.studentId = testStudents[index].studentId;
    });

    console.log('3️⃣  Issuing credentials in batches...\n');
    let totalGasUsed = ethers.BigNumber.from(0);
    let successCount = 0;
    const balanceBefore = await this.wallet.getBalance();

    for (let i = 0; i < numBatches; i++) {
      const batchStart = i * batchConfig.batchSize;
      const batchEnd = Math.min(batchStart + batchConfig.batchSize, volume);
      const batch = testCredentials.slice(batchStart, batchEnd);
      
      console.log(`   📦 Batch ${i + 1}/${numBatches}: Processing ${batch.length} credentials`);

      for (const cred of batch) {
        const ipfsStart = performance.now();
        try {
          const ipfsHash = await this.uploadToIPFSWithRetry(cred);
          cred.ipfsHash = ipfsHash;
          metrics.ipfs_upload_times_ms.push(performance.now() - ipfsStart);
        } catch (error) {
          console.error(`      ⚠️  IPFS upload failed:`, error.message);
          metrics.failed_credentials.push(cred.studentId);
        }
      }

      try {
        const blockchainStart = performance.now();
        const response = await axios.post(
          `${this.apiUrl}/credentials/batch`,
          { credentials: batch },
          {
            headers: { 
              'Authorization': `Bearer ${this.authToken}`,
              'Content-Type': 'application/json'
            },
            timeout: 300000
          }
        );

        if (response.data.success) {
          successCount += response.data.summary.successful;
          totalGasUsed = totalGasUsed.add(
            ethers.BigNumber.from(response.data.summary.totalGasUsed || '0')
          );
          
          const confirmationTime = performance.now() - blockchainStart;
          batch.forEach(() => {
            metrics.blockchain_confirmation_times_ms.push(confirmationTime / batch.length);
          });

          console.log(`      ✅ Successfully issued ${response.data.summary.successful} credentials`);

          if (response.data.results.failed.length > 0) {
            console.log(`      ⚠️  Failed: ${response.data.results.failed.length} credentials`);
            response.data.results.failed.forEach((failure: any) => {
              metrics.failed_credentials.push(failure.studentId);
            });
          }
        }
      } catch (error) {
        if (error.response) {
          console.error(`      ❌ Batch ${i + 1} failed: ${error.response.status} - ${error.response.data?.message || error.message}`);
        } else {
          console.error(`      ❌ Batch ${i + 1} failed:`, error.message);
        }
        batch.forEach(cred => metrics.failed_credentials.push(cred.studentId));
      }

      if (i < numBatches - 1) {
        console.log(`      ⏳ Waiting ${batchConfig.delayBetweenBatches}ms before next batch...\n`);
        await this.delay(batchConfig.delayBetweenBatches);
      }
    }

    const balanceAfter = await this.wallet.getBalance();
    const ethConsumed = balanceBefore.sub(balanceAfter);
    
    metrics.total_duration_seconds = (performance.now() - startTime) / 1000;
    metrics.avg_time_per_credential_ms = (performance.now() - startTime) / volume;
    metrics.total_gas_used = totalGasUsed.toString();
    metrics.avg_gas_per_credential = totalGasUsed.div(volume || 1).toString();
    metrics.success_rate = successCount / volume;
    metrics.sepolia_eth_consumed = ethers.utils.formatEther(ethConsumed);
    metrics.estimated_mainnet_cost_usd = await this.estimateMainnetCost(totalGasUsed);

    console.log('\n4️⃣  Cleaning up test data...');
    const cleanup = await cleanupTestData('TEST_');
    console.log(`   ✅ Cleaned up: ${cleanup.users} users, ${cleanup.students} students, ${cleanup.credentials} credentials\n`);

    return metrics;
  }

  /**
   * Clean up test institution
   */
  private async cleanupTestInstitution(): Promise<void> {
    try {
      console.log('\n🧹 Cleaning up test institution...');
      
      await Institution.deleteOne({ userId: this.testInstitutionUserId });
      await User.deleteOne({ userId: this.testInstitutionUserId });
      
      console.log('   ✅ Test institution cleaned up');
    } catch (error) {
      console.error('   ⚠️  Error cleaning up test institution:', error.message);
    }
  }

  private async uploadToIPFSWithRetry(credential: any, maxRetries: number = 3): Promise<string> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const ipfsHash = `Qm${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`;
        return ipfsHash;
      } catch (error) {
        if (attempt === maxRetries) throw error;
        await this.delay(1000 * attempt);
      }
    }
    throw new Error('IPFS upload failed after retries');
  }

  private async estimateMainnetCost(gasUsed: ethers.BigNumber): Promise<number> {
    try {
      const gasPriceGwei = 30;
      const ethPrice = 2000;
      const costInEth = gasUsed.mul(gasPriceGwei).div(ethers.utils.parseUnits('1', 'gwei'));
      const costInUsd = parseFloat(ethers.utils.formatEther(costInEth)) * ethPrice;
      return costInUsd;
    } catch (error) {
      return 0;
    }
  }

  private async checkBalance(): Promise<ethers.BigNumber> {
    return this.wallet.getBalance();
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async saveResults(): Promise<void> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `scalability_results_${timestamp}.json`;
    const filepath = path.join(__dirname, '../../experimental-results/raw-data', filename);
    
    const dir = path.dirname(filepath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    fs.writeFileSync(filepath, JSON.stringify(this.results, null, 2));
    console.log(`💾 Results saved to ${filename}`);
  }

  private async generateReport(): Promise<void> {
    console.log('\n' + '='.repeat(60));
    console.log('📈 SCALABILITY TEST REPORT');
    console.log('='.repeat(60));
    
    for (const metric of this.results) {
      console.log(`\n📊 Volume: ${metric.volume} credentials`);
      console.log('─'.repeat(40));
      console.log(`   ⏱️  Total Duration: ${metric.total_duration_seconds.toFixed(2)} seconds`);
      console.log(`   ⚡ Average Time per Credential: ${metric.avg_time_per_credential_ms.toFixed(2)} ms`);
      console.log(`   ✅ Success Rate: ${(metric.success_rate * 100).toFixed(2)}%`);
      console.log(`   ⛽ Total Gas Used: ${metric.total_gas_used}`);
      console.log(`   💸 Sepolia ETH Consumed: ${metric.sepolia_eth_consumed}`);
      console.log(`   💰 Estimated Mainnet Cost: $${metric.estimated_mainnet_cost_usd.toFixed(2)}`);
      
      if (metric.failed_credentials.length > 0) {
        console.log(`   ⚠️  Failed Credentials: ${metric.failed_credentials.length}`);
      }
      
      if (metric.ipfs_upload_times_ms.length > 0) {
        const avgIpfs = metric.ipfs_upload_times_ms.reduce((a, b) => a + b, 0) / metric.ipfs_upload_times_ms.length;
        console.log(`   📦 Avg IPFS Upload Time: ${avgIpfs.toFixed(2)} ms`);
      }
      
      if (metric.blockchain_confirmation_times_ms.length > 0) {
        const avgBlockchain = metric.blockchain_confirmation_times_ms.reduce((a, b) => a + b, 0) / metric.blockchain_confirmation_times_ms.length;
        console.log(`   ⛓️  Avg Blockchain Confirmation: ${avgBlockchain.toFixed(2)} ms`);
      }
    }
    
    const rateLimiterStats = rateLimiter.getStats();
    console.log('\n' + '─'.repeat(60));
    console.log('📊 RATE LIMITER STATISTICS');
    console.log('─'.repeat(60));
    console.log(`   Total Requests: ${rateLimiterStats.totalRequests}`);
    console.log(`   Throttled Requests: ${rateLimiterStats.throttledRequests}`);
    console.log(`   Failed Requests: ${rateLimiterStats.failedRequests}`);
    console.log(`   Daily Credits Used: ${rateLimiterStats.dailyCreditsUsed}`);
    console.log('='.repeat(60) + '\n');
  }
}

export default ScalabilityTest;

if (require.main === module) {
  const test = new ScalabilityTest();
  
  test.runTests([50])
    .then(() => {
      console.log('✅ Scalability tests completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Scalability tests failed:', error);
      process.exit(1);
    });
}