// Test script for Gmail API integration
// Run this in the browser console on Gmail to test the API functionality

async function testGmailAPI() {
  console.log('🧪 Testing Gmail API Integration...');
  
  // Test 1: Check if we have OAuth data
  const { oauthData } = await chrome.storage.local.get(['oauthData']);
  console.log('📋 OAuth Data:', oauthData ? 'Found' : 'Not found');
  
  if (!oauthData || !oauthData.accessToken) {
    console.error('❌ No access token found. Please connect your Gmail account first.');
    return;
  }
  
  // Test 2: Try to get current message/thread IDs
  console.log('🔍 Testing ID extraction...');
  
  // Simulate the ID extraction functions
  function getCurrentMessageId() {
    const selectors = [
      'div[data-message-id]',
      'div[data-legacy-message-id]',
      '[data-message-id]',
      '.h7[data-message-id]',
      '.adn[data-message-id]'
    ];
    
    for (const selector of selectors) {
      const emailNode = document.querySelector(selector);
      if (emailNode) {
        const rawId = emailNode.getAttribute('data-message-id');
        if (rawId) {
          console.log('✅ Found message ID:', rawId);
          return rawId;
        }
      }
    }
    
    console.log('❌ No message ID found');
    return null;
  }
  
  function getCurrentThreadId() {
    const selectors = [
      'div[data-thread-id]',
      'div[data-legacy-thread-id]',
      '[data-thread-id]',
      '.h7[data-thread-id]'
    ];
    
    for (const selector of selectors) {
      const threadNode = document.querySelector(selector);
      if (threadNode) {
        const rawId = threadNode.getAttribute('data-thread-id');
        if (rawId) {
          console.log('✅ Found thread ID:', rawId);
          return rawId;
        }
      }
    }
    
    console.log('❌ No thread ID found');
    return null;
  }
  
  const messageId = getCurrentMessageId();
  const threadId = getCurrentThreadId();
  
  // Test 3: Try to fetch message content if we have a message ID
  if (messageId) {
    console.log('📧 Testing message API call...');
    try {
      const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${oauthData.accessToken}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const messageData = await response.json();
        console.log('✅ Message API call successful');
        console.log('📄 Message data:', {
          id: messageData.id,
          threadId: messageData.threadId,
          snippet: messageData.snippet,
          hasPayload: !!messageData.payload,
          hasHeaders: !!(messageData.payload && messageData.payload.headers)
        });
        
        // Extract subject
        if (messageData.payload && messageData.payload.headers) {
          const subjectHeader = messageData.payload.headers.find(h => h.name.toLowerCase() === 'subject');
          if (subjectHeader) {
            console.log('📝 Subject:', subjectHeader.value);
          }
        }
      } else {
        console.error('❌ Message API call failed:', response.status, response.statusText);
      }
    } catch (error) {
      console.error('❌ Message API call error:', error);
    }
  }
  
  // Test 4: Try to fetch thread content if we have a thread ID
  if (threadId) {
    console.log('🧵 Testing thread API call...');
    try {
      const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/threads/${threadId}?format=full`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${oauthData.accessToken}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const threadData = await response.json();
        console.log('✅ Thread API call successful');
        console.log('📄 Thread data:', {
          id: threadData.id,
          messageCount: threadData.messages ? threadData.messages.length : 0,
          hasMessages: !!threadData.messages
        });
        
        if (threadData.messages && threadData.messages.length > 0) {
          console.log('📧 First message snippet:', threadData.messages[0].snippet);
        }
      } else {
        console.error('❌ Thread API call failed:', response.status, response.statusText);
      }
    } catch (error) {
      console.error('❌ Thread API call error:', error);
    }
  }
  
  // Test 5: Test with a known message ID (your example)
  console.log('🧪 Testing with known message ID: FMfcgzQbgRvFXXCsfJqzwTrnSHFtkJnJ');
  try {
    const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/FMfcgzQbgRvFXXCsfJqzwTrnSHFtkJnJ?format=full', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${oauthData.accessToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (response.ok) {
      const messageData = await response.json();
      console.log('✅ Known message ID API call successful');
      console.log('📄 Known message data:', {
        id: messageData.id,
        threadId: messageData.threadId,
        snippet: messageData.snippet,
        hasPayload: !!messageData.payload
      });
    } else {
      console.error('❌ Known message ID API call failed:', response.status, response.statusText);
      const errorText = await response.text();
      console.error('Error details:', errorText);
    }
  } catch (error) {
    console.error('❌ Known message ID API call error:', error);
  }
  
  console.log('🏁 Gmail API test completed');
}

// Run the test
testGmailAPI(); 