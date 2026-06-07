// Test file for enhanced table functionality
// This file tests the new table features: Next Action, Days Old columns, and improved styling

// Mock email data for testing
const mockEmailData = {
  high_priority_emails: [
    {
      subject: "Urgent: Project deadline approaching",
      sender: "manager@company.com",
      next_action: "Review and approve final deliverables",
      days_old: 2,
      receivedAt: "2024-01-15T10:00:00Z"
    },
    {
      subject: "Critical system outage",
      sender: "tech@company.com",
      next_action: "Investigate and resolve immediately",
      days_old: 1,
      receivedAt: "2024-01-16T14:30:00Z"
    }
  ],
  medium_priority: [
    {
      subject: "Weekly team meeting agenda",
      sender: "coordinator@company.com",
      next_action: "Prepare presentation slides",
      days_old: 3,
      receivedAt: "2024-01-14T09:15:00Z"
    },
    {
      subject: "Budget review request",
      sender: "finance@company.com",
      next_action: "Analyze Q4 spending",
      days_old: 5,
      receivedAt: "2024-01-12T16:45:00Z"
    }
  ],
  already_replied_closed_threads: [
    {
      subject: "Meeting confirmation",
      sender: "client@company.com"
      // No next_action or days_old for replied threads
    },
    {
      subject: "Invoice payment received",
      sender: "accounting@company.com"
      // No next_action or days_old for replied threads
    }
  ],
  missed_or_ignored_emails: [
    {
      subject: "Follow-up reminder",
      sender: "colleague@company.com",
      days_old: 7,
      receivedAt: "2024-01-10T11:20:00Z"
      // No next_action for missed emails
    },
    {
      subject: "Newsletter subscription",
      sender: "marketing@company.com",
      days_old: 10,
      receivedAt: "2024-01-07T08:00:00Z"
      // No next_action for missed emails
    }
  ]
};

// Test the computeDaysOld function
function testComputeDaysOld() {
  console.log("Testing computeDaysOld function...");
  
  const testCases = [
    { date: "2024-01-15T10:00:00Z", expected: "recent" },
    { date: "2024-01-10T11:20:00Z", expected: "older" },
    { date: "invalid-date", expected: null },
    { date: null, expected: null }
  ];
  
  testCases.forEach(testCase => {
    const result = computeDaysOld(testCase.date);
    console.log(`Date: ${testCase.date}, Result: ${result}, Expected: ${testCase.expected}`);
  });
}

// Test the formatNextAction function
function testFormatNextAction() {
  console.log("\nTesting formatNextAction function...");
  
  const testCases = [
    { action: "Review and approve final deliverables", expected: "truncated" },
    { action: "Short action", expected: "unchanged" },
    { action: null, expected: "—" },
    { action: "", expected: "—" }
  ];
  
  testCases.forEach(testCase => {
    const result = formatNextAction(testCase.action);
    console.log(`Action: ${testCase.action}, Result: ${result}, Expected: ${testCase.expected}`);
  });
}

// Test the formatDaysOld function
function testFormatDaysOld() {
  console.log("\nTesting formatDaysOld function...");
  
  const testCases = [
    { days: 0, expected: "Today" },
    { days: 1, expected: "1 day" },
    { days: 5, expected: "5 days" },
    { days: null, expected: "—" },
    { days: undefined, expected: "—" }
  ];
  
  testCases.forEach(testCase => {
    const result = formatDaysOld(testCase.days);
    console.log(`Days: ${testCase.days}, Result: ${result}, Expected: ${testCase.expected}`);
  });
}

// Test table rendering logic
function testTableRendering() {
  console.log("\nTesting table rendering logic...");
  
  const priorities = [
    { key: 'high_priority_emails', label: 'High Priority', icon: '🔴' },
    { key: 'medium_priority', label: 'Medium Priority', icon: '🟡' },
    { key: 'low_priority', label: 'Low Priority', icon: '🔵' },
    { key: 'already_replied_closed_threads', label: 'Already Replied', icon: '✅' },
    { key: 'missed_or_ignored_emails', label: 'Missed/Ignored', icon: '⏰' }
  ];
  
  priorities.forEach(priority => {
    const emails = mockEmailData[priority.key];
    console.log(`\n${priority.label}:`);
    
    if (emails && emails.length > 0) {
      emails.forEach((email, idx) => {
        console.log(`  Email ${idx + 1}:`);
        console.log(`    Subject: ${email.subject}`);
        console.log(`    From: ${email.sender}`);
        
        if (priority.key === 'already_replied_closed_threads') {
          console.log(`    Next Action: —`);
          console.log(`    Days Old: —`);
        } else if (priority.key === 'missed_or_ignored_emails') {
          console.log(`    Next Action: —`);
          const daysOld = email.days_old !== undefined ? email.days_old : 
                         (email.receivedAt ? computeDaysOld(email.receivedAt) : null);
          console.log(`    Days Old: ${formatDaysOld(daysOld)}`);
        } else {
          console.log(`    Next Action: ${formatNextAction(email.next_action)}`);
          const daysOld = email.days_old !== undefined ? email.days_old : 
                         (email.receivedAt ? computeDaysOld(email.receivedAt) : null);
          console.log(`    Days Old: ${formatDaysOld(daysOld)}`);
        }
      });
    } else {
      console.log(`  No emails in this category`);
    }
  });
}

// Run all tests
function runAllTests() {
  console.log("=== Enhanced Table Functionality Tests ===\n");
  
  testComputeDaysOld();
  testFormatNextAction();
  testFormatDaysOld();
  testTableRendering();
  
  console.log("\n=== All tests completed ===");
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    mockEmailData,
    testComputeDaysOld,
    testFormatNextAction,
    testFormatDaysOld,
    testTableRendering,
    runAllTests
  };
}

// Run tests if this file is executed directly
if (typeof window === 'undefined') {
  runAllTests();
}
