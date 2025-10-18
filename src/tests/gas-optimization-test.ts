// src/tests/gas-optimization-test.ts - IMPROVED WITH DIAGNOSTICS
import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';
import { performance } from 'perf_hooks';
import config from '../config';
import { DatabaseManager } from '../config/database';
import CredentialRegistryABI from '../contracts/abi/CredentialRegistry.json';
import InstitutionRegistryABI from '../contracts/abi/InstitutionRegistry.json';

interface GasMetrics {
  contract_version: string;
  operation: string;
  gas_used: string;
  transaction_hash: string;
  sepolia_cost_eth: string;
  estimated_mainnet_cost_usd: number;
  execution_time_ms: number;
  block_number: number;
  batch_size?: number;
  status?: 'success' | 'failed';
  error?: string;
}

class GasOptimizationTest {
  private provider: ethers.providers.Provider;
  private wallet: ethers.Wallet;
  private credentialRegistry: ethers.Contract;
  private institutionRegistry: ethers.Contract;
  private results: GasMetrics[] = [];
  private dbManager: DatabaseManager;
  private testRunId: string;

  constructor() {
    this.provider = new ethers.providers.InfuraProvider(
      'sepolia',
      config.blockchain.infuraKey
    );
    this.wallet = new ethers.Wallet(
      config.blockchain.institutionPrivateKey,
      this.provider
    );

    this.credentialRegistry = new ethers.Contract(
      config.blockchain.contractAddresses.credentialRegistry,
      CredentialRegistryABI.abi,
      this.wallet
    );

    this.institutionRegistry = new ethers.Contract(
      config.blockchain.contractAddresses.institutionRegistry,
      InstitutionRegistryABI.abi,
      this.wallet
    );

    this.dbManager = new DatabaseManager();
    this.testRunId = Date.now().toString();
  }

  /**
   * Comprehensive registration check with detailed diagnostics
   */
  private async verifyInstitutionStatus(): Promise<void> {
    console.log('🔍 DETAILED INSTITUTION VERIFICATION');
    console.log('=====================================');
    console.log(`Wallet Address: ${this.wallet.address}\n`);
    
    try {
      // Check 1: Is registered?
      const isRegistered = await this.institutionRegistry.isRegistered(this.wallet.address);
      console.log(`✓ isRegistered(): ${isRegistered}`);
      
      if (!isRegistered) {
        throw new Error('Institution not registered or not active');
      }

      // Check 2: Get full details
      try {
        const details = await this.institutionRegistry.getInstitutionDetails(this.wallet.address);
        console.log(`✓ Institution ID: ${details.institutionId}`);
        console.log(`✓ Name: ${details.name}`);
        console.log(`✓ Type: ${details.institutionType}`);
        console.log(`✓ Country: ${details.country}`);
        console.log(`✓ Is Active: ${details.isActive}`);
        console.log(`✓ Registration Date: ${new Date(details.registrationDate.toNumber() * 1000).toISOString()}`);
        
        if (!details.isActive) {
          throw new Error('Institution is registered but not active');
        }
      } catch (error) {
        console.error('✗ Could not fetch institution details:', error.message);
        throw error;
      }

      // Check 3: Test with credential registry
      const registryInstitution = await this.credentialRegistry.institutionRegistry();
      console.log(`✓ Credential Registry points to: ${registryInstitution}`);
      console.log(`✓ Expected: ${config.blockchain.contractAddresses.institutionRegistry}`);
      
      if (registryInstitution.toLowerCase() !== config.blockchain.contractAddresses.institutionRegistry.toLowerCase()) {
        throw new Error('Credential Registry is pointing to wrong Institution Registry!');
      }

      console.log('\n✅ All verification checks passed!\n');
      
    } catch (error) {
      console.error('\n❌ Institution verification failed:', error.message);
      console.error('\n💡 To fix this, run:');
      console.error('   npx hardhat run src/scripts/registerInstitution.js --network sepolia\n');
      throw error;
    }
  }

  /**
   * Generate truly unique credential data
   */
  private generateUniqueCredentialData(index: number) {
    // Use test run ID + timestamp + index for uniqueness
    const uniqueId = `GAS_${this.testRunId}_${Date.now()}_${Math.random().toString(36).substring(7)}_${index}`;
    const recipientId = `RCP_${this.testRunId}_${index}`;
    
    const credentialData = {
      credentialId: uniqueId,
      recipientId: recipientId,
      degree: 'Bachelor of Science',
      major: 'Computer Science',
      issueDate: new Date().toISOString(),
    };
    
    const credentialHash = ethers.utils.keccak256(
      ethers.utils.toUtf8Bytes(JSON.stringify(credentialData))
    );
    
    // Generate a valid IPFS-like hash (CIDv0 format)
    const randomBytes = ethers.utils.randomBytes(32);
    const ipfsHash = `Qm${ethers.utils.base58.encode(randomBytes).substring(0, 44)}`;
    
    return {
      credentialId: uniqueId,
      recipientId: recipientId,
      credentialHash: credentialHash,
      ipfsHash: ipfsHash,
      expiryDate: 0
    };
  }

  /**
   * Test if a credential ID already exists (to avoid duplicates)
   */
  private async credentialExists(credentialId: string): Promise<boolean> {
    try {
      const hash = await this.credentialRegistry.getCredentialHash(credentialId);
      return hash && hash.length > 0;
    } catch (error) {
      return false;
    }
  }

  async runTests(): Promise<void> {
    console.log('🚀 GAS OPTIMIZATION TESTS - DIAGNOSTIC MODE');
    console.log('============================================');
    console.log(`Test Run ID: ${this.testRunId}\n`);

    await this.dbManager.connectDatabase();

    try {
      // Check balance
      const balance = await this.wallet.getBalance();
      console.log(`💰 Balance: ${ethers.utils.formatEther(balance)} ETH`);
      console.log(`   (Need ~0.05 ETH for tests)\n`);

      if (balance.lt(ethers.utils.parseEther('0.01'))) {
        throw new Error('Insufficient balance. Need at least 0.01 ETH');
      }

      // Comprehensive institution verification
      await this.verifyInstitutionStatus();

      // Test single operation first
      console.log('📝 STEP 1: Testing Single Credential Issuance');
      console.log('==============================================\n');
      
      const singleResult = await this.testSingleCredential();
      
      if (singleResult.status === 'success') {
        console.log('\n✅ Single credential test PASSED!');
        console.log(`   Gas Used: ${singleResult.gas_used}`);
        console.log(`   Tx: https://sepolia.etherscan.io/tx/${singleResult.transaction_hash}\n`);
        
        // Only proceed to batch tests if single test succeeded
        console.log('📝 STEP 2: Testing Batch Operations');
        console.log('=====================================\n');
        await this.testBatchOperations();
      } else {
        console.error('\n❌ Single credential test FAILED!');
        console.error(`   Error: ${singleResult.error}\n`);
        console.error('   Stopping tests - please fix the issue above first.\n');
      }

      // Generate report
      await this.generateDetailedReport();
      await this.saveResults();

    } catch (error) {
      console.error('\n❌ FATAL ERROR:', error.message);
      throw error;
    } finally {
      await this.dbManager.disconnectDatabase();
    }
  }

  /**
   * Test single credential with extensive error checking
   */
  private async testSingleCredential(): Promise<GasMetrics> {
    const startTime = performance.now();
    
    try {
      const data = this.generateUniqueCredentialData(0);
      
      console.log('Generated test data:');
      console.log(`  Credential ID: ${data.credentialId}`);
      console.log(`  Recipient ID: ${data.recipientId}`);
      console.log(`  Hash: ${data.credentialHash.substring(0, 20)}...`);
      console.log(`  IPFS: ${data.ipfsHash}\n`);

      // Check if credential already exists
      const exists = await this.credentialExists(data.credentialId);
      if (exists) {
        throw new Error(`Credential ${data.credentialId} already exists!`);
      }

      console.log('Sending transaction...');
      
      // Estimate gas first
      let estimatedGas;
      try {
        estimatedGas = await this.credentialRegistry.estimateGas.issueCredential(
          data.credentialId,
          data.recipientId,
          data.credentialHash,
          data.ipfsHash,
          data.expiryDate
        );
        console.log(`  Estimated gas: ${estimatedGas.toString()}`);
      } catch (error) {
        console.error('  ❌ Gas estimation failed:', error.message);
        throw new Error(`Cannot estimate gas: ${error.reason || error.message}`);
      }

      // Send transaction with estimated gas + buffer
      const tx = await this.credentialRegistry.issueCredential(
        data.credentialId,
        data.recipientId,
        data.credentialHash,
        data.ipfsHash,
        data.expiryDate,
        {
          gasLimit: estimatedGas.mul(120).div(100) // 20% buffer
        }
      );

      console.log(`  Tx hash: ${tx.hash}`);
      console.log('  Waiting for confirmation...');
      
      const receipt = await tx.wait();
      
      if (receipt.status === 0) {
        throw new Error('Transaction reverted');
      }

      console.log('  ✅ Transaction confirmed!');
      console.log(`  Block: ${receipt.blockNumber}`);
      console.log(`  Gas used: ${receipt.gasUsed.toString()}`);

      const gasPrice = receipt.effectiveGasPrice;
      const costInWei = receipt.gasUsed.mul(gasPrice);
      const costInEth = ethers.utils.formatEther(costInWei);

      const metric: GasMetrics = {
        contract_version: 'BASELINE',
        operation: 'issueCredential_1',
        gas_used: receipt.gasUsed.toString(),
        transaction_hash: receipt.transactionHash,
        sepolia_cost_eth: costInEth,
        estimated_mainnet_cost_usd: await this.estimateMainnetCost(receipt.gasUsed),
        execution_time_ms: performance.now() - startTime,
        block_number: receipt.blockNumber,
        batch_size: 1,
        status: 'success'
      };

      this.results.push(metric);
      return metric;

    } catch (error) {
      console.error('  ❌ Error:', error.message);
      
      const metric: GasMetrics = {
        contract_version: 'BASELINE',
        operation: 'issueCredential_1',
        gas_used: '0',
        transaction_hash: '0x0',
        sepolia_cost_eth: '0',
        estimated_mainnet_cost_usd: 0,
        execution_time_ms: performance.now() - startTime,
        block_number: 0,
        batch_size: 1,
        status: 'failed',
        error: error.message
      };

      this.results.push(metric);
      return metric;
    }
  }

  /**
   * Test batch operations (multiple sequential calls)
   */
  private async testBatchOperations(): Promise<void> {
    const batchSizes = [3, 5]; // Small batches for cost efficiency
    
    for (const size of batchSizes) {
      console.log(`Testing batch of ${size} credentials...\n`);
      
      const startTime = performance.now();
      let totalGas = ethers.BigNumber.from(0);
      let successCount = 0;
      const txHashes: string[] = [];
      
      for (let i = 0; i < size; i++) {
        try {
          const data = this.generateUniqueCredentialData(i);
          
          const tx = await this.credentialRegistry.issueCredential(
            data.credentialId,
            data.recipientId,
            data.credentialHash,
            data.ipfsHash,
            data.expiryDate,
            { gasLimit: 300000 }
          );

          console.log(`  [${i + 1}/${size}] Tx: ${tx.hash}`);
          
          const receipt = await tx.wait();
          
          if (receipt.status === 1) {
            totalGas = totalGas.add(receipt.gasUsed);
            txHashes.push(receipt.transactionHash);
            successCount++;
            console.log(`  [${i + 1}/${size}] ✅ Gas: ${receipt.gasUsed.toString()}`);
          } else {
            console.log(`  [${i + 1}/${size}] ❌ Reverted`);
          }
          
          // Delay between transactions
          await this.delay(2000);
          
        } catch (error) {
          console.error(`  [${i + 1}/${size}] ❌ Error: ${error.message}`);
        }
      }
      
      const totalTime = performance.now() - startTime;
      const avgGas = successCount > 0 ? totalGas.div(successCount) : ethers.BigNumber.from(0);
      
      console.log(`\nBatch Summary:`);
      console.log(`  Success: ${successCount}/${size}`);
      console.log(`  Total Gas: ${totalGas.toString()}`);
      console.log(`  Avg Gas/Credential: ${avgGas.toString()}\n`);
      
      const metric: GasMetrics = {
        contract_version: 'BATCH_OPTIMIZED',
        operation: `issueCredentialBatch_${size}`,
        gas_used: totalGas.toString(),
        transaction_hash: txHashes[0] || '0x0',
        sepolia_cost_eth: ethers.utils.formatEther(
          totalGas.mul(await this.provider.getGasPrice())
        ),
        estimated_mainnet_cost_usd: await this.estimateMainnetCost(totalGas),
        execution_time_ms: totalTime,
        block_number: await this.provider.getBlockNumber(),
        batch_size: size,
        status: successCount === size ? 'success' : 'failed',
        error: successCount < size ? `Only ${successCount}/${size} succeeded` : undefined
      };
      
      this.results.push(metric);
      
      await this.delay(5000); // Cool down between batches
    }
  }

  private async estimateMainnetCost(gasUsed: ethers.BigNumber): Promise<number> {
    try {
      const gasPriceGwei = 30;
      const ethPrice = 2000;
      const costInEth = gasUsed.mul(gasPriceGwei).div(ethers.utils.parseUnits('1', 'gwei'));
      const costInUsd = parseFloat(ethers.utils.formatEther(costInEth)) * ethPrice;
      return costInUsd;
    } catch {
      return 0;
    }
  }

  private async generateDetailedReport(): Promise<void> {
    console.log('\n' + '='.repeat(70));
    console.log('📊 GAS OPTIMIZATION TEST RESULTS');
    console.log('='.repeat(70) + '\n');
    
    const successful = this.results.filter(r => r.status === 'success');
    const failed = this.results.filter(r => r.status === 'failed');
    
    console.log(`Summary: ${successful.length} successful, ${failed.length} failed\n`);
    
    if (successful.length > 0) {
      console.log('✅ SUCCESSFUL OPERATIONS:');
      console.log('-'.repeat(70));
      for (const r of successful) {
        const perCredGas = parseInt(r.gas_used) / (r.batch_size || 1);
        console.log(`\n${r.operation}:`);
        console.log(`  Total Gas: ${r.gas_used}`);
        console.log(`  Per Credential: ${perCredGas.toFixed(0)} gas`);
        console.log(`  Cost: $${r.estimated_mainnet_cost_usd.toFixed(4)} (mainnet estimate)`);
        console.log(`  Tx: https://sepolia.etherscan.io/tx/${r.transaction_hash}`);
      }
    }
    
    if (failed.length > 0) {
      console.log('\n\n❌ FAILED OPERATIONS:');
      console.log('-'.repeat(70));
      for (const r of failed) {
        console.log(`\n${r.operation}:`);
        console.log(`  Error: ${r.error || 'Unknown error'}`);
        if (r.transaction_hash !== '0x0') {
          console.log(`  Tx: https://sepolia.etherscan.io/tx/${r.transaction_hash}`);
        }
      }
    }
    
    console.log('\n' + '='.repeat(70) + '\n');
  }

  private async saveResults(): Promise<void> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `gas_optimization_results_${timestamp}.json`;
    const filepath = path.join(__dirname, '../../experimental-results/raw-data', filename);
    
    const dir = path.dirname(filepath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    fs.writeFileSync(filepath, JSON.stringify({
      testRunId: this.testRunId,
      results: this.results,
      timestamp: new Date().toISOString(),
      network: 'sepolia',
      wallet: this.wallet.address,
      summary: {
        total: this.results.length,
        successful: this.results.filter(r => r.status === 'success').length,
        failed: this.results.filter(r => r.status === 'failed').length
      }
    }, null, 2));
    
    console.log(`💾 Results saved to: ${filename}\n`);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default GasOptimizationTest;

if (require.main === module) {
  const test = new GasOptimizationTest();
  test.runTests()
    .then(() => {
      console.log('✅ Tests completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Tests failed:', error);
      process.exit(1);
    });
}