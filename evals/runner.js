import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runEvals() {
  const cases = JSON.parse(fs.readFileSync(path.join(__dirname, 'cases.json'), 'utf-8'));
  let passed = 0;
  const failed = [];

  for (let i = 0; i < cases.length; i++) {
    const testCase = cases[i];
    try {
      const res = await fetch('http://localhost:3001/triage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testCase.input)
      });
      
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      
      const result = await res.json();
      
      if (result.category === testCase.expected.category) {
        passed++;
      } else {
        failed.push({
          case: testCase.input.text,
          expected: testCase.expected.category,
          got: result.category,
          reason: result.reason
        });
      }
    } catch (e) {
      failed.push({
        case: testCase.input.text,
        error: e.message
      });
    }
  }

  console.log(`\nEval Results: ${passed} out of ${cases.length} matched expected category.`);
  if (failed.length > 0) {
    console.log('\nFailed Cases:');
    failed.forEach(f => console.log(f));
  }
}

runEvals();
