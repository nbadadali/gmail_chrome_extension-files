// Debug file to understand resize direction issue

// Let's simulate the exact logic from the code
function simulateResize(startX, currentX, startWidth) {
  const deltaX = currentX - startX;
  let newWidth = startWidth + deltaX;
  
  return {
    startX,
    currentX,
    deltaX,
    startWidth,
    newWidth,
    direction: currentX > startX ? 'right (should be wider)' : 'left (should be narrower)',
    result: newWidth > startWidth ? 'wider' : 'narrower'
  };
}

console.log('=== Resize Direction Debug ===');

// Test scenarios
const startX = 100;
const startWidth = 320;

console.log('Test 1 - Move right (should be wider):');
console.log(simulateResize(startX, 120, startWidth)); // Should be wider

console.log('Test 2 - Move left (should be narrower):');
console.log(simulateResize(startX, 80, startWidth)); // Should be narrower

console.log('Test 3 - Move further right:');
console.log(simulateResize(startX, 140, startWidth)); // Should be even wider

console.log('Test 4 - Move further left:');
console.log(simulateResize(startX, 60, startWidth)); // Should be even narrower

console.log('\n=== Analysis ===');
console.log('The logic looks correct:');
console.log('- deltaX = currentX - startX');
console.log('- newWidth = startWidth + deltaX');
console.log('- If currentX > startX (moving right), deltaX is positive, so newWidth increases');
console.log('- If currentX < startX (moving left), deltaX is negative, so newWidth decreases');

console.log('\n=== Possible Issues ===');
console.log('1. The resize handle might be positioned incorrectly');
console.log('2. The mouse event coordinates might be relative to wrong element');
console.log('3. The resize handle might be getting recreated and losing event listeners');
console.log('4. There might be CSS interference'); 