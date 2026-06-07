// Background script for Sa.AI Gmail Assistant

chrome.runtime.onInstalled.addListener(() => {
    console.log('Sa.AI Gmail Assistant installed');
    
    // Clear any old data
    chrome.storage.local.clear(() => {
        console.log('Storage cleared on installation');
    });
});

// Handle message forwarding for OAuth and chat
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'sendToN8N') {
        handleN8NRequest(request.data)
            .then(response => sendResponse({success: true, data: response}))
            .catch(error => sendResponse({success: false, error: error.message}));
        return true;
    }
});

// Handle tab updates to inject content script
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url && tab.url.includes('mail.google.com')) {
        chrome.tabs.sendMessage(tabId, {action: 'checkInitialization'}).catch(() => {
            // Content script not loaded, inject it
            chrome.scripting.executeScript({
                target: {tabId: tabId},
                files: ['content.js']
            });
        });
    }
});

// Handle N8N webhook requests
async function handleN8NRequest(data) {
    const { endpoint, payload } = data;
    
    if (endpoint === 'oauth') {
        // For OAuth, we need to launch the Google OAuth flow first
        return await handleOAuthFlow();
    }
    
    // For other endpoints, call n8n directly
    let url;
    switch (endpoint) {
        case 'chat':
            // Check if this is a thread summarization request
            if (payload.action === 'summarize_thread' && payload.threadId) {
                console.log('[Background] Thread summarization request detected:', {
                    threadId: payload.threadId,
                    subjectLine: payload.subjectLine || 'Not provided',
                    query: payload.query
                });
                // Use the same webhook but with thread context
                url = 'https://dxb2025.app.n8n.cloud/webhook/Sa.AI-NishantChatbot';
            } else {
                url = 'https://dxb2025.app.n8n.cloud/webhook/Sa.AI-NishantChatbot';
            }
            break;
        default:
            throw new Error('Invalid endpoint');
    }
    
    console.log('[Background] Sending request to n8n:', { url, payload });
    
    try {
    const response = await fetch(url, {
        method: 'POST',
        headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
        },
        body: JSON.stringify(payload)
    });
        
        console.log('[Background] n8n response status:', response.status);
        console.log('[Background] n8n response headers:', response.headers);
    
    if (!response.ok) {
            // Handle specific error cases
            if (response.status === 404) {
                console.error('[Background] n8n webhook not found (404)');
                // Return a fallback response instead of throwing error
                return await handleFallbackResponse(endpoint, payload);
            } else if (response.status === 500) {
                throw new Error('n8n server error (500) - please check webhook configuration');
            } else if (response.status === 403) {
                throw new Error('n8n webhook access denied (403) - check authentication');
            } else {
                const errorText = await response.text().catch(() => 'Unknown error');
                throw new Error(`n8n webhook error (${response.status}): ${errorText}`);
            }
        }
        
        // Try to parse JSON response
        const responseText = await response.text();
        console.log('[Background] n8n raw response:', responseText);
        
        let result;
        try {
            result = responseText ? JSON.parse(responseText) : {};
        } catch (parseError) {
            console.warn('[Background] Failed to parse JSON response:', parseError);
            // If response is not JSON, treat it as text
            result = { message: responseText || 'Response received but not in expected format' };
        }
        
        console.log('[Background] n8n parsed response:', result);
        return result;
        
    } catch (error) {
        console.error('[Background] Network error:', error);
        
        // If it's a network error (not a 404), try fallback
        if (error.name === 'TypeError' || error.message.includes('fetch')) {
            console.log('[Background] Network error detected, using fallback response');
            return await handleFallbackResponse(endpoint, payload);
        }
        
        throw error;
    }
}

// Handle fallback responses when n8n is unavailable
async function handleFallbackResponse(endpoint, payload) {
    console.log('[Background] Using fallback response for:', endpoint);
    
    if (endpoint === 'chat') {
        const userMessage = payload.query || payload.message || 'Hello';
        
        // Check if this is a thread summarization request
        if (payload.action === 'summarize_thread' && payload.threadId) {
            console.log('[Background] Thread summarization fallback for threadId:', payload.threadId);
            const subjectInfo = payload.subjectLine ? ` (Subject: "${payload.subjectLine}")` : '';
            return {
                message: `I can see you want me to summarize the email thread (ID: ${payload.threadId})${subjectInfo}. However, the n8n webhook is currently unavailable, so I cannot access the thread content to provide a summary. Please check your webhook configuration and try again.`,
                fallback: true,
                webhookStatus: 'unavailable',
                suggestion: 'Please verify your n8n webhook is deployed and accessible',
                threadId: payload.threadId,
                subjectLine: payload.subjectLine,
                action: 'summarize_thread'
            };
        }
        
        // Generate a mock response based on the user's message
        const mockResponses = {
            'hello': 'Hi there! I\'m your Gmail assistant. How can I help you today?',
            'help': 'I can help you with:\n• Summarizing your inbox\n• Finding important emails\n• Managing your tasks\n• Answering questions about your emails\n• Summarizing specific email threads (open the thread first)',
            'summarize': 'I\'d be happy to summarize your inbox! However, the n8n webhook is currently unavailable. Please check your webhook configuration.',
            'inbox': 'I can help you with your inbox! The n8n integration needs to be configured to access your Gmail data.',
            'email': 'I\'m here to help with your emails! Please ensure the n8n webhook is properly set up to process your requests.',
            'thread': 'To summarize a specific email thread, please open the thread first, then ask me to summarize it.'
        };
        
        // Find the best matching response
        const lowerMessage = userMessage.toLowerCase();
        let response = 'I understand you\'re asking about "' + userMessage + '". The n8n webhook is currently unavailable. Please check your webhook configuration at: https://dxb2025.app.n8n.cloud/webhook/Sa.AI-NishantChatbot';
        
        for (const [key, value] of Object.entries(mockResponses)) {
            if (lowerMessage.includes(key)) {
                response = value;
                break;
            }
        }
        
        return {
            message: response,
            fallback: true,
            webhookStatus: 'unavailable',
            suggestion: 'Please verify your n8n webhook is deployed and accessible'
        };
    }
    
    return {
        message: 'Service temporarily unavailable. Please check your n8n webhook configuration.',
        fallback: true,
        webhookStatus: 'unavailable'
    };
}

// Handle OAuth flow
async function handleOAuthFlow() {
    const clientId = '1051004706176-ptln0d7v8t83qu0s5vf7v4q4dagfcn4q.apps.googleusercontent.com';
    const redirectUri = 'https://dxb2025.app.n8n.cloud/webhook/oauth/callback';
    const scopes = 'email profile https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.labels https://www.googleapis.com/auth/gmail.compose https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email openid';
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&scope=${encodeURIComponent(scopes)}` +
        `&response_type=code` +
        `&access_type=offline` +
        `&prompt=consent`;
    
    return new Promise((resolve, reject) => {
        chrome.identity.launchWebAuthFlow({
            url: authUrl,
            interactive: true
        }, function(redirectUrl) {
            if (chrome.runtime.lastError) {
                console.error('[Background] OAuth failed:', chrome.runtime.lastError);
                reject(new Error(chrome.runtime.lastError.message));
                return;
            }
            
            if (redirectUrl) {
                console.log('[Background] OAuth redirect URL:', redirectUrl);
                
                // Extract userId from redirect URL
                const urlParams = new URLSearchParams(redirectUrl.split('?')[1]);
                const userId = urlParams.get('userId');
                
                if (userId) {
                    console.log('[Background] OAuth successful, userId received:', userId);
                    // Update storage
                    chrome.storage.local.set({ 
                        isConnected: true, 
                        userId: userId,
                        oauthData: { userId, redirectUrl }
                    }, () => {
                        console.log('[Background] Storage updated successfully');
                        resolve({ success: true, userId });
                    });
                } else {
                    // Try fragment
                    const fragment = redirectUrl.split('#')[1];
                    if (fragment) {
                        const fragmentParams = new URLSearchParams(fragment);
                        const fragmentUserId = fragmentParams.get('userId');
                        if (fragmentUserId) {
                            console.log('[Background] Found userId in fragment:', fragmentUserId);
                            chrome.storage.local.set({ 
                                isConnected: true, 
                                userId: fragmentUserId,
                                oauthData: { userId: fragmentUserId, redirectUrl }
                            }, () => {
                                console.log('[Background] Storage updated successfully');
                                resolve({ success: true, userId: fragmentUserId });
                            });
                        } else {
                            // If no userId in redirect, generate one
                            const generatedUserId = 'user_' + Date.now();
                            console.log('[Background] No userId in redirect, generating:', generatedUserId);
                            chrome.storage.local.set({ 
                                isConnected: true, 
                                userId: generatedUserId,
                                oauthData: { userId: generatedUserId, redirectUrl }
                            }, () => {
                                console.log('[Background] Storage updated with generated userId');
                                resolve({ success: true, userId: generatedUserId });
                            });
                        }
                    } else {
                        // If no fragment, generate userId
                        const generatedUserId = 'user_' + Date.now();
                        console.log('[Background] No fragment, generating userId:', generatedUserId);
                        chrome.storage.local.set({ 
                            isConnected: true, 
                            userId: generatedUserId,
                            oauthData: { userId: generatedUserId, redirectUrl }
                        }, () => {
                            console.log('[Background] Storage updated with generated userId');
                            resolve({ success: true, userId: generatedUserId });
                        });
                    }
                }
            } else {
                reject(new Error('OAuth was cancelled'));
            }
        });
    });
}

// Handle extension icon click - opens popup for Gmail connection
chrome.action.onClicked.addListener((tab) => {
    // The popup will handle the connection flow
    // This ensures users connect their Gmail first
    console.log('Extension icon clicked - popup will handle connection');
});

// Handle storage changes
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local') {
        if (changes.isConnected) {
            console.log('Connection status updated:', changes.isConnected.newValue);
        }
        if (changes.userId) {
            console.log('User ID updated:', changes.userId.newValue);
        }
    }
});
