// Test file for response parsing logic
// This simulates the response handling from the content script

// Mock response data from n8n webhook
const testResponses = [
  // Your specific format (array-wrapped)
  [
    {
      reply: '[{"summary":"The email thread discusses updating an ID with the same context ID. The sender has acknowledged the change and is working on it. The user does not need to take any further action at this time."}]'
    }
  ],
  
  // New complex structured format
  [
    {
      reply: '[{"📌 Subject / Thread Purpose":"Kick-off of *Project Titan* initiative to develop a centralized mobile app for internal employee management tasks including leave requests, time tracking, and internal announcements.","🧠 Key Points / Discussion Flow":["Rachel kicked off Project Titan, outlining the MVP phase key features and suggesting a sync meeting to discuss dependencies.","Dev expressed excitement and posed questions regarding SSO provider, HRMS flexibility, and roles for the admin dashboard.","Decision made to use Azure AD for SSO and confirmed Workday as the HRMS. Roles defined as Admin, Manager, and Employee."],"✅ Confirmed Decisions":["Azure AD will be used for SSO.","Workday is confirmed as the HRMS.","User roles for the app will be Admin, Manager, and Employee."],"❓ Open Questions / Pending Items":["Finalization of data fields required for leave requests and employee profiles.","Approval needed for the short-term DevOps contractor.","Clarification on audit log requirements and cloud provider preferences."],"🚀 Action Items & Owners":["Draft Technical Architecture Proposal – Kevin\'s team – By Friday EOD","Define data fields for leave requests and employee profiles – Aisha – Date not specified","Finalize Business Requirements Document (BRD) – Rachel – By Thursday","Provide feedback on DevOps contractor proposal – Ops Team – By Friday EOD"]}]'
    }
  ],
  
  // Direct object format
  {
    reply: '[{"summary":"The email thread discusses updating an ID with the same context ID. The sender has acknowledged the change and is working on it. The user does not need to take any further action at this time."}]'
  },
  
  // Alternative formats that might be used
  {
    reply: '{"summary":"This is a test summary from a JSON object."}'
  },
  
  {
    reply: 'Simple text response without JSON'
  },
  
  {
    reply: '[{"message":"This is a message field instead of summary"}]'
  },
  
  {
    reply: '{"message":"Direct message response"}'
  },
  
  // Complex nested format
  {
    reply: '[{"summary":"Complex summary","details":"Additional details","actionItems":["Item 1","Item 2"]}]'
  }
];

// Simulate the parsing logic from content.js
function parseResponse(responseData) {
  console.log('=== Testing Response Parsing ===');
  console.log('Input response:', responseData);
  
  // Handle array-wrapped responses from n8n
  if (Array.isArray(responseData)) {
    console.log('[SaAI] Response is an array, extracting first item');
    responseData = responseData[0];
  }
  
  if (responseData && responseData.reply) {
    try {
      console.log('[SaAI] Processing reply:', responseData.reply);
      
      // First, try to parse the outer reply
      let parsedReply = responseData.reply;
      
      // If it's a string that looks like JSON, parse it
      if (typeof parsedReply === 'string' && (parsedReply.startsWith('[') || parsedReply.startsWith('{'))) {
        parsedReply = JSON.parse(parsedReply);
      }
      
      // Handle array format with nested JSON strings
      if (Array.isArray(parsedReply)) {
        // Extract summary from the first item if it has a summary field
        const firstItem = parsedReply[0];
        if (firstItem && firstItem.summary) {
          console.log('✅ Extracted summary from array:', firstItem.summary);
          return firstItem.summary;
                    } else if (firstItem && typeof firstItem === 'object') {
              // Handle complex structured response
              console.log('✅ Found complex structured response');
              const formattedResponse = formatStructuredResponse(firstItem);
              return formattedResponse;
            } else {
              // If no summary field, try to extract from the item itself
              const summaryText = typeof firstItem === 'string' ? firstItem : JSON.stringify(firstItem);
              console.log('✅ Extracted text from array:', summaryText);
              return summaryText;
            }
      } else if (parsedReply && typeof parsedReply === 'object') {
        // Handle object format
        if (parsedReply.summary) {
          console.log('✅ Extracted summary from object:', parsedReply.summary);
          return parsedReply.summary;
        } else if (parsedReply.message) {
          console.log('✅ Extracted message from object:', parsedReply.message);
          return parsedReply.message;
        } else {
          console.log('✅ Extracted object as string:', JSON.stringify(parsedReply));
          return JSON.stringify(parsedReply);
        }
      } else {
        // Fallback to raw text
        console.log('✅ Using raw text:', parsedReply);
        return parsedReply;
      }
      
    } catch (parseError) {
      console.error('[SaAI] Error parsing reply:', parseError);
      console.log('[SaAI] Raw reply data:', responseData.reply);
      
      // If parsing fails, try to extract plain text
      let plainText = responseData.reply;
      
      // Try to extract text from common patterns
      if (plainText.includes('summary')) {
        // Try to extract summary from JSON-like string
        const summaryMatch = plainText.match(/"summary":"([^"]+)"/);
        if (summaryMatch) {
          plainText = summaryMatch[1];
          console.log('✅ Extracted summary using regex:', plainText);
          return plainText;
        }
      }
      
      console.log('✅ Using fallback plain text:', plainText);
      return plainText;
    }
  }
  
  console.log('❌ No reply field found');
  return 'No response data';
}

// Test all response formats
testResponses.forEach((response, index) => {
  console.log(`\n--- Test Case ${index + 1} ---`);
  const result = parseResponse(response);
  console.log(`Final Result: "${result}"`);
  console.log('--- End Test Case ---\n');
});

console.log('=== Testing Complete ===');

// Add the formatStructuredResponse function for testing
function formatStructuredResponse(data) {
  console.log('[SaAI] Formatting structured response:', data);
  
  let formattedHTML = '<div class="structured-response">';
  
  // Process each key-value pair
  for (const [key, value] of Object.entries(data)) {
    // Skip if value is null or undefined
    if (value === null || value === undefined) continue;
    
    // Format the key (remove quotes if present)
    const cleanKey = key.replace(/^["']|["']$/g, '');
    
    // Add section header
    formattedHTML += `<div class="response-section"><h4>${cleanKey}</h4>`;
    
    // Handle different value types
    if (Array.isArray(value)) {
      // Handle arrays (like action items, key points, etc.)
      formattedHTML += '<ul>';
      value.forEach(item => {
        const cleanItem = typeof item === 'string' ? item.replace(/^["']|["']$/g, '') : item;
        formattedHTML += `<li>${cleanItem}</li>`;
      });
      formattedHTML += '</ul>';
    } else if (typeof value === 'string') {
      // Handle string values
      const cleanValue = value.replace(/^["']|["']$/g, '');
      formattedHTML += `<p>${cleanValue}</p>`;
    } else if (typeof value === 'object') {
      // Handle nested objects
      formattedHTML += '<ul>';
      for (const [subKey, subValue] of Object.entries(value)) {
        const cleanSubKey = subKey.replace(/^["']|["']$/g, '');
        const cleanSubValue = typeof subValue === 'string' ? subValue.replace(/^["']|["']$/g, '') : subValue;
        formattedHTML += `<li><strong>${cleanSubKey}:</strong> ${cleanSubValue}</li>`;
      }
      formattedHTML += '</ul>';
    }
    
    formattedHTML += '</div>';
  }
  
  formattedHTML += '</div>';
  return formattedHTML;
} 