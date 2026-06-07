document.addEventListener('DOMContentLoaded', function() {
    const authorizeBtn = document.getElementById('authorize');
    const testBtn = document.getElementById('test-connection');
    const statusDiv = document.getElementById('status');

    // Check if user is already authorized
    chrome.storage.local.get(['userId', 'isConnected'], function(result) {
        console.log('[SaAI] Popup loaded, storage result:', result);
        if (result.userId) {
            // If userId is present, ensure isConnected is set
            chrome.storage.local.set({ isConnected: true });
            console.log('[SaAI] Found userId, setting isConnected and showing test button');
            showStatus('Connected to Sa.AI Gmail Assistant', 'success');
            authorizeBtn.style.display = 'none';
            testBtn.style.display = 'block';
        } else if (result.isConnected) {
            // Fallback for legacy state
            console.log('[SaAI] Found legacy isConnected, showing test button');
            showStatus('Connected to Sa.AI Gmail Assistant', 'success');
            authorizeBtn.style.display = 'none';
            testBtn.style.display = 'block';
        } else {
            console.log('[SaAI] No connection found, showing authorize button');
        }
    });

    authorizeBtn.addEventListener('click', function() {
        showStatus('Connecting to Google...', 'info');
        
        // Send message to background script to handle OAuth
        chrome.runtime.sendMessage({
            action: 'sendToN8N',
            data: {
                endpoint: 'oauth',
                payload: { context: 'PopupConnectClicked' }
            }
        }, (response) => {
            if (response?.success) {
                console.log('[SaAI] OAuth success response from background:', response.data);
                showStatus('✅ Connected to Sa.AI!', 'success');
                authorizeBtn.style.display = 'none';
                testBtn.style.display = 'block';
                console.log('[SaAI] UI updated - authorizeBtn hidden, testBtn shown');
            } else {
                console.error('[SaAI] OAuth via background failed:', response?.error);
                showStatus('❌ Connection failed: ' + (response?.error || 'Unknown error'), 'error');
            }
        });
    });

    testBtn.addEventListener('click', function() {
        console.log('[SaAI] Test button clicked');
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            console.log('[SaAI] Current tab:', tabs[0]);
            if (tabs[0].url.includes('mail.google.com')) {
                console.log('[SaAI] Sending toggleSidebar message to tab:', tabs[0].id);
                
                // First, try to inject the content script if it's not already there
                chrome.scripting.executeScript({
                    target: { tabId: tabs[0].id },
                    files: ['content.js']
                }, function() {
                    if (chrome.runtime.lastError) {
                        console.error('[SaAI] Script injection error:', chrome.runtime.lastError);
                        showStatus('Error injecting script: ' + chrome.runtime.lastError.message, 'error');
                        return;
                    }
                    
                    // Wait a moment for the script to initialize, then send message
                    setTimeout(() => {
                        // First ping to check if content script is ready
                        chrome.tabs.sendMessage(tabs[0].id, {action: 'ping'}, function(pingResponse) {
                            if (chrome.runtime.lastError) {
                                console.error('[SaAI] Ping failed:', chrome.runtime.lastError);
                                showStatus('Content script not ready. Please refresh Gmail and try again.', 'error');
                                return;
                            }
                            
                            console.log('[SaAI] Ping successful, sending toggle message');
                            
                            // Now send the cleaner open_saai message
                            chrome.tabs.sendMessage(tabs[0].id, {action: 'open_saai'}, function(response) {
                                console.log('[SaAI] Message response:', response);
                                if (chrome.runtime.lastError) {
                                    console.error('[SaAI] Message error:', chrome.runtime.lastError);
                                    showStatus('Error: ' + chrome.runtime.lastError.message, 'error');
                                } else {
                                    console.log('[SaAI] Sa.AI Assistant opened successfully');
                                    window.close();
                                }
                            });
                        });
                    }, 500);
                });
            } else {
                console.log('[SaAI] Not on Gmail, current URL:', tabs[0].url);
                showStatus('Please open Gmail first to use the assistant', 'error');
            }
        });
    });

    function showStatus(message, type) {
        statusDiv.innerHTML = `<div class="status ${type}">${message}</div>`;
        if (type !== 'info') {
            setTimeout(() => {
                statusDiv.innerHTML = '';
            }, 3000);
        }
    }
}); 