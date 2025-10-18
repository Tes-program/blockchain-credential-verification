// src/tests/load-test.ts
import { performance } from 'perf_hooks';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { DatabaseManager } from '../config/database';
import config from '../config';
import jwt from 'jsonwebtoken';
import { User } from '../models/User';
import { Institution } from '../models/Institution';
import { Credential } from '../models/Credential';
import { Student } from '../models/Student';

interface LoadTestMetrics {
  concurrent_users: number;
  total_requests: number;
  successful_requests: number;
  failed_requests: number;
  response_time_p50_ms: number;
  response_time_p95_ms: number;
  response_time_p99_ms: number;
  throughput_req_per_sec: number;
  error_rate: number;
  timeout_count: number;
  infura_rate_limit_hits: number;
  test_duration_seconds: number;
  requests_by_type: {
    verification: number;
    issuance: number;
    ipfs_retrieval: number;
  };
}

interface RequestResult {
  type: 'verification' | 'issuance' | 'ipfs_retrieval';
  success: boolean;
  responseTime: number;
  error?: string;
}

class LoadTest {
  private apiUrl: string;
  private results: LoadTestMetrics[] = [];
  private testCredentials: any[] = [];
  private authToken: string = '';
  private testStudentId: string = '';
  private dbManager = new DatabaseManager();

  private async connectDatabase() {
    await this.dbManager.connectDatabase();
  }

  private async disconnectDatabase() {
    await this.dbManager.disconnectDatabase();
  }

  constructor() {
    this.apiUrl = `http://localhost:${config.server.port}/api`;
  }

  async runTests(
    concurrentLevels: number[] = [10, 50],
    durationSeconds: number = 60 // Reduced for testing
  ): Promise<void> {
    console.log('🚀 Starting Load Tests');
    console.log('================================');

    // Connect to database
    await this.connectDatabase();

    try {
      // Setup test data FIRST
      await this.setupTestData();
      
      // Verify we have test data
      if (this.testCredentials.length === 0) {
        console.error('❌ No test credentials found. Creating some...');
        await this.createTestCredentials();
      }

      for (const concurrent of concurrentLevels) {
        console.log(`\n📊 Testing with ${concurrent} concurrent users for ${durationSeconds} seconds...`);
        
        const metrics = await this.testConcurrentLoad(concurrent, durationSeconds);
        this.results.push(metrics);
        
        // Save intermediate results
        await this.saveResults();
        
        // Cool down between tests
        if (concurrent !== concurrentLevels[concurrentLevels.length - 1]) {
          console.log('Cooling down for 15 seconds...');
          await this.delay(15000);
        }
      }

      // Generate final report
      await this.generateReport();
      
    } catch (error) {
      console.error('Load test error:', error);
      throw error;
    } finally {
      // Cleanup
      await this.cleanupTestData();
      await this.disconnectDatabase();
    }
  }

  private async testConcurrentLoad(
    concurrentUsers: number,
    durationSeconds: number
  ): Promise<LoadTestMetrics> {
    const startTime = performance.now();
    const endTime = startTime + (durationSeconds * 1000);
    const results: RequestResult[] = [];
    
    let timeoutCount = 0;
    let rateLimitHits = 0;

    console.log(`⏱️  Running ${durationSeconds} second test with ${concurrentUsers} users...`);
    console.log(`   Start time: ${new Date().toISOString()}`);
    console.log(`   End time: ${new Date(Date.now() + durationSeconds * 1000).toISOString()}`);

    // Create user simulation promises
    const userPromises: Promise<void>[] = [];
    
    // Simple approach: Start all users immediately
    for (let i = 0; i < concurrentUsers; i++) {
      const userPromise = this.simulateUser(i, endTime, results);
      userPromises.push(userPromise);
      
      // Stagger user starts slightly
      await this.delay(100);
    }

    console.log(`   ✅ All ${concurrentUsers} users started`);

    // Wait for all users to complete
    await Promise.all(userPromises);

    console.log(`   ✅ All users completed. Total requests: ${results.length}`);

    // Calculate metrics
    const responseTimes = results.map(r => r.responseTime).sort((a, b) => a - b);
    const successfulRequests = results.filter(r => r.success).length;
    const failedRequests = results.filter(r => !r.success).length;
    
    // Count errors
    results.forEach(r => {
      if (r.error?.includes('timeout')) timeoutCount++;
      if (r.error?.includes('429') || r.error?.includes('rate limit')) rateLimitHits++;
    });

    const testDuration = (performance.now() - startTime) / 1000;

    // Count request types
    const requestsByType = {
      verification: results.filter(r => r.type === 'verification').length,
      issuance: results.filter(r => r.type === 'issuance').length,
      ipfs_retrieval: results.filter(r => r.type === 'ipfs_retrieval').length,
    };

    return {
      concurrent_users: concurrentUsers,
      total_requests: results.length,
      successful_requests: successfulRequests,
      failed_requests: failedRequests,
      response_time_p50_ms: this.percentile(responseTimes, 50),
      response_time_p95_ms: this.percentile(responseTimes, 95),
      response_time_p99_ms: this.percentile(responseTimes, 99),
      throughput_req_per_sec: results.length / testDuration,
      error_rate: results.length > 0 ? failedRequests / results.length : 0,
      timeout_count: timeoutCount,
      infura_rate_limit_hits: rateLimitHits,
      test_duration_seconds: testDuration,
      requests_by_type: requestsByType
    };
  }

  private async simulateUser(
    userId: number,
    endTime: number,
    results: RequestResult[]
  ): Promise<void> {
    console.log(`   User ${userId} started`);
    let requestCount = 0;
    
    while (performance.now() < endTime) {
      // Weighted random selection of request types
      const random = Math.random();
      let requestType: 'verification' | 'issuance' | 'ipfs_retrieval';
      
      if (random < 0.7) {
        requestType = 'verification';
      } else if (random < 0.9) {
        requestType = 'issuance';
      } else {
        requestType = 'ipfs_retrieval';
      }

      try {
        const result = await this.makeRequest(requestType);
        results.push(result);
        requestCount++;
        
        if (requestCount % 10 === 0) {
          console.log(`   User ${userId}: ${requestCount} requests completed`);
        }
      } catch (error) {
        console.error(`   User ${userId} request failed:`, error.message);
        results.push({
          type: requestType,
          success: false,
          responseTime: 0,
          error: error.message
        });
      }

      // Random think time between requests (1-3 seconds)
      const thinkTime = 1000 + Math.random() * 2000;
      await this.delay(thinkTime);
    }
    
    console.log(`   User ${userId} completed with ${requestCount} requests`);
  }

  private async makeRequest(
    type: 'verification' | 'issuance' | 'ipfs_retrieval'
  ): Promise<RequestResult> {
    const startTime = performance.now();
    let success = false;
    let error: string | undefined;

    try {
      switch (type) {
        case 'verification':
          // Use a random test credential for verification
          if (this.testCredentials.length > 0) {
            const credential = this.testCredentials[
              Math.floor(Math.random() * this.testCredentials.length)
            ];
            
            try {
              const response = await axios.post(
                `${this.apiUrl}/verify`,
                { credentialId: credential.credentialId },
                { 
                  timeout: 10000,
                  headers: { Authorization: `Bearer ${this.authToken}` }
                }
              );
              
              success = response.data.verified === true;
            } catch (err: any) {
              // Try without auth for public verification
              if (err.response?.status === 401) {
                const response = await axios.post(
                  `${this.apiUrl}/verify`,
                  { credentialId: credential.credentialId },
                  { timeout: 10000 }
                );
                success = response.data.verified === true;
              } else {
                throw err;
              }
            }
          } else {
            error = 'No test credentials available';
          }
          break;

        case 'issuance':
          // Skip actual issuance in load test to avoid blockchain costs
          // Just test the endpoint availability
          try {
            const response = await axios.get(
              `${this.apiUrl}/credentials`,
              {
                timeout: 5000,
                headers: { Authorization: `Bearer ${this.authToken}` }
              }
            );
            success = response.status === 200;
          } catch (err: any) {
            error = err.message;
          }
          break;

        case 'ipfs_retrieval':
          // Simulate IPFS retrieval
          if (this.testCredentials.length > 0) {
            const credential = this.testCredentials[
              Math.floor(Math.random() * this.testCredentials.length)
            ];
            
            // Mock IPFS gateway call - using a test endpoint
            try {
              // For testing, just check if IPFS hash exists
              success = credential.ipfsHash && credential.ipfsHash.length > 0;
            } catch (err: any) {
              error = err.message;
            }
          } else {
            error = 'No test credentials available';
          }
          break;
      }
    } catch (err: any) {
      error = err.message;
      if (err.response?.status === 429) {
        error = 'rate limit exceeded';
      }
    }

    return {
      type,
      success,
      responseTime: performance.now() - startTime,
      error
    };
  }

  private async setupTestData(): Promise<void> {
    console.log('📦 Setting up test data...');
    
    try {
      // Find or create test institution
      let testInstitution = await Institution.findOne({ name: 'Test University' });
      
      if (!testInstitution) {
        console.log('   Creating test institution...');
        // Create test user first
        const testUser = new User({
          userId: `TEST_INST_${Date.now()}`,
          email: 'loadtest@test.edu',
          name: 'Load Test Institution',
          role: 'institution',
          status: 'active'
        });
        await testUser.save();

        testInstitution = new Institution({
          userId: testUser.userId,
          name: 'Test University',
          type: 'University',
          country: 'Test Country',
          contactEmail: 'loadtest@test.edu',
          verificationStatus: 'verified'
        });
        await testInstitution.save();
      }

      // Get auth token
      const user = await User.findOne({ userId: testInstitution.userId });
      if (user) {
        this.authToken = jwt.sign(
          { userId: user.userId },
          config.jwt.secret,
          { expiresIn: '1h' }
        );
        console.log('   ✅ Auth token generated');
      }

      // Get existing credentials for testing
      this.testCredentials = await Credential.find()
        .limit(50)
        .select('credentialId ipfsHash')
        .lean();
      
      console.log(`   ✅ Found ${this.testCredentials.length} test credentials`);

      // Find a test student
      const testStudent = await Student.findOne();
      if (testStudent) {
        this.testStudentId = testStudent.userId;
        console.log('   ✅ Test student found');
      }
      
    } catch (error) {
      console.error('Setup error:', error);
      throw error;
    }
  }

  private async createTestCredentials(): Promise<void> {
    console.log('   Creating test credentials for load testing...');
    
    // Create a few test credentials if none exist
    for (let i = 0; i < 5; i++) {
      const credential = new Credential({
        credentialId: `LOAD_TEST_${i}`,
        credentialType: 'Test Certificate',
        credentialName: `Load Test Certificate ${i}`,
        description: 'Certificate for load testing',
        category: 'Certificate',
        issuerId: 'TEST_ISSUER',
        recipientId: 'TEST_RECIPIENT',
        recipientName: 'Test Student',
        recipientStudentId: 'TEST_STU_001',
        issueDate: new Date(),
        status: 'active',
        blockchainTxHash: '0xtest',
        ipfsHash: `QmTest${i}`,
        verifications: 0
      });
      
      await credential.save();
      this.testCredentials.push({
        credentialId: credential.credentialId,
        ipfsHash: credential.ipfsHash
      });
    }
    
    console.log(`   ✅ Created ${this.testCredentials.length} test credentials`);
  }

  private async cleanupTestData(): Promise<void> {
    console.log('🧹 Cleaning up test data...');
    
    // Clean up test credentials
    await Credential.deleteMany({ 
      credentialId: { $regex: /^LOAD_TEST_/ }
    });
    
    // Clean up test institution if created
    await Institution.deleteOne({ name: 'Test University', contactEmail: 'loadtest@test.edu' });
    await User.deleteOne({ email: 'loadtest@test.edu' });
    
    console.log('   ✅ Test data cleaned up');
  }

  // ... rest of the helper methods remain the same ...
  
  private percentile(arr: number[], p: number): number {
    if (arr.length === 0) return 0;
    const index = Math.ceil((p / 100) * arr.length) - 1;
    return arr[Math.max(0, index)];
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async saveResults(): Promise<void> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `load_test_results_${timestamp}.json`;
    const filepath = path.join(__dirname, '../../experimental-results/raw-data', filename);
    
    const dir = path.dirname(filepath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    fs.writeFileSync(filepath, JSON.stringify(this.results, null, 2));
    console.log(`✅ Results saved to ${filename}`);
  }

  private async generateReport(): Promise<void> {
    console.log('\n============================================================');
    console.log('📈 LOAD TEST REPORT');
    console.log('============================================================');
    
    for (const metric of this.results) {
      console.log(`\n📊 Concurrent Users: ${metric.concurrent_users}`);
      console.log('────────────────────────────────────────');
      console.log(`   Total Requests: ${metric.total_requests}`);
      console.log(`   Successful: ${metric.successful_requests} (${((metric.successful_requests/metric.total_requests)*100).toFixed(2)}%)`);
      console.log(`   Failed: ${metric.failed_requests}`);
      console.log(`   Throughput: ${metric.throughput_req_per_sec.toFixed(2)} req/sec`);
      console.log(`   Response Times:`);
      console.log(`      P50: ${metric.response_time_p50_ms.toFixed(2)} ms`);
      console.log(`      P95: ${metric.response_time_p95_ms.toFixed(2)} ms`);
      console.log(`      P99: ${metric.response_time_p99_ms.toFixed(2)} ms`);
      console.log(`   Error Rate: ${(metric.error_rate * 100).toFixed(2)}%`);
      console.log(`   Timeouts: ${metric.timeout_count}`);
      console.log(`   Rate Limit Hits: ${metric.infura_rate_limit_hits}`);
      console.log(`   Request Distribution:`);
      console.log(`      Verification: ${metric.requests_by_type.verification}`);
      console.log(`      Issuance: ${metric.requests_by_type.issuance}`);
      console.log(`      IPFS Retrieval: ${metric.requests_by_type.ipfs_retrieval}`);
    }
    
    console.log('\n============================================================');
  }
}

export default LoadTest;

// Run if executed directly
if (require.main === module) {
  const test = new LoadTest();
  test.runTests([10, 50], 60) // 60 seconds per test
    .then(() => {
      console.log('✅ Load tests completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Load tests failed:', error);
      process.exit(1);
    });
}