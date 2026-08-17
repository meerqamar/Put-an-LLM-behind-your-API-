import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runEvals() {
  const cases = JSON.parse(fs.readFileSync(path.join(__dirname, 'cases.json'), 'utf-8'));
  let easyPassed = 0, easyTotal = 0;
  let hardPassed = 0, hardTotal = 0;
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
      
      if (testCase.difficulty === 'easy') easyTotal++;
      if (testCase.difficulty === 'hard') hardTotal++;

      if (result.category === testCase.expected.category) {
        if (testCase.difficulty === 'easy') easyPassed++;
        if (testCase.difficulty === 'hard') hardPassed++;
      } else {
        failed.push({
          difficulty: testCase.difficulty,
          case: testCase.input.text,
          expected: testCase.expected.category,
          got: result.category,
          reason: result.reason
        });
      }
    } catch (e) {
      if (testCase.difficulty === 'easy') easyTotal++;
      if (testCase.difficulty === 'hard') hardTotal++;
      failed.push({
        difficulty: testCase.difficulty,
        case: testCase.input.text,
        error: e.message
      });
    }
  }

  console.log(`\nEval Results:`);
  console.log(`Easy: ${easyPassed} out of ${easyTotal} matched`);
  console.log(`Hard: ${hardPassed} out of ${hardTotal} matched`);
  console.log(`Total: ${easyPassed + hardPassed} out of ${cases.length} matched expected category.`);
  if (failed.length > 0) {
    console.log('\nFailed Cases:');
    failed.forEach(f => console.log(f));
  }
}

runEvals();
