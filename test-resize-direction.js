// Test file for resize direction logic
// This simulates the resize behavior to ensure it works correctly

// Mock variables
let startX = 100; // Starting mouse position
let startWidth = 320; // Starting sidebar width

// Test the resize calculation
function testResizeDirection(mouseX) {
  const deltaX = startX - mouseX;
  let newWidth = startWidth - deltaX;
  
  // Apply constraints
  newWidth = Math.max(320, Math.min(500, newWidth));
  
  return {
    mouseX,
    deltaX,
    newWidth,
    direction: mouseX < startX ? 'left (should be narrower)' : 'right (should be wider)'
  };
}

console.log('=== Resize Direction Tests ===');

// Test 1: Move mouse left (should make sidebar narrower)
console.log('Test 1 - Move left:', testResizeDirection(80)); // Should be narrower

// Test 2: Move mouse right (should make sidebar wider)
console.log('Test 2 - Move right:', testResizeDirection(120)); // Should be wider

// Test 3: Move mouse further left
console.log('Test 3 - Move further left:', testResizeDirection(60)); // Should be even narrower

// Test 4: Move mouse further right
console.log('Test 4 - Move further right:', testResizeDirection(140)); // Should be even wider

// Test 5: Edge cases
console.log('Test 5 - At minimum (320px):', testResizeDirection(50)); // Should clamp to 320
console.log('Test 6 - At maximum (500px):', testResizeDirection(200)); // Should clamp to 500

console.log('=== Expected Behavior ===');
console.log('- Drag left (mouseX < startX) → sidebar gets narrower');
console.log('- Drag right (mouseX > startX) → sidebar gets wider');
console.log('- This should feel intuitive to users'); 