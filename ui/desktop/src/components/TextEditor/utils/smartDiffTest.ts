/**
 * Test file for smart diff utility
 * Run this to verify the diff algorithm works correctly
 */

import { generateSmartDiff } from './smartDiff';

// Test cases for the smart diff algorithm
const testCases = [
  {
    name: 'Simple word replacement',
    original: 'The quick brown fox jumps over the lazy dog',
    suggested: 'The quick brown fox leaps over the lazy dog',
    expectedGranular: true,
  },
  {
    name: 'Multiple word changes',
    original: 'The quick brown fox jumps over the lazy dog',
    suggested: 'The fast red fox leaps over the sleepy cat',
    expectedGranular: false, // Too many changes
  },
  {
    name: 'Addition at end',
    original: 'Hello world',
    suggested: 'Hello world today',
    expectedGranular: true,
  },
  {
    name: 'Deletion in middle',
    original: 'The very quick brown fox',
    suggested: 'The quick brown fox',
    expectedGranular: true,
  },
  {
    name: 'Complete rewrite',
    original: 'The quick brown fox jumps over the lazy dog',
    suggested: 'A completely different sentence with new meaning',
    expectedGranular: false,
  },
  {
    name: 'Grammar fix',
    original: 'Their going to the store',
    suggested: "They're going to the store",
    expectedGranular: true,
  },
  {
    name: 'Punctuation change',
    original: 'Hello, world!',
    suggested: 'Hello world.',
    expectedGranular: true,
  },
];

function runTests() {
  console.log('🧪 Running Smart Diff Tests\n');
  
  testCases.forEach((testCase, index) => {
    console.log(`Test ${index + 1}: ${testCase.name}`);
    console.log(`Original: "${testCase.original}"`);
    console.log(`Suggested: "${testCase.suggested}"`);
    
    const result = generateSmartDiff(testCase.original, testCase.suggested);
    
    console.log(`Should use granular: ${testCase.expectedGranular}`);
    console.log(`Actually using granular: ${result.shouldUseGranular}`);
    console.log(`Complexity: ${(result.changeComplexity * 100).toFixed(1)}%`);
    console.log(`Segments (${result.segments.length}):`);
    
    result.segments.forEach((segment) => {
      const typeSymbol = segment.type === 'unchanged' ? '=' : 
                        segment.type === 'deleted' ? '-' : '+';
      console.log(`  ${typeSymbol} "${segment.text}"`);
    });
    
    const passed = result.shouldUseGranular === testCase.expectedGranular;
    console.log(`✅ ${passed ? 'PASS' : '❌ FAIL'}\n`);
  });
}

// Export for use in browser console or Node.js
if (typeof window !== 'undefined') {
  // Browser environment
  (window as any).runSmartDiffTests = runTests;
  console.log('Smart diff tests loaded. Run runSmartDiffTests() in console to test.');
} else {
  // Node.js environment
  runTests();
}

export { runTests as runSmartDiffTests };
