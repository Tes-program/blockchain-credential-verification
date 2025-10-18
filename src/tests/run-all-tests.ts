// src/tests/run-all-tests.ts
import ScalabilityTest from './scalability-test';
import LoadTest from './load-test';
// Import other tests as you create them

async function runAllTests() {
  console.log('🚀 STARTING COMPREHENSIVE EXPERIMENTAL TESTING');
  console.log('==============================================\n');

  // Phase 1: Scalability Tests
  console.log('PHASE 1: SCALABILITY TESTS');
  console.log('─────────────────────────');
  const scalabilityTest = new ScalabilityTest();
  await scalabilityTest.runTests([100]); // Adjust volumes as needed
  
  console.log('\n✅ Scalability tests complete. Cooling down for 60 seconds...\n');
  await delay(60000);

  // Phase 2: Load Tests
  console.log('PHASE 2: LOAD TESTS');
  console.log('───────────────────');
  const loadTest = new LoadTest();
  await loadTest.runTests([10, 50, 100], 180); // 3 minutes per test
  
  // Add other test phases here as you implement them

  console.log('\n🎉 ALL TESTS COMPLETED SUCCESSFULLY!');
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Run all tests
runAllTests()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Test suite failed:', error);
    process.exit(1);
  });