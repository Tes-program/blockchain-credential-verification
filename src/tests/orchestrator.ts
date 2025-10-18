// src/tests/orchestrator.ts
import ScalabilityTest from './scalability-test';
import LoadTest from './load-test';
import GasOptimizationTest from './gas-optimization-test';
// Import other tests as created

export async function runFullTestSuite() {
  console.log('🚀 RUNNING FULL EXPERIMENTAL TEST SUITE');
  console.log('========================================\n');

  const results = {
    scalability: null,
    load: null,
    gasOptimization: null,
    timestamp: new Date().toISOString(),
  };

  // Run tests in sequence with proper cooling periods
  
  // 1. Gas Optimization (least resource intensive)
  console.log('Phase 1: Gas Optimization Tests');
  const gasTest = new GasOptimizationTest();
  await gasTest.runTests();
  
  console.log('\n⏸️  Cooling down for 60 seconds...\n');
  await delay(60000);

  // 2. Scalability Tests  
  console.log('Phase 2: Scalability Tests');
  const scalabilityTest = new ScalabilityTest();
  await scalabilityTest.runTests([100, 500]); // Adjust based on budget
  
  console.log('\n⏸️  Cooling down for 60 seconds...\n');
  await delay(60000);

  // 3. Load Tests
  console.log('Phase 3: Load Tests');
  const loadTest = new LoadTest();
  await loadTest.runTests([10, 50, 100], 180); // 3 minutes each
  
  console.log('\n✅ ALL EXPERIMENTAL TESTS COMPLETED!');
  console.log('Check experimental-results/raw-data/ for detailed results');
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

if (require.main === module) {
  runFullTestSuite()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Test suite failed:', error);
      process.exit(1);
    });
}