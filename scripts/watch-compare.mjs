import { exec } from 'child_process';

const INTERVAL = 2000;

function runCompare() {
  exec('node scripts/compare.mjs', (error, stdout, stderr) => {
    if (error) {
      console.error('❌ Error:', error.message);
      return;
    }

    const output = stdout + stderr;
    const diffMatch = output.match(/(\d+\.\d+)%/);
    const diffPercent = diffMatch ? parseFloat(diffMatch[1]) : null;

    console.clear();
    console.log(`\n📊 Diff: ${diffPercent}%\n`);
    
    if (diffPercent < 2) {
      console.log('✅ DONE!\n');
    } else {
      console.log(`⚠️ צריך לתקן עוד: ${(diffPercent - 2).toFixed(2)}%\n`);
    }
  });
}

console.log('🔍 מעקב התחיל...\n');
runCompare();
setInterval(runCompare, INTERVAL);
