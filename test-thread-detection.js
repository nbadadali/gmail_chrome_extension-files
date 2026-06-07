// Test file for thread detection logic
// Run this in browser console to test the functions

// Copy these functions from content.js for testing
function isThreadPage() {
  const currentUrl = window.location.href;
  // Check if URL contains a thread ID pattern (alphanumeric code after #inbox/)
  const threadPattern = /#inbox\/[A-Za-z0-9]+/;
  return threadPattern.test(currentUrl);
}

function extractThreadId() {
  const currentUrl = window.location.href;
  const threadMatch = currentUrl.match(/#inbox\/([A-Za-z0-9]+)/);
  return threadMatch ? threadMatch[1] : null;
}

function extractSubjectLine() {
  // Mock function for testing - in real implementation this would extract from DOM
  const mockSubjects = {
    'FMfcgzQbgcPLFgsfkXkMNkcFSSHJTkMQ': 'Meeting Tomorrow - Project Discussion',
    'ABC123DEF456': 'Weekly Report - Q4 Results',
    '123456789': 'Client Feedback - Website Redesign'
  };
  
  const threadId = extractThreadId();
  return mockSubjects[threadId] || 'Test Subject Line';
}

function isSummarizationRequest(message) {
  const lowerMessage = message.toLowerCase();
  const summarizationKeywords = [
    'summarise',
    'summarize', 
    'summary',
    'summaries'
  ];
  
  const contextKeywords = [
    'email',
    'thread',
    'this',
    'current',
    'whole',
    'entire'
  ];
  
  // Check if message contains any summarization keyword
  const hasSummarizationKeyword = summarizationKeywords.some(keyword => 
    lowerMessage.includes(keyword)
  );
  
  // Check if message contains context keywords (optional)
  const hasContextKeyword = contextKeywords.some(keyword => 
    lowerMessage.includes(keyword)
  );
  
  // Return true if it has summarization keyword and either context keyword or is short (likely about current thread)
  return hasSummarizationKeyword && (hasContextKeyword || message.length < 50);
}

// Test cases
console.log('=== Thread Detection Test ===');

// Test URL patterns
const testUrls = [
  'https://mail.google.com/mail/u/0/#inbox/FMfcgzQbgcPLFgsfkXkMNkcFSSHJTkMQ',
  'https://mail.google.com/mail/u/0/#inbox',
  'https://mail.google.com/mail/u/0/#sent',
  'https://mail.google.com/mail/u/0/#inbox/ABC123DEF456',
  'https://mail.google.com/mail/u/0/#inbox/123456789'
];

testUrls.forEach(url => {
  // Mock window.location.href
  const originalHref = window.location.href;
  Object.defineProperty(window, 'location', {
    value: { href: url },
    writable: true
  });
  
  console.log(`\nURL: ${url}`);
  console.log(`Is Thread Page: ${isThreadPage()}`);
  console.log(`Thread ID: ${extractThreadId()}`);
  console.log(`Subject Line: ${extractSubjectLine()}`);
  
  // Restore original href
  Object.defineProperty(window, 'location', {
    value: { href: originalHref },
    writable: true
  });
});

// Test summarization keywords
const testMessages = [
  'summarise this email',
  'summarize the thread',
  'what is this email about',
  'summarise',
  'hello',
  'help me with this thread',
  'summarize whole email',
  'can you summarize this',
  'show me a summary of this thread'
];

console.log('\n=== Summarization Keyword Test ===');
testMessages.forEach(message => {
  console.log(`"${message}" -> ${isSummarizationRequest(message)}`);
});

console.log('\n=== Test Complete ==='); 