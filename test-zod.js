#!/usr/bin/env node

// Test Zod validation independently
import { z } from 'zod';

console.log('Testing Zod validation...');

// Create the same schema we use in our server
const FindPropUsageSchema = z.object({
  propName: z.string().describe('Name of the prop to search for'),
  directory: z.string().default('.').describe('Directory to search in'),
  componentName: z.string().optional().describe('Optional: limit search to specific component'),
});

console.log('Schema created successfully');

// Test 1: Valid input
console.log('\n=== Test 1: Valid input ===');
try {
  const validInput = { propName: 'onClick', directory: '.' };
  console.log('Parsing valid input:', validInput);
  const result = FindPropUsageSchema.parse(validInput);
  console.log('✅ Success:', result);
} catch (error) {
  console.log('❌ Error:', error.message);
}

// Test 2: Invalid input (missing required propName)
console.log('\n=== Test 2: Invalid input (empty object) ===');
try {
  const invalidInput = {};
  console.log('Parsing invalid input:', invalidInput);
  const result = FindPropUsageSchema.parse(invalidInput);
  console.log('✅ Success (unexpected):', result);
} catch (error) {
  console.log('✅ Expected error:', error.message);
}

// Test 3: Invalid input (wrong type)
console.log('\n=== Test 3: Invalid input (wrong type) ===');
try {
  const invalidInput = { propName: 123 };
  console.log('Parsing invalid input:', invalidInput);
  const result = FindPropUsageSchema.parse(invalidInput);
  console.log('✅ Success (unexpected):', result);
} catch (error) {
  console.log('✅ Expected error:', error.message);
}

console.log('\nZod validation test completed.');
