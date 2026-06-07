// Sa.AI Gmail Assistant Content Script
// Complete rewrite for seamless Gmail integration

// Prevent duplicate script loading
if (window.saaiInitialized) {
  console.log('[SaAI] Script already initialized, skipping...');
} else {
  window.saaiInitialized = true;
  
  let SIDEBAR_WIDTH = 320; // Will be updated from storage
  const SIDEBAR_ID = 'saai-gmail-sidebar';
  const CHAT_AREA_ID = 'saai-chat-area';

  let isInitialized = false;
  let isSidebarOpen = false;
  let sidebarElement = null;

// === CORE INITIALIZATION ===

async function initialize() {
  if (isInitialized) return;
  
  console.log('[SaAI] Initializing Sa.AI Gmail Assistant');
  
  try {
    // Load saved sidebar width from storage
    try {
      const { sidebarWidth } = await chrome.storage.local.get(['sidebarWidth']);
      if (sidebarWidth && sidebarWidth >= 320 && sidebarWidth <= 500) {
        SIDEBAR_WIDTH = sidebarWidth;
        console.log('[SaAI] Loaded saved sidebar width:', SIDEBAR_WIDTH);
      }
    } catch (error) {
      console.log('[SaAI] Using default sidebar width:', SIDEBAR_WIDTH);
    }
    
    // Wait for Gmail to be fully loaded
    await waitForGmailReady();
    
    // Set up message listeners
    setupMessageListeners();
    
    // Set up storage change listeners
    setupStorageListeners();
    
    // Set up page visibility change listener
    setupVisibilityListener();
    
    // Check if sidebar should be open from previous session
    const { sidebarOpen } = await chrome.storage.local.get(['sidebarOpen']);
    console.log('[SaAI] Checking sidebar state from storage:', sidebarOpen);
    if (sidebarOpen) {
      console.log('[SaAI] Restoring sidebar from previous session');
      await openSidebar();
    } else {
      console.log('[SaAI] No previous sidebar state found, starting closed');
    }
    
    isInitialized = true;
    console.log('[SaAI] Initialization complete');
    
    // Double-check sidebar state after initialization
    await checkAndRestoreSidebarState();
    
    // Additional delayed check to ensure sidebar is properly restored
    setTimeout(async () => {
      console.log('[SaAI] Delayed sidebar state check...');
      await checkAndRestoreSidebarState();
    }, 1000);
    
  } catch (error) {
    console.error('[SaAI] Initialization failed:', error);
  }
}

// === VOICE MODE ===
let voiceSession = { 
  active: false, 
  segments: [], 
  recognizer: null, 
  mediaStream: null, 
  speaking: false,
  awaitingConfirmation: false,
  pendingCommand: null,
  errorCount: 0
};
let voiceSpeed = 1.0; // Default speed
let voiceHeartbeat = null; // Keep-alive mechanism

function setupVoiceModeControls(sidebar) {
  const voiceBtn = sidebar.querySelector('#voice-btn');
  const exitBtn = sidebar.querySelector('#voice-exit-btn');
  const indicator = sidebar.querySelector('#voice-indicator');
  const speedBtn125 = sidebar.querySelector('#voice-speed-125');
  const speedBtn150 = sidebar.querySelector('#voice-speed-150');
  const speedBtn100 = sidebar.querySelector('#voice-speed-100');
  
  if (!voiceBtn || !exitBtn || !indicator) return;

  voiceBtn.addEventListener('click', async () => {
    if (!voiceSession.active) {
      await startVoiceMode(indicator, exitBtn, voiceBtn);
    } else {
      await stopListening(indicator, voiceBtn);
    }
  });

  exitBtn.addEventListener('click', async () => {
    await exitVoiceMode(indicator, exitBtn, voiceBtn);
  });

  // Speed control buttons
  if (speedBtn100) {
    speedBtn100.addEventListener('click', () => setVoiceSpeed(1.0, speedBtn100, speedBtn125, speedBtn150));
  }
  if (speedBtn125) {
    speedBtn125.addEventListener('click', () => setVoiceSpeed(1.25, speedBtn100, speedBtn125, speedBtn150));
  }
  if (speedBtn150) {
    speedBtn150.addEventListener('click', () => setVoiceSpeed(1.5, speedBtn100, speedBtn125, speedBtn150));
  }
}

async function startVoiceMode(indicator, exitBtn, voiceBtn) {
  voiceSession.active = true;
  voiceSession.segments = [];
  voiceSession.errorCount = 0; // Reset error count
  voiceSession.awaitingConfirmation = false; // Reset confirmation state
  voiceSession.pendingCommand = null; // Clear any pending commands
  
  exitBtn.style.display = 'inline-block';
  indicator.style.display = 'flex';
  voiceBtn.textContent = '⏸️';
  
  // Load saved speed preference
  await loadVoiceSpeedPreference();
  
  // Start heartbeat to keep session alive
  startVoiceHeartbeat();
  
  await startListening(indicator);
}

function startVoiceHeartbeat() {
  // Clear any existing heartbeat
  if (voiceHeartbeat) {
    clearInterval(voiceHeartbeat);
  }
  
  // Conservative heartbeat - only restart if truly lost
  voiceHeartbeat = setInterval(() => {
    if (voiceSession.active && !voiceSession.speaking && !voiceSession.recognizer && !voiceSession.awaitingConfirmation) {
      const indicator = document.getElementById('voice-indicator');
      if (indicator) {
        console.log('[SaAI][Voice] Heartbeat: Recognition seems lost, restarting');
        startListening(indicator);
      }
    } else if (!voiceSession.active) {
      // Clean up heartbeat when voice mode is inactive
      clearInterval(voiceHeartbeat);
      voiceHeartbeat = null;
    }
  }, 10000); // Increased to 10 seconds, much less aggressive
}

async function loadVoiceSpeedPreference() {
  try {
    const { voiceSpeed: savedSpeed } = await chrome.storage.local.get(['voiceSpeed']);
    if (savedSpeed && [1.0, 1.25, 1.5].includes(savedSpeed)) {
      voiceSpeed = savedSpeed;
      
      // Update button states
      const btn100 = document.querySelector('#voice-speed-100');
      const btn125 = document.querySelector('#voice-speed-125');
      const btn150 = document.querySelector('#voice-speed-150');
      
      [btn100, btn125, btn150].forEach(btn => {
        if (btn) btn.classList.remove('active');
      });
      
      if (savedSpeed === 1.0 && btn100) btn100.classList.add('active');
      if (savedSpeed === 1.25 && btn125) btn125.classList.add('active');
      if (savedSpeed === 1.5 && btn150) btn150.classList.add('active');
    }
  } catch (e) {
    console.warn('[SaAI][Voice] Failed to load speed preference:', e);
  }
}

async function exitVoiceMode(indicator, exitBtn, voiceBtn) {
  voiceSession.active = false;
  
  // Stop heartbeat
  if (voiceHeartbeat) {
    clearInterval(voiceHeartbeat);
    voiceHeartbeat = null;
  }
  
  await stopListening(indicator, voiceBtn);
  speechSynthesis.cancel();
  
  // Render transcript
  const chatArea = document.getElementById(CHAT_AREA_ID);
  if (chatArea && voiceSession.segments.length) {
    voiceSession.segments.forEach(seg => {
      const messageDiv = document.createElement('div');
      messageDiv.className = `message ${seg.role === 'user' ? 'user' : 'bot'}-message`;
      messageDiv.innerHTML = `<div class="message-content">${seg.text}</div>`;
      chatArea.appendChild(messageDiv);
    });
    chatArea.scrollTop = chatArea.scrollHeight;
  }
  
  if (exitBtn) exitBtn.style.display = 'none';
  if (indicator) indicator.style.display = 'none';
  if (voiceBtn) voiceBtn.textContent = '🎤';
}

async function startListening(indicator) {
  // Clean up any existing recognizer first
  if (voiceSession.recognizer) {
    try {
      voiceSession.recognizer.stop();
    } catch (e) {}
    voiceSession.recognizer = null;
  }

  const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Rec) {
    updateVoiceIndicator('error', 'Speech recognition not supported');
    speak('Speech recognition is not supported in this browser');
    return;
  }

  // Test microphone access first
  try {
    await testMicrophoneAccess();
  } catch (e) {
    console.error('[SaAI][Voice] Microphone test failed:', e);
    updateVoiceIndicator('error', 'Microphone access failed');
    speak('Unable to access microphone. Please check permissions.');
    return;
  }

    const rec = new Rec();
    voiceSession.recognizer = rec;
  
  // Enhanced configuration for better accuracy
  rec.continuous = true;  // Keep listening for better flow
  rec.interimResults = true;  // Get partial results for feedback
  rec.maxAlternatives = 3;  // Get multiple interpretations
    rec.lang = 'en-US';
  
    rec.onresult = async (e) => {
    try {
      if (e.results.length > 0) {
        const result = e.results[0];
        if (result.isFinal) {
          // Get all alternatives and find the best one
          const alternatives = [];
          for (let i = 0; i < Math.min(result.length, 3); i++) {
            alternatives.push({
              transcript: result[i].transcript.trim(),
              confidence: result[i].confidence || 0
            });
          }
          
          console.log('[SaAI][Voice] Alternatives:', alternatives);
          
          // Apply smart confidence filtering
          const bestResult = getBestTranscript(alternatives);
          
          if (bestResult) {
            console.log('[SaAI][Voice] Selected:', bestResult.transcript, 'confidence:', bestResult.confidence);
            
            // Reset error count on successful recognition
            voiceSession.errorCount = 0;
            
            // Apply common corrections
            const correctedTranscript = applySpeechCorrections(bestResult.transcript);
            
            // Stop current recognition before processing
            if (voiceSession.recognizer) {
              try {
                voiceSession.recognizer.stop();
              } catch (e) {
                console.warn('[SaAI][Voice] Error stopping recognizer:', e);
              }
            }
            voiceSession.recognizer = null;
            await handleVoiceTurn(correctedTranscript, indicator, bestResult.confidence);
          } else {
            console.log('[SaAI][Voice] All alternatives below confidence threshold');
            speak('I didn\'t catch that clearly. Could you repeat?');
            // Don't stop recognition, keep listening
          }
        } else {
          // Show interim results for user feedback
          const interim = result[0].transcript;
          if (interim.length > 3) {
            updateVoiceIndicator('listening', `Hearing: "${interim}..."`);
          }
        }
      }
    } catch (error) {
      console.error('[SaAI][Voice] Error processing speech result:', error);
      speak('Sorry, there was an error processing your speech');
    }
  };
  
  rec.onerror = (e) => {
    console.error('[SaAI][Voice] Recognition error:', e.error);
    voiceSession.recognizer = null;
    
    // Handle different error types with appropriate user feedback
    switch (e.error) {
      case 'not-allowed':
        updateVoiceIndicator('error', 'Microphone access denied');
        speak('Microphone access was denied. Please allow microphone access and try again.');
        return;
        
      case 'no-speech':
        console.log('[SaAI][Voice] No speech detected, continuing...');
        // This is normal, just restart
        break;
        
      case 'audio-capture':
        updateVoiceIndicator('error', 'Audio capture failed');
        speak('Audio capture failed. Please check your microphone connection.');
        break;
        
      case 'network':
        updateVoiceIndicator('error', 'Network error');
        speak('Network error occurred. Retrying in a moment.');
        break;
        
      case 'service-not-allowed':
        updateVoiceIndicator('error', 'Speech service not allowed');
        speak('Speech recognition service is not available. Please try refreshing the page.');
        return;
        
      case 'bad-grammar':
        console.log('[SaAI][Voice] Grammar error, continuing...');
        break;
        
      default:
        console.warn('[SaAI][Voice] Unknown error:', e.error);
        updateVoiceIndicator('error', `Error: ${e.error}`);
        // Don't speak for unknown errors to prevent loops
        console.log('[SaAI][Voice] Suppressing speech for unknown error to prevent loops');
    }
    
    // For recoverable errors, restart after a delay (but limit retries)
    if (voiceSession.active && !voiceSession.speaking) {
      // Track error count to prevent infinite loops
      voiceSession.errorCount = (voiceSession.errorCount || 0) + 1;
      
      if (voiceSession.errorCount > 3) {
        console.error('[SaAI][Voice] Too many errors, stopping voice mode');
        updateVoiceIndicator('error', 'Too many errors - voice mode stopped');
        speak('Too many recognition errors occurred. Please try restarting voice mode.');
        voiceSession.active = false;
        return;
      }
      
      const delay = e.error === 'network' ? 3000 : 1500; // Longer delays
      setTimeout(() => {
        if (voiceSession.active && !voiceSession.speaking) {
          console.log('[SaAI][Voice] Restarting after error:', e.error, 'attempt:', voiceSession.errorCount);
          startListening(indicator);
        }
      }, delay);
    }
  };
  
  rec.onend = () => {
    console.log('[SaAI][Voice] Recognition ended, active:', voiceSession.active, 'speaking:', voiceSession.speaking);
    voiceSession.recognizer = null;
    
    // DON'T auto-restart here - let the speech completion handle restart
    // This prevents the continuous listening loop
    console.log('[SaAI][Voice] Not auto-restarting from onend - waiting for speech completion');
  };
  
  rec.onstart = () => {
    console.log('[SaAI][Voice] Recognition started successfully');
    updateVoiceIndicator('listening', 'Listening… (say something)');
  };
  
  try {
    rec.start();
    console.log('[SaAI][Voice] Starting new recognition session');
  } catch (err) {
    console.error('[SaAI][Voice] Failed to start recognition:', err);
    voiceSession.recognizer = null;
    updateVoiceIndicator('error', 'Failed to start listening');
  }
}

async function stopListening(indicator, voiceBtn) {
  console.log('[SaAI][Voice] Stopping listening...');
  
  if (voiceSession.recognizer) {
    try { 
      voiceSession.recognizer.onend = null; 
      voiceSession.recognizer.onerror = null;
      voiceSession.recognizer.onresult = null;
      voiceSession.recognizer.onstart = null;
      voiceSession.recognizer.stop(); 
    } catch (err) {
      console.warn('[SaAI][Voice] Error stopping recognizer:', err);
    }
    voiceSession.recognizer = null;
  }
  
  if (voiceSession.mediaStream) {
    voiceSession.mediaStream.getTracks().forEach(t => t.stop());
    voiceSession.mediaStream = null;
  }
  
  if (indicator) indicator.style.display = 'none';
  if (voiceBtn) voiceBtn.textContent = '🎤';
}

async function handleVoiceTurn(userText, indicator, confidence = 1) {
  console.log('[SaAI][Voice] Processing:', userText, 'confidence:', confidence);
  
  // Check for voice commands first
  if (handleVoiceCommands(userText)) {
    return;
  }
  
  // Check if we need confirmation for this command
  if (shouldConfirmCommand(userText, confidence)) {
    await handleCommandConfirmation(userText, indicator, confidence);
    return;
  }
  
  voiceSession.segments.push({ role: 'user', text: userText });
  updateVoiceIndicator('processing', 'Processing…');
  
  // Simplified payload for faster processing
  const { isOnThreadPage, threadId, subjectLine } = getThreadContext();
  const userId = await getOrGenerateUserId();
  
  const payload = {
    query: userText,
    userId: userId,
    context: 'GmailChat',
    voiceMode: true
  };
  
  // Only add thread context if it's a summarize request
  if (/summari[sz]e\s+(this\s+)?thread/i.test(userText) && isOnThreadPage && threadId) {
    payload.action = 'summarize_thread';
    payload.threadId = threadId;
    if (subjectLine) payload.subjectLine = subjectLine;
  }
  
  let replyText = 'I understand.';
  
  try {
    console.log('[SaAI][Voice] Sending to n8n...');
    const startTime = Date.now();
    
    const resp = await chrome.runtime.sendMessage({ 
      action: 'sendToN8N', 
      data: { endpoint: 'chat', payload } 
    });
    
    const endTime = Date.now();
    console.log('[SaAI][Voice] Response time:', endTime - startTime, 'ms');
    console.log('[SaAI][Voice] Full response:', JSON.stringify(resp, null, 2));
    
    if (resp && resp.success) {
      const data = resp.data;
      console.log('[SaAI][Voice] Response data:', JSON.stringify(data, null, 2));
      
      const extractedText = extractVoiceReplyText(data);
      console.log('[SaAI][Voice] Extracted text:', extractedText);
      
      if (extractedText && extractedText.trim()) {
        replyText = extractedText;
      } else {
        console.warn('[SaAI][Voice] No valid text extracted, using fallback');
        replyText = 'I received your request but couldn\'t extract a proper response.';
      }
    } else {
      console.error('[SaAI][Voice] Request failed:', resp);
      replyText = 'Sorry, I had trouble with that request.';
    }
  } catch (e) {
    console.error('[SaAI][Voice] Error:', e);
    replyText = 'Network issue. Please try again.';
  }
  
  console.log('[SaAI][Voice] Speaking:', replyText);
  voiceSession.segments.push({ role: 'assistant', text: replyText });
  await speak(replyText);
}

function extractVoiceReplyText(data) {
  console.log('[SaAI][Voice] extractVoiceReplyText input:', typeof data, data);
  
  try {
    if (!data) {
      console.log('[SaAI][Voice] No data provided');
      return '';
    }
    
    // If server wrapped in array, use first item
    if (Array.isArray(data) && data.length > 0) {
      console.log('[SaAI][Voice] Data is array, using first item');
      data = data[0];
    }
    
    // If data is a string, try to parse as JSON or return as-is
    if (typeof data === 'string') {
      console.log('[SaAI][Voice] Data is string:', data);
      // Sometimes n8n returns a JSON string
      if (data.trim().startsWith('{') || data.trim().startsWith('[')) {
        try { 
          data = JSON.parse(data);
          console.log('[SaAI][Voice] Parsed JSON string:', data);
        } catch { 
          console.log('[SaAI][Voice] Failed to parse JSON, returning string as-is');
          return data.trim(); 
        }
      } else {
        return data.trim();
      }
    }
    
    // Check common response fields
    const fields = ['message', 'replyText', 'reply', 'response', 'text', 'content', 'summary'];
    
    for (const field of fields) {
      if (data[field]) {
        console.log('[SaAI][Voice] Found field:', field, typeof data[field]);
        
        if (typeof data[field] === 'string' && data[field].trim()) {
          console.log('[SaAI][Voice] Returning string field:', field);
          return data[field].trim();
        }
        
        if (typeof data[field] === 'object') {
          console.log('[SaAI][Voice] Processing object field:', field);
          const extracted = extractVoiceReplyText(data[field]);
          if (extracted) return extracted;
        }
      }
    }
    
    // Handle reply field specially (legacy support)
    if (data.reply) {
      let r = data.reply;
      console.log('[SaAI][Voice] Processing reply field:', typeof r);
      
      if (typeof r === 'string') {
        // If reply contains JSON, parse it
        if (r.trim().startsWith('{') || r.trim().startsWith('[')) {
          try { 
            r = JSON.parse(r); 
            console.log('[SaAI][Voice] Parsed reply JSON:', r);
          } catch {
            console.log('[SaAI][Voice] Failed to parse reply JSON, using string');
            return r.trim();
          }
        } else {
          return r.trim();
        }
      }
      
      // If reply is an array of result objects
      if (Array.isArray(r)) {
        console.log('[SaAI][Voice] Reply is array with', r.length, 'items');
        const parts = [];
        for (const item of r) {
          if (!item) continue;
          if (typeof item.summary === 'string' && item.summary.trim()) parts.push(item.summary.trim());
          else if (typeof item.message === 'string' && item.message.trim()) parts.push(item.message.trim());
          else if (typeof item.text === 'string' && item.text.trim()) parts.push(item.text.trim());
        }
        if (parts.length) {
          console.log('[SaAI][Voice] Extracted from reply array:', parts.join(' '));
          return parts.join(' ');
      }
      }
      
      // If reply is an object
      if (r && typeof r === 'object') {
        console.log('[SaAI][Voice] Reply is object, recursing');
        const extracted = extractVoiceReplyText(r);
        if (extracted) return extracted;
      }
    }
    
    // Check if it's a structured email summary
    const keys = ['high_priority_emails','medium_priority','low_priority','already_replied_closed_threads','missed_or_ignored_emails'];
    let found = false; const parts = [];
    for (const k of keys) {
      if (Array.isArray(data[k])) { 
        found = true; 
        parts.push(`${data[k].length} in ${k.replace(/_/g,' ')}`); 
      }
    }
    if (found) {
      const summary = `Summary prepared: ${parts.join(', ')}. Say show chat to view details.`;
      console.log('[SaAI][Voice] Generated email summary:', summary);
      return summary;
    }
    
    console.log('[SaAI][Voice] No extractable text found in data');
    return '';
    
  } catch (e) {
    console.error('[SaAI][Voice] extractVoiceReplyText failed:', e);
  return '';
  }
}

async function speak(text) {
  voiceSession.speaking = true;
  updateVoiceIndicator('speaking', 'Speaking…');
  
  try {
    // Cancel any ongoing speech
    speechSynthesis.cancel();
    
    // Wait for cancellation to complete
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const utter = new SpeechSynthesisUtterance(text);
    
    // Enhanced voice settings
    const voices = speechSynthesis.getVoices();
    const preferredVoice = voices.find(v => 
      v.lang.startsWith('en') && v.name.includes('Google')
    ) || voices.find(v => v.lang.startsWith('en'));
    
    if (preferredVoice) {
      utter.voice = preferredVoice;
    }
    
    utter.rate = voiceSpeed;
    utter.pitch = 1.0;
    utter.volume = 0.8;
    
    // Add pauses for better comprehension
    const processedText = text
      .replace(/\./g, '. ')
      .replace(/,/g, ', ')
      .replace(/:/g, ': ');
    utter.text = processedText;
    
    utter.onend = () => { 
      console.log('[SaAI][Voice] Speech finished, voiceSession.active:', voiceSession.active);
      voiceSession.speaking = false;
      
      // Only restart if voice mode is active and we don't already have a recognizer
      if (voiceSession.active && !voiceSession.recognizer) {
        console.log('[SaAI][Voice] Scheduling recognition restart after speech...');
        setTimeout(() => {
          console.log('[SaAI][Voice] Speech timeout - active:', voiceSession.active, 'speaking:', voiceSession.speaking, 'recognizer:', !!voiceSession.recognizer);
          if (voiceSession.active && !voiceSession.speaking && !voiceSession.recognizer) {
            const indicator = document.getElementById('voice-indicator');
            if (indicator) {
              console.log('[SaAI][Voice] ✅ Restarting recognition after speech');
              startListening(indicator);
            } else {
              console.log('[SaAI][Voice] ❌ No indicator found for restart');
            }
          } else {
            console.log('[SaAI][Voice] ❌ Not restarting - conditions not met');
          }
        }, 1500); // Longer delay to ensure speech is fully finished
      } else {
        console.log('[SaAI][Voice] ❌ Not scheduling restart - active:', voiceSession.active, 'recognizer exists:', !!voiceSession.recognizer);
      }
    };
    
    utter.onerror = (e) => {
      console.error('[SaAI][Voice] Speech error:', e);
      voiceSession.speaking = false;
      updateVoiceIndicator('error', 'Speech error');
    };
    
    speechSynthesis.speak(utter);
  } catch (e) {
    console.error('[SaAI][Voice] Speak error:', e);
    voiceSession.speaking = false;
    updateVoiceIndicator('error', 'Speech error');
  }
}

async function setVoiceSpeed(speed, btn100, btn125, btn150) {
  voiceSpeed = speed;
  
  // Update button states
  [btn100, btn125, btn150].forEach(btn => {
    if (btn) btn.classList.remove('active');
  });
  
  if (speed === 1.0 && btn100) btn100.classList.add('active');
  if (speed === 1.25 && btn125) btn125.classList.add('active');
  if (speed === 1.5 && btn150) btn150.classList.add('active');
  
  // Save preference
  try {
    await chrome.storage.local.set({ voiceSpeed: speed });
  } catch (e) {
    console.warn('[SaAI][Voice] Failed to save speed preference:', e);
  }
  
  // Test the new speed if voice mode is active
  if (voiceSession.active) {
    speak('Speed updated');
  }
}

// Enhanced UI feedback function
function updateVoiceIndicator(state, message) {
  const indicator = document.getElementById('voice-indicator');
  if (!indicator) return;
  
  const label = indicator.querySelector('.label');
  const bars = indicator.querySelectorAll('.bars i');
  
  switch (state) {
    case 'listening':
      label.textContent = message || 'Listening…';
      bars.forEach(bar => bar.style.animation = 'saai-bars 1s infinite ease-in-out');
      bars.forEach(bar => bar.style.background = '#0f172a');
      break;
    case 'processing':
      label.textContent = message || 'Processing…';
      bars.forEach(bar => bar.style.animation = 'none');
      bars.forEach(bar => bar.style.background = '#f59e0b');
      break;
    case 'speaking':
      label.textContent = message || 'Speaking…';
      bars.forEach(bar => bar.style.animation = 'none');
      bars.forEach(bar => bar.style.background = '#3b82f6');
      break;
    case 'error':
      label.textContent = message || 'Error occurred';
      bars.forEach(bar => bar.style.animation = 'none');
      bars.forEach(bar => bar.style.background = '#ef4444');
      break;
  }
}

// Voice commands handler
function handleVoiceCommands(text) {
  const lowerText = text.toLowerCase();
  
  if (lowerText.includes('stop') || lowerText.includes('exit voice')) {
    const indicator = document.getElementById('voice-indicator');
    const exitBtn = document.querySelector('#voice-exit-btn');
    const voiceBtn = document.querySelector('#voice-btn');
    exitVoiceMode(indicator, exitBtn, voiceBtn);
    return true;
  }
  
  if (lowerText.includes('repeat') || lowerText.includes('say again')) {
    const lastResponse = voiceSession.segments
      .filter(s => s.role === 'assistant')
      .pop();
    if (lastResponse) {
      speak(lastResponse.text);
      return true;
    }
  }
  
  if (lowerText.includes('clear chat') || lowerText.includes('start over')) {
    voiceSession.segments = [];
    speak('Chat cleared. How can I help you?');
    return true;
  }
  
  if (lowerText.includes('slower') || lowerText.includes('slow down')) {
    if (voiceSpeed > 1.0) {
      const newSpeed = voiceSpeed === 1.5 ? 1.25 : 1.0;
      const btn100 = document.querySelector('#voice-speed-100');
      const btn125 = document.querySelector('#voice-speed-125');
      const btn150 = document.querySelector('#voice-speed-150');
      setVoiceSpeed(newSpeed, btn100, btn125, btn150);
      speak('Speed reduced');
      return true;
    }
  }
  
  if (lowerText.includes('faster') || lowerText.includes('speed up')) {
    if (voiceSpeed < 1.5) {
      const newSpeed = voiceSpeed === 1.0 ? 1.25 : 1.5;
      const btn100 = document.querySelector('#voice-speed-100');
      const btn125 = document.querySelector('#voice-speed-125');
      const btn150 = document.querySelector('#voice-speed-150');
      setVoiceSpeed(newSpeed, btn100, btn125, btn150);
      speak('Speed increased');
      return true;
    }
  }
  
  return false;
}

// === VOICE QUALITY IMPROVEMENTS ===

async function testMicrophoneAccess() {
  return new Promise(async (resolve, reject) => {
    try {
      // Simple microphone access test - just check if we can get the stream
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      
      console.log('[SaAI][Voice] Microphone access granted');
      
      // Clean up immediately - don't test levels as it's causing issues
      stream.getTracks().forEach(track => track.stop());
      
      resolve();
      
    } catch (error) {
      console.error('[SaAI][Voice] Microphone access failed:', error);
      reject(error);
    }
  });
}

function getBestTranscript(alternatives) {
  if (!alternatives || alternatives.length === 0) return null;
  
  // Filter by confidence and length
  const validAlternatives = alternatives.filter(alt => {
    const transcript = alt.transcript.trim();
    if (!transcript) return false;
    
    // Dynamic confidence threshold based on length
    const minConfidence = transcript.length > 10 ? 0.6 : 0.75;
    return alt.confidence >= minConfidence;
  });
  
  if (validAlternatives.length === 0) return null;
  
  // Sort by confidence and return best
  return validAlternatives.sort((a, b) => b.confidence - a.confidence)[0];
}

function applySpeechCorrections(transcript) {
  if (!transcript) return transcript;
  
  // Common misheard words in email/assistant context
  const corrections = {
    // Email related
    'e-mail': 'email',
    'gmail': 'email', 
    'male': 'email',
    'mail': 'email',
    
    // Actions
    'some arise': 'summarize',
    'sum arise': 'summarize',
    'summary': 'summarize',
    'some rice': 'summarize',
    
    // Thread related
    'red': 'thread',
    'bread': 'thread', 
    'threat': 'thread',
    'fred': 'thread',
    
    // Common commands
    'show me': 'show',
    'tell me': 'tell',
    'open up': 'open',
    'close down': 'close',
    
    // Technical terms
    'in box': 'inbox',
    'chat bot': 'chatbot',
    'ai assistant': 'AI assistant'
  };
  
  let corrected = transcript.toLowerCase();
  
  // Apply corrections
  for (const [wrong, right] of Object.entries(corrections)) {
    const regex = new RegExp(`\\b${wrong}\\b`, 'gi');
    corrected = corrected.replace(regex, right);
  }
  
  // Clean up extra spaces
  corrected = corrected.replace(/\s+/g, ' ').trim();
  
  if (corrected !== transcript.toLowerCase()) {
    console.log('[SaAI][Voice] Applied correction:', transcript, '->', corrected);
  }
  
  return corrected;
}

function shouldConfirmCommand(transcript, confidence) {
  // Confirm if confidence is low or command seems critical
  if (confidence < 0.7) return true;
  
  // Critical commands that should be confirmed
  const criticalCommands = [
    'delete', 'remove', 'clear', 'exit', 'stop', 'close',
    'send email', 'reply', 'forward', 'archive'
  ];
  
  const lowerTranscript = transcript.toLowerCase();
  return criticalCommands.some(cmd => lowerTranscript.includes(cmd));
}

async function handleCommandConfirmation(userText, indicator, confidence) {
  console.log('[SaAI][Voice] Requesting confirmation for:', userText);
  
  // Store the pending command
  voiceSession.pendingCommand = { text: userText, confidence };
  
  if (confidence < 0.7) {
    speak(`I heard "${userText}" but I'm not completely sure. Say "yes" to confirm or repeat your command.`);
  } else {
    speak(`Did you say "${userText}"? Say "yes" to confirm or "no" to cancel.`);
  }
  
  // Set flag to handle next input as confirmation
  voiceSession.awaitingConfirmation = true;
}

// Enhanced voice command handler that includes confirmation responses
function handleVoiceCommands(text) {
  const lowerText = text.toLowerCase().trim();
  
  // Handle confirmation responses
  if (voiceSession.awaitingConfirmation) {
    voiceSession.awaitingConfirmation = false;
    
    if (lowerText.includes('yes') || lowerText.includes('confirm') || lowerText.includes('correct')) {
      const pendingCommand = voiceSession.pendingCommand;
      if (pendingCommand) {
        speak('Confirmed. Processing your request.');
        voiceSession.pendingCommand = null;
        // Process the original command
        setTimeout(() => {
          const indicator = document.getElementById('voice-indicator');
          handleVoiceTurn(pendingCommand.text, indicator, 1.0); // Set confidence to 1.0 since confirmed
        }, 500);
        return true;
      }
    } else if (lowerText.includes('no') || lowerText.includes('cancel') || lowerText.includes('wrong')) {
      speak('Cancelled. What would you like me to do?');
      voiceSession.pendingCommand = null;
      return true;
    } else {
      // Treat as new command if not yes/no
      voiceSession.pendingCommand = null;
      speak('Let me process that as a new command.');
      return false; // Let it be processed as normal command
    }
  }
  
  // Original voice commands...
  if (lowerText.includes('stop') || lowerText.includes('exit voice')) {
    const indicator = document.getElementById('voice-indicator');
    const exitBtn = document.querySelector('#voice-exit-btn');
    const voiceBtn = document.querySelector('#voice-btn');
    exitVoiceMode(indicator, exitBtn, voiceBtn);
    return true;
  }
  
  if (lowerText.includes('repeat') || lowerText.includes('say again')) {
    const lastResponse = voiceSession.segments
      .filter(s => s.role === 'assistant')
      .pop();
    if (lastResponse) {
      speak(lastResponse.text);
      return true;
    }
  }
  
  if (lowerText.includes('clear chat') || lowerText.includes('start over')) {
    voiceSession.segments = [];
    speak('Chat cleared. How can I help you?');
    return true;
  }
  
  if (lowerText.includes('slower') || lowerText.includes('slow down')) {
    if (voiceSpeed > 1.0) {
      const newSpeed = voiceSpeed === 1.5 ? 1.25 : 1.0;
      const btn100 = document.querySelector('#voice-speed-100');
      const btn125 = document.querySelector('#voice-speed-125');
      const btn150 = document.querySelector('#voice-speed-150');
      setVoiceSpeed(newSpeed, btn100, btn125, btn150);
      speak('Speed reduced');
      return true;
    }
  }
  
  if (lowerText.includes('faster') || lowerText.includes('speed up')) {
    if (voiceSpeed < 1.5) {
      const newSpeed = voiceSpeed === 1.0 ? 1.25 : 1.5;
      const btn100 = document.querySelector('#voice-speed-100');
      const btn125 = document.querySelector('#voice-speed-125');
      const btn150 = document.querySelector('#voice-speed-150');
      setVoiceSpeed(newSpeed, btn100, btn125, btn150);
      speak('Speed increased');
      return true;
    }
  }
  
  return false;
}
async function checkAndRestoreSidebarState() {
  try {
    const { sidebarOpen } = await chrome.storage.local.get(['sidebarOpen']);
    console.log('[SaAI] Post-initialization sidebar state check:', sidebarOpen);
    
    if (sidebarOpen && !isSidebarOpen) {
      console.log('[SaAI] Sidebar should be open but isn\'t, restoring...');
      await openSidebar();
    } else if (!sidebarOpen && isSidebarOpen) {
      console.log('[SaAI] Sidebar should be closed but isn\'t, closing...');
      await closeSidebar();
    } else {
      console.log('[SaAI] Sidebar state is consistent');
    }
    
    // Additional check: if sidebar should be open but element doesn't exist
    if (sidebarOpen && !document.getElementById(SIDEBAR_ID)) {
      console.log('[SaAI] Sidebar should be open but element missing, recreating...');
      await openSidebar();
    }
  } catch (error) {
    console.error('[SaAI] Error checking sidebar state:', error);
  }
}

async function waitForGmailReady() {
  return new Promise((resolve) => {
    const checkGmail = () => {
      // Check if Gmail's main containers are present
      const gmailContainer = document.querySelector('.nH, .AO, [role="main"]');
      if (gmailContainer) {
        resolve();
      } else {
        setTimeout(checkGmail, 100);
      }
    };
    checkGmail();
  });
}

function setupMessageListeners() {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('[SaAI] Message received:', request);
    
    switch (request.action) {
      case 'ping':
        sendResponse({ status: 'ready' });
        break;
        
      case 'open_saai':
        toggleSidebar().then(() => {
          sendResponse({ success: true });
        }).catch(error => {
          sendResponse({ success: false, error: error.message });
        });
        return true; // Keep message channel open for async response
        
      case 'checkInitialization':
        sendResponse({ initialized: isInitialized });
        break;
    }
  });
}

function setupStorageListeners() {
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local') {
      if (changes.isConnected) {
        console.log('[SaAI] Connection status changed:', changes.isConnected.newValue);
        if (isSidebarOpen) {
          updateSidebarContent();
        }
      }
    }
  });
}

function setupVisibilityListener() {
  document.addEventListener('visibilitychange', async () => {
    if (!document.hidden) {
      console.log('[SaAI] Page became visible, checking sidebar state...');
      await checkAndRestoreSidebarState();
    }
  });
}

// === CHAT HISTORY MANAGEMENT ===

function saveChatHistory() {
  try {
    const chatArea = document.getElementById(CHAT_AREA_ID);
    if (!chatArea) return;
    
    const messages = Array.from(chatArea.querySelectorAll('.message')).map(messageDiv => {
      const isUser = messageDiv.classList.contains('user-message');
      const content = messageDiv.querySelector('.message-content');
      return {
        type: isUser ? 'user' : 'bot',
        content: content ? content.innerHTML : '',
        timestamp: Date.now()
      };
    });
    
    chrome.storage.local.set({ chatHistory: messages });
    console.log('[SaAI] Chat history saved:', messages.length, 'messages');
  } catch (error) {
    console.error('[SaAI] Error saving chat history:', error);
  }
}

function loadChatHistory() {
  try {
    const chatArea = document.getElementById(CHAT_AREA_ID);
    if (!chatArea) return;
    
    chrome.storage.local.get(['chatHistory'], (result) => {
      if (result.chatHistory && result.chatHistory.length > 0) {
        console.log('[SaAI] Loading chat history:', result.chatHistory.length, 'messages');
        
        // Clear existing content
        chatArea.innerHTML = '';
        
        // Load each message
        result.chatHistory.forEach(messageData => {
          const messageDiv = document.createElement('div');
          messageDiv.className = `message ${messageData.type}-message`;
          messageDiv.innerHTML = `
            <div class="message-content">
              ${messageData.content}
            </div>
          `;
          chatArea.appendChild(messageDiv);
        });
        
        // Scroll to bottom
        chatArea.scrollTop = chatArea.scrollHeight;
        
        console.log('[SaAI] Chat history loaded successfully');
      }
    });
  } catch (error) {
    console.error('[SaAI] Error loading chat history:', error);
  }
}

function clearChatHistory() {
  try {
    chrome.storage.local.remove(['chatHistory']);
    console.log('[SaAI] Chat history cleared');
  } catch (error) {
    console.error('[SaAI] Error clearing chat history:', error);
  }
}

// === SIDEBAR MANAGEMENT ===

async function toggleSidebar() {
  console.log('[SaAI] Toggle sidebar called, current state:', isSidebarOpen);
  
  if (isSidebarOpen) {
    await closeSidebar();
  } else {
    await openSidebar();
  }
}

async function openSidebar() {
  if (isSidebarOpen) return;
  
  console.log('[SaAI] Opening sidebar');
  
  try {
    // Create and inject sidebar
    await createSidebar();
    
    // Adjust Gmail layout
    adjustGmailLayout(true);
    
    // Update state
    isSidebarOpen = true;
    await chrome.storage.local.set({ sidebarOpen: true });
    
    console.log('[SaAI] Sidebar opened successfully, state saved');
    
  } catch (error) {
    console.error('[SaAI] Failed to open sidebar:', error);
    throw error;
  }
}

async function closeSidebar() {
  if (!isSidebarOpen) return;
  
  console.log('[SaAI] Closing sidebar');
  
  try {
    // Remove sidebar element
    if (sidebarElement) {
      sidebarElement.remove();
      sidebarElement = null;
    }
    
    // Restore Gmail layout
    adjustGmailLayout(false);
    
    // Clean up flex container if no sidebar is open
    const flexContainer = document.querySelector('.saai-flex-container');
    if (flexContainer) {
      // Move all children back to .nH
      const gmailMainWrapper = document.querySelector('.nH');
      if (gmailMainWrapper) {
        while (flexContainer.firstChild) {
          gmailMainWrapper.appendChild(flexContainer.firstChild);
        }
        flexContainer.remove();
      }
    }
    
    // Update state
    isSidebarOpen = false;
    await chrome.storage.local.set({ sidebarOpen: false });
    
    console.log('[SaAI] Sidebar closed successfully');
    
  } catch (error) {
    console.error('[SaAI] Failed to close sidebar:', error);
    throw error;
  }
}

async function createSidebar() {
  // Check connection status
  const isConnected = await isGmailConnected();
  
  // Find Gmail's main wrapper container (.nH)
  const gmailMainWrapper = document.querySelector('.nH');
  
  if (!gmailMainWrapper) {
    console.error('[SaAI] Could not find Gmail main wrapper (.nH)');
    return;
  }
  
  // Check if we already have a flex container
  let flexContainer = gmailMainWrapper.querySelector('.saai-flex-container');
  
  if (!flexContainer) {
    // Create flex container to hold Gmail content and sidebar
    flexContainer = document.createElement('div');
    flexContainer.className = 'saai-flex-container';
    flexContainer.style.cssText = `
      display: flex !important;
      width: 100% !important;
      height: 100vh !important;
      position: relative !important;
      box-sizing: border-box !important;
      margin: 0 !important;
      padding: 0 !important;
      gap: 0 !important;
    `;
    
    // Move all existing children of .nH into the flex container
    while (gmailMainWrapper.firstChild) {
      flexContainer.appendChild(gmailMainWrapper.firstChild);
    }
    
    // Add flex container back to .nH
    gmailMainWrapper.appendChild(flexContainer);
  }
  
  // Create sidebar container
  sidebarElement = document.createElement('div');
  sidebarElement.id = SIDEBAR_ID;
  sidebarElement.className = 'saai-sidebar';
  
  // Apply saved width to sidebar
  sidebarElement.style.width = `${SIDEBAR_WIDTH}px`;
  sidebarElement.style.setProperty('--saai-sidebar-width', `${SIDEBAR_WIDTH}px`);
  
  // Set content based on connection status
  if (isConnected) {
    sidebarElement.innerHTML = createWelcomePageHTML();
  } else {
    sidebarElement.innerHTML = createConnectPromptHTML();
  }
  
  // Add resize handle (always add, regardless of connection status)
  const resizeHandle = document.createElement('div');
  resizeHandle.className = 'saai-resize-handle';
  resizeHandle.title = 'Drag to resize sidebar';
  sidebarElement.appendChild(resizeHandle);
  
  console.log('[SaAI] Resize handle created and added to sidebar');
  
  // Add sidebar to flex container
  flexContainer.appendChild(sidebarElement);
  
  // Add event listeners
  addSidebarEventListeners(sidebarElement, isConnected);
  
  // Add resize functionality
  addResizeFunctionality(sidebarElement, resizeHandle);
  
  // Add CSS class to body
  document.body.classList.add('saai-sidebar-open');
}

function addResizeFunctionality(sidebar, resizeHandle) {
  let isResizing = false;
  let startX = 0;
  let startWidth = 0;
  
  const startResize = (e) => {
    isResizing = true;
    startX = e.clientX;
    startWidth = SIDEBAR_WIDTH;
    
    document.addEventListener('mousemove', resize);
    document.addEventListener('mouseup', stopResize);
    
    // Prevent text selection during resize
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
  };
  
  const resize = (e) => {
    if (!isResizing) return;
    
    const deltaX = startX - e.clientX;
    let newWidth = startWidth + deltaX; // Fixed: drag left = wider, drag right = narrower
    
    console.log('[SaAI] Resize debug:', {
      startX,
      currentX: e.clientX,
      deltaX,
      startWidth,
      newWidth,
      direction: e.clientX < startX ? 'left (should be wider)' : 'right (should be narrower)',
      result: newWidth > startWidth ? 'wider' : 'narrower'
    });
    
    // Apply min/max constraints
    newWidth = Math.max(320, Math.min(500, newWidth));
    
    // Update sidebar width
    SIDEBAR_WIDTH = newWidth;
    sidebar.style.width = `${newWidth}px`;
    sidebar.style.setProperty('--saai-sidebar-width', `${newWidth}px`);
    
    // Update Gmail layout
    adjustGmailLayout(true);
  };
  
  const stopResize = () => {
    if (!isResizing) return;
    
    isResizing = false;
    
    // Save width to storage
    chrome.storage.local.set({ sidebarWidth: SIDEBAR_WIDTH });
    console.log('[SaAI] Saved sidebar width:', SIDEBAR_WIDTH);
    
    // Restore cursor and selection
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
    
    document.removeEventListener('mousemove', resize);
    document.removeEventListener('mouseup', stopResize);
  };
  
  // Add event listeners to resize handle
  resizeHandle.addEventListener('mousedown', startResize);
  
  // Prevent drag events on resize handle
  resizeHandle.addEventListener('dragstart', (e) => e.preventDefault());
}

function adjustGmailLayout(sidebarOpen) {
  console.log('[SaAI] Adjusting Gmail layout, sidebar open:', sidebarOpen);
  
  // Find the flex container
  const flexContainer = document.querySelector('.saai-flex-container');
  if (!flexContainer) {
    console.log('[SaAI] No flex container found, layout adjustment not needed');
    return;
  }
  
  // Get all direct children of the flex container (Gmail content + sidebar)
  const flexChildren = Array.from(flexContainer.children);
  
  flexChildren.forEach(child => {
    if (child.id === SIDEBAR_ID) {
      // This is our sidebar - keep it as is
      return;
    }
    
    // This is Gmail content - adjust its flex properties
    if (sidebarOpen) {
      // When sidebar is open, make Gmail content take remaining space
      const currentWidth = SIDEBAR_WIDTH;
      child.style.flex = `1 1 calc(100vw - ${currentWidth}px) !important`;
      child.style.width = `calc(100vw - ${currentWidth}px) !important`;
      child.style.maxWidth = `calc(100vw - ${currentWidth}px) !important`;
      child.style.minWidth = `calc(100vw - ${currentWidth}px) !important`;
      child.style.boxSizing = 'border-box !important';
      child.style.overflow = 'hidden !important';
    } else {
      // When sidebar is closed, restore full width
      child.style.flex = '1 1 100vw !important';
      child.style.width = '100vw !important';
      child.style.maxWidth = '100vw !important';
      child.style.minWidth = '100vw !important';
      child.style.boxSizing = 'border-box !important';
      child.style.overflow = 'auto !important';
    }
  });
  
  // Prevent horizontal scrolling when sidebar is open
  if (sidebarOpen) {
    document.body.style.overflowX = 'hidden !important';
    document.documentElement.style.overflowX = 'hidden !important';
  } else {
    document.body.style.overflowX = 'auto !important';
    document.documentElement.style.overflowX = 'auto !important';
  }
}

// === UI COMPONENTS ===

function createChatInterfaceHTML() {
  return `
    <div class="saai-header">
      <span class="saai-title">Sa.AI Assistant</span>
      <div class="saai-header-actions">
        <button id="task-list-btn" class="saai-task-btn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="9,11 12,14 22,4"/>
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
          </svg>
          Tasks
        </button>
        <button id="clear-chat-btn" class="saai-task-btn" title="Clear chat history">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 6h18"/>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>
            <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
          </svg>
          Clear
        </button>
        <button id="close-sidebar" class="saai-close-btn" title="Close">×</button>
      </div>
    </div>
    <div id="${CHAT_AREA_ID}" class="chat-area">
      <div class="chat-welcome">
        <div class="chat-welcome-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
        </div>
        <h3 class="chat-welcome-title">Hi! I'm your Gmail assistant</h3>
        <p class="chat-welcome-subtitle">How can I help you today?</p>
      </div>
    </div>
    <div class="chat-input-container">
      <input type="text" id="chat-input" placeholder="Ask me anything about your emails..." />
      <button id="voice-btn" class="saai-voice-btn" title="Voice mode">🎤</button>
      <button id="voice-exit-btn" class="saai-voice-exit-btn" title="Show chat transcript" style="display:none">Show Chat</button>
      <button id="send-btn">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="22" y1="2" x2="11" y2="13"/>
          <polygon points="22,2 15,22 11,13 2,9 22,2"/>
        </svg>
      </button>
    </div>
    <div id="voice-indicator" class="saai-voice-indicator" style="display:none">
      <span class="mic">🎙️</span>
      <span class="bars"><i></i><i></i><i></i></span>
      <span class="label">Listening…</span>
      <div class="voice-speed-controls">
        <button id="voice-speed-100" class="voice-speed-btn active" title="Normal speed">1.0x</button>
        <button id="voice-speed-125" class="voice-speed-btn" title="1.25x speed">1.25x</button>
        <button id="voice-speed-150" class="voice-speed-btn" title="1.5x speed">1.5x</button>
      </div>
    </div>
  `;
}

function createConnectPromptHTML() {
  return `
    <div class="saai-header">
      <span class="saai-title">Sa.AI Assistant</span>
      <button id="close-sidebar" class="saai-close-btn" title="Close">×</button>
    </div>
    <div class="saai-connect-content">
      <div class="saai-connect-icon">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 3l1.912 5.813a2 2 0 0 0 1.088 1.088L21 12l-5.813 1.912a2 2 0 0 0-1.088 1.088L12 21l-1.912-5.813a2 2 0 0 0-1.088-1.088L3 12l5.813-1.912a2 2 0 0 0 1.088-1.088L12 3z"/>
        </svg>
      </div>
      
      <h2 class="saai-connect-heading">Welcome to Sa.AI</h2>
      
      <p class="saai-connect-description">
        Your intelligent Gmail assistant is ready to help you manage your inbox more efficiently.
      </p>

      <div class="saai-features">
        <div class="saai-feature-card">
          <div class="saai-feature-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
              <polyline points="22,6 12,13 2,6"/>
            </svg>
          </div>
          <div class="saai-feature-content">
            <h4 class="saai-feature-title">Inbox Summarization</h4>
            <p class="saai-feature-description">Get instant summaries of your important emails</p>
          </div>
        </div>
        
        <div class="saai-feature-card">
          <div class="saai-feature-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 3l1.912 5.813a2 2 0 0 0 1.088 1.088L21 12l-5.813 1.912a2 2 0 0 0-1.088 1.088L12 21l-1.912-5.813a2 2 0 0 0-1.088-1.088L3 12l5.813-1.912a2 2 0 0 0 1.088-1.088L12 3z"/>
            </svg>
          </div>
          <div class="saai-feature-content">
            <h4 class="saai-feature-title">Task Extraction</h4>
            <p class="saai-feature-description">Automatically extract tasks and action items</p>
          </div>
        </div>
        
        <div class="saai-feature-card">
          <div class="saai-feature-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
            </svg>
          </div>
          <div class="saai-feature-content">
            <h4 class="saai-feature-title">Smart Drafting</h4>
            <p class="saai-feature-description">AI-powered email composition assistance</p>
          </div>
        </div>
      </div>

      <button id="saai-connect-btn" class="saai-connect-button">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
          <polyline points="22,6 12,13 2,6"/>
        </svg>
        Connect Gmail Account
      </button>
      
      <p class="saai-disclaimer">
        We'll need access to your Gmail to provide personalized assistance
      </p>
    </div>
  `;
}

function createWelcomePageHTML() {
  return `
    <div class="saai-header">
      <span class="saai-title">Sa.AI Assistant</span>
      <button id="close-sidebar" class="saai-close-btn" title="Close">×</button>
    </div>
    <div class="saai-welcome-content">
      <div class="saai-welcome-icon">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 3l1.912 5.813a2 2 0 0 0 1.088 1.088L21 12l-5.813 1.912a2 2 0 0 0-1.088 1.088L12 21l-1.912-5.813a2 2 0 0 0-1.088-1.088L3 12l5.813-1.912a2 2 0 0 0 1.088-1.088L12 3z"/>
        </svg>
      </div>
      
      <h2 class="saai-welcome-heading">Let's start!</h2>
      
      <p class="saai-welcome-description">
        Your Gmail is now connected. I'm ready to help you manage your inbox more efficiently.
      </p>

      <div class="saai-welcome-features">
        <div class="saai-welcome-feature">
          <div class="saai-welcome-feature-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
              <polyline points="22,6 12,13 2,6"/>
            </svg>
          </div>
          <span>Get instant inbox summaries</span>
        </div>
        
        <div class="saai-welcome-feature">
          <div class="saai-welcome-feature-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="9,11 12,14 22,4"/>
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
            </svg>
          </div>
          <span>Extract tasks automatically</span>
        </div>
        
        <div class="saai-welcome-feature">
          <div class="saai-welcome-feature-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
          </div>
          <span>Smart email assistance</span>
        </div>
      </div>

      <button id="saai-start-btn" class="saai-start-button">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
        Start Chatting
      </button>
    </div>
  `;
}

function addSidebarEventListeners(sidebar, isConnected) {
  // Close button
  const closeBtn = sidebar.querySelector('#close-sidebar');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      console.log('[SaAI] Close button clicked');
      closeSidebar();
    });
  }
  
  if (isConnected) {
    // Check if this is the welcome page or chat interface
    const startBtn = sidebar.querySelector('#saai-start-btn');
    if (startBtn) {
      // This is the welcome page - add start button listener
      startBtn.addEventListener('click', () => {
        console.log('[SaAI] Start button clicked');
        showChatInterface();
      });
    } else {
      // This is the chat interface - add chat listeners
      // Send button
      const sendBtn = sidebar.querySelector('#send-btn');
      if (sendBtn) {
        sendBtn.addEventListener('click', handleSendMessage);
      }
      
      // Chat input
      const chatInput = sidebar.querySelector('#chat-input');
      if (chatInput) {
        chatInput.addEventListener('keypress', (e) => {
          if (e.key === 'Enter') {
            handleSendMessage();
          }
        });
        chatInput.focus();
      }
      
      // Voice controls
      setupVoiceModeControls(sidebar);
      
        // Task list button
  const taskListBtn = sidebar.querySelector('#task-list-btn');
  if (taskListBtn) {
    taskListBtn.addEventListener('click', () => {
      showTaskModal();
    });
  }
  
  // Clear chat button
  const clearChatBtn = sidebar.querySelector('#clear-chat-btn');
  if (clearChatBtn) {
    clearChatBtn.addEventListener('click', () => {
      if (confirm('Are you sure you want to clear the chat history?')) {
        const chatArea = document.getElementById(CHAT_AREA_ID);
        if (chatArea) {
          chatArea.innerHTML = '';
          clearChatHistory();
          injectSuggestions(); // Re-add suggestions
        }
      }
    });
  }
      
      // Inject suggestions
      setTimeout(() => {
        injectSuggestions();
      }, 100);
    }
  } else {
    // Connect button
    const connectBtn = sidebar.querySelector('#saai-connect-btn');
    if (connectBtn) {
      connectBtn.addEventListener('click', () => {
        console.log('[SaAI] Connect Gmail button clicked');
        startOAuthFlow();
      });
    }
    
    // Debug button
    const debugBtn = sidebar.querySelector('#saai-debug-btn');
    if (debugBtn) {
      debugBtn.addEventListener('click', async () => {
        console.log('[SaAI] Debug button clicked');
        const debugInfo = await debugConnectionStatus();
        
        alert(`Connection Debug Info:
- userId: ${debugInfo.userId || 'null'}
- isConnected: ${debugInfo.isConnected || 'null'}
- hasUserId: ${!!debugInfo.userId}
- hasIsConnected: ${!!debugInfo.isConnected}
- connectionCheck: ${!!(debugInfo.userId || debugInfo.isConnected)}

Check console for more details.`);
      });
    }
  }
}

async function showChatInterface() {
  if (!sidebarElement) return;
  
  sidebarElement.innerHTML = createChatInterfaceHTML();
  
  // Re-add resize handle after content change
  const resizeHandle = document.createElement('div');
  resizeHandle.className = 'saai-resize-handle';
  resizeHandle.title = 'Drag to resize sidebar';
  sidebarElement.appendChild(resizeHandle);
  
  // Re-add resize functionality
  addResizeFunctionality(sidebarElement, resizeHandle);
  
  addSidebarEventListeners(sidebarElement, true);
  
  // Load chat history after interface is created
  setTimeout(() => {
    loadChatHistory();
  }, 100);
}

async function updateSidebarContent() {
  if (!sidebarElement) return;
  
  const isConnected = await isGmailConnected();
  
  if (isConnected) {
    sidebarElement.innerHTML = createWelcomePageHTML();
  } else {
    sidebarElement.innerHTML = createConnectPromptHTML();
  }
  
  // Re-add resize handle after content change
  const resizeHandle = document.createElement('div');
  resizeHandle.className = 'saai-resize-handle';
  resizeHandle.title = 'Drag to resize sidebar';
  sidebarElement.appendChild(resizeHandle);
  
  // Re-add resize functionality
  addResizeFunctionality(sidebarElement, resizeHandle);
  
  addSidebarEventListeners(sidebarElement, isConnected);
}

// === CHAT FUNCTIONALITY ===

// === THREAD SUMMARIZATION LOGIC ===

/**
 * Check if the current page is a Gmail thread page
 * @returns {boolean} True if on a thread page
 */
function isThreadPage() {
  const currentUrl = window.location.href;
  // Check if URL contains a thread ID pattern (alphanumeric code after #inbox/)
  const threadPattern = /#inbox\/[A-Za-z0-9]+/;
  return threadPattern.test(currentUrl);
}

// Gather thread context in one call
function getThreadContext() {
  const isOnThreadPage = isThreadPage();
  const threadId = extractThreadId();
  const subjectLine = extractSubjectLine();
  return { isOnThreadPage, threadId, subjectLine };
}

// Retrieve or generate a userId consistent with text flow
async function getOrGenerateUserId() {
  const { userId } = await chrome.storage.local.get(['userId']);
  return userId || 'anonymous-user';
}

/**
 * Extract thread ID from the current Gmail URL
 * @returns {string|null} Thread ID or null if not found
 */
function extractThreadId() {
  const currentUrl = window.location.href;
  const threadMatch = currentUrl.match(/#inbox\/([A-Za-z0-9]+)/);
  return threadMatch ? threadMatch[1] : null;
}

/**
 * Check if the message contains summarization keywords
 * @param {string} message - The user's message
 * @returns {boolean} True if message contains summarization keywords
 */
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
  
  const inboxKeywords = [
    'inbox',
    'all emails',
    'my emails',
    'email list'
  ];
  
  // Check if message contains any summarization keyword
  const hasSummarizationKeyword = summarizationKeywords.some(keyword => 
    lowerMessage.includes(keyword)
  );
  
  // Check if message contains inbox-specific keywords
  const hasInboxKeyword = inboxKeywords.some(keyword => 
    lowerMessage.includes(keyword)
  );
  
  // Check if message contains context keywords (optional)
  const hasContextKeyword = contextKeywords.some(keyword => 
    lowerMessage.includes(keyword)
  );
  
  // Return true if it has summarization keyword and either context keyword or is short (likely about current thread)
  return hasSummarizationKeyword && (hasContextKeyword || message.length < 50);
}

/**
 * Check if the message is specifically requesting inbox summarization
 * @param {string} message - The user's message
 * @returns {boolean} True if message is requesting inbox summarization
 */
function isInboxSummarizationRequest(message) {
  const lowerMessage = message.toLowerCase();
  const summarizationKeywords = [
    'summarise',
    'summarize', 
    'summary',
    'summaries'
  ];
  
  const inboxKeywords = [
    'inbox',
    'all emails',
    'my emails',
    'email list'
  ];
  
  // Check if message contains both summarization and inbox keywords
  const hasSummarizationKeyword = summarizationKeywords.some(keyword => 
    lowerMessage.includes(keyword)
  );
  
  const hasInboxKeyword = inboxKeywords.some(keyword => 
    lowerMessage.includes(keyword)
  );
  
  return hasSummarizationKeyword && hasInboxKeyword;
}

/**
 * Get current page context for better error messages
 * @returns {string} Description of current page
 */
function getCurrentPageContext() {
  if (isThreadPage()) {
    const threadId = extractThreadId();
    return `thread page (ID: ${threadId})`;
  } else {
    return 'inbox page';
  }
}

/**
 * Extract subject line from the current Gmail thread
 * @returns {string|null} Subject line or null if not found
 */
function extractSubjectLine() {
  if (!isThreadPage()) {
    return null;
  }
  
  // Try multiple selectors to find the subject line
  const subjectSelectors = [
    // Primary subject selector
    'h2[data-thread-perm-id]',
    // Alternative subject selectors
    '.hP',
    '[data-thread-perm-id] h2',
    '.gD h2',
    // Gmail's newer subject selectors
    '[role="main"] h2',
    '.adn h2',
    // Fallback selectors
    'h2',
    '.subject'
  ];
  
  for (const selector of subjectSelectors) {
    const subjectElement = document.querySelector(selector);
    if (subjectElement) {
      const subject = subjectElement.textContent?.trim();
      if (subject && subject.length > 0) {
        console.log('[SaAI] Subject found using selector:', selector, 'Subject:', subject);
        return subject;
      }
    }
  }
  
  // If no subject found, try to extract from page title
  const pageTitle = document.title;
  if (pageTitle && pageTitle.includes(' - ')) {
    const subject = pageTitle.split(' - ')[0].trim();
    if (subject && subject.length > 0) {
      console.log('[SaAI] Subject extracted from page title:', subject);
      return subject;
    }
  }
  
  console.log('[SaAI] No subject line found');
  return null;
}

// === RESPONSE FORMATTING ===

/**
 * Format complex structured responses with emojis and sections
 * @param {Object} data - The structured response data
 * @returns {string} - Formatted HTML string
 */
function formatStructuredResponse(data) {
  console.log('[SaAI] Formatting structured response:', data);
  
  // Create a concise summary
  let summary = '';
  
  // Extract key information
  const subject = data['Subject / Thread Purpose'] || data['📌 Subject / Thread Purpose'] || '';
  const keyPoints = data['Key Points / Discussion Flow'] || data['🔍 Key Points / Discussion Flow'] || [];
  const decisions = data['Confirmed Decisions'] || data['✅ Confirmed Decisions'] || [];
  const questions = data['Open Questions / Pending Items'] || data['❓ Open Questions / Pending Items'] || [];
  const actions = data['Action Items & Owners'] || data['📋 Action Items & Owners'] || [];
  
  // Build concise summary
  if (subject) {
    summary += `<strong>📧 ${subject}</strong><br><br>`;
  }
  
  // Add key points (limit to 3 most important)
  if (Array.isArray(keyPoints) && keyPoints.length > 0) {
    summary += '<strong>Key Points:</strong><br>';
    const limitedPoints = keyPoints.slice(0, 3);
    limitedPoints.forEach(point => {
      const cleanPoint = typeof point === 'string' ? point.replace(/^["']|["']$/g, '') : point;
      summary += `• ${cleanPoint}<br>`;
    });
    if (keyPoints.length > 3) {
      summary += `• ... and ${keyPoints.length - 3} more points<br>`;
    }
    summary += '<br>';
  }
  
  // Add decisions (limit to 2)
  if (Array.isArray(decisions) && decisions.length > 0) {
    summary += '<strong>Decisions:</strong><br>';
    const limitedDecisions = decisions.slice(0, 2);
    limitedDecisions.forEach(decision => {
      const cleanDecision = typeof decision === 'string' ? decision.replace(/^["']|["']$/g, '') : decision;
      summary += `• ${cleanDecision}<br>`;
    });
    if (decisions.length > 2) {
      summary += `• ... and ${decisions.length - 2} more decisions<br>`;
    }
    summary += '<br>';
  }
  
  // Add action items (limit to 3)
  if (Array.isArray(actions) && actions.length > 0) {
    summary += '<strong>Action Items:</strong><br>';
    const limitedActions = actions.slice(0, 3);
    limitedActions.forEach(action => {
      const cleanAction = typeof action === 'string' ? action.replace(/^["']|["']$/g, '') : action;
      summary += `• ${cleanAction}<br>`;
    });
    if (actions.length > 3) {
      summary += `• ... and ${actions.length - 3} more actions<br>`;
    }
  }
  
  // Add pending questions if any (limit to 2)
  if (Array.isArray(questions) && questions.length > 0) {
    if (summary) summary += '<br>';
    summary += '<strong>Pending Questions:</strong><br>';
    const limitedQuestions = questions.slice(0, 2);
    limitedQuestions.forEach(question => {
      const cleanQuestion = typeof question === 'string' ? question.replace(/^["']|["']$/g, '') : question;
      summary += `• ${cleanQuestion}<br>`;
    });
    if (questions.length > 2) {
      summary += `• ... and ${questions.length - 2} more questions<br>`;
    }
  }
  
  // If no structured data found, fallback to simple text
  if (!summary.trim()) {
    summary = Object.values(data).join('<br>');
  }
  
  return `<div class="structured-response">${summary}</div>`;
}

// === MODIFIED MESSAGE HANDLING ===

async function handleSendMessage() {
  const input = document.getElementById('chat-input');
  if (!input) {
    console.error('[SaAI] Chat input not found');
    return;
  }
  
  const message = input.value.trim();
  if (!message) return;
  
  const chatArea = document.getElementById(CHAT_AREA_ID);
  if (!chatArea) {
    console.error('[SaAI] Chat area not found');
    return;
  }
  
  // Add user message
  appendMessage('user', message, chatArea);
  input.value = '';
  
  // Save chat history
  saveChatHistory();
  
  // Hide suggestions after first user message
  const suggestions = chatArea.querySelector('#saai-suggestions');
  if (suggestions) {
    suggestions.remove();
  }
  
  // Show typing indicator
  const typingIndicator = appendMessage('bot', 'AI is thinking...', chatArea, true);
  
  try {
    // Get userId from storage
    const { userId } = await chrome.storage.local.get(['userId']);
    
    if (!userId) {
      throw new Error('Please connect your Gmail first');
    }
    
    // Check if this is a summarization request
    const isSummarizeRequest = isSummarizationRequest(message);
    const isInboxSummarizeRequest = isInboxSummarizationRequest(message);
    const threadId = extractThreadId();
    const isOnThreadPage = isThreadPage();
    const subjectLine = extractSubjectLine();
    
    console.log('[SaAI] Message analysis:', {
      message,
      isSummarizeRequest,
      isInboxSummarizeRequest,
      isOnThreadPage,
      threadId,
      subjectLine,
      currentUrl: window.location.href,
      sidebarWidth: SIDEBAR_WIDTH,
      sidebarElement: !!sidebarElement
    });
    
    // Handle thread summarization request validation (only for thread-specific requests)
    if (isSummarizeRequest && !isInboxSummarizeRequest && !isOnThreadPage) {
      // Remove typing indicator
      if (typingIndicator) {
        typingIndicator.remove();
      }
      
      appendMessage('bot', 'Please open the email/thread you want me to summarize, then ask me to summarize it. I can only summarize emails when you\'re viewing them.', chatArea);
      return;
    }
    
    // Prepare payload
    const payload = {
      query: message,
      userId: userId,
      context: 'GmailChat',
      sidebarWidth: SIDEBAR_WIDTH // Add sidebar width for debugging
    };
    
    // Add thread information if this is a summarization request
    if (isSummarizeRequest && isOnThreadPage && threadId) {
      payload.action = 'summarize_thread';
      payload.threadId = threadId;
      if (subjectLine) {
        payload.subjectLine = subjectLine;
      }
      console.log('[SaAI] Adding thread summarization data:', { 
        threadId, 
        action: 'summarize_thread',
        subjectLine: subjectLine || 'Not found'
      });
    }
    
    console.log('[SaAI] Sending message to n8n:', payload);
    
    console.log('[SaAI] Sending message to background script with payload:', payload);
    
    // Send message to background script
    const response = await chrome.runtime.sendMessage({
      action: 'sendToN8N',
      data: {
        endpoint: 'chat',
        payload: payload
      }
    });
    
    console.log('[SaAI] Response received from background script:', response);
    
    // Remove typing indicator
    if (typingIndicator) {
      typingIndicator.remove();
    }
    
    if (response?.success) {
      console.log('[SaAI] Response received:', response.data);
      console.log('[SaAI] Response data type:', typeof response.data);
      console.log('[SaAI] Response data keys:', response.data ? Object.keys(response.data) : 'null');
      console.log('[SaAI] Response data length:', Array.isArray(response.data) ? response.data.length : 'not array');
      
      // Handle array-wrapped responses from n8n
      let responseData = response.data;
      console.log('[SaAI] Raw response data type:', typeof responseData);
      console.log('[SaAI] Raw response data:', responseData);
      console.log('[SaAI] Raw response data length:', Array.isArray(responseData) ? responseData.length : 'not array');
      
      // Handle string responses (double-encoded JSON)
      if (typeof responseData === 'string') {
        console.log('[SaAI] Response is a string, attempting to parse...');
        try {
          responseData = JSON.parse(responseData);
          console.log('[SaAI] Successfully parsed string to:', typeof responseData);
          console.log('[SaAI] Parsed response data:', responseData);
        } catch (parseError) {
          console.error('[SaAI] Failed to parse response string:', parseError);
        }
      }
      
      if (Array.isArray(responseData)) {
        console.log('[SaAI] Response is an array, extracting first item');
        responseData = responseData[0];
        console.log('[SaAI] Extracted response data:', responseData);
        console.log('[SaAI] Extracted response data type:', typeof responseData);
        console.log('[SaAI] Extracted response data keys:', Object.keys(responseData));
        console.log('[SaAI] Extracted response data JSON:', JSON.stringify(responseData, null, 2));
        console.log('[SaAI] Has reply property:', responseData.hasOwnProperty('reply'));
        console.log('[SaAI] Reply property value:', responseData.reply);
        console.log('[SaAI] Reply property type:', typeof responseData.reply);
      }
      
      // Check if this is a fallback response
      if (responseData?.fallback) {
        console.log('[SaAI] Using fallback response - n8n webhook unavailable');
        
        // Create a special message for fallback responses
        const fallbackDiv = document.createElement('div');
        fallbackDiv.className = 'message bot-message';
        
        const messageContent = document.createElement('div');
        messageContent.className = 'message-content';
        messageContent.innerHTML = `
          <div style="margin-bottom: 8px;">${responseData.message}</div>
          <div style="font-size: 12px; opacity: 0.8; border-top: 1px solid rgba(0,0,0,0.1); padding-top: 8px; margin-top: 8px;">
            <strong>Webhook Status:</strong> ${responseData.webhookStatus}<br>
            <strong>Suggestion:</strong> ${responseData.suggestion || 'Check n8n configuration'}
          </div>
        `;
        
        fallbackDiv.appendChild(messageContent);
        chatArea.appendChild(fallbackDiv);
        chatArea.scrollTop = chatArea.scrollHeight;
        return;
      }
      
      // Handle normal response
      if (responseData && (responseData.high_priority_emails || responseData.medium_priority || responseData.already_replied_closed_threads || responseData.missed_or_ignored_emails)) {
        // Email summary data
        appendTableMessage('bot', responseData, chatArea);
      } else if (responseData && responseData.reply) {
        // Handle nested JSON reply format
        console.log('[SaAI] Found reply field, processing...');
        console.log('[SaAI] Reply field exists and has value');
        try {
          console.log('[SaAI] Processing reply:', responseData.reply);
          console.log('[SaAI] Reply type:', typeof responseData.reply);
          console.log('[SaAI] Reply starts with [ or {:', responseData.reply.startsWith('[') || responseData.reply.startsWith('{'));
          
          // First, try to parse the outer reply
          let parsedReply = responseData.reply;
          
          // If it's a string that looks like JSON, parse it
          if (typeof parsedReply === 'string' && (parsedReply.startsWith('[') || parsedReply.startsWith('{'))) {
            console.log('[SaAI] Parsing JSON string...');
            parsedReply = JSON.parse(parsedReply);
            console.log('[SaAI] Parsed successfully, result type:', typeof parsedReply);
            console.log('[SaAI] Parsed result is array:', Array.isArray(parsedReply));
          }
          
          // Handle array format with nested JSON strings
          if (Array.isArray(parsedReply)) {
            console.log('[SaAI] Parsed reply is an array:', parsedReply);
            console.log('[SaAI] Array length:', parsedReply.length);
            // Extract summary from the first item if it has a summary field
            const firstItem = parsedReply[0];
            console.log('[SaAI] First item:', firstItem);
            console.log('[SaAI] First item type:', typeof firstItem);
            console.log('[SaAI] First item keys:', firstItem ? Object.keys(firstItem) : 'null');
            
            if (firstItem && firstItem.summary) {
              console.log('[SaAI] Found summary field:', firstItem.summary);
              appendMessage('bot', firstItem.summary, chatArea);
            } else if (firstItem && typeof firstItem === 'object') {
              // Handle complex structured response
              console.log('[SaAI] Found complex structured response');
              console.log('[SaAI] First item is object, checking for structured format...');
              const formattedResponse = formatStructuredResponse(firstItem);
              console.log('[SaAI] Formatted response created, length:', formattedResponse.length);
              appendMessage('bot', formattedResponse, chatArea);
            } else {
              // If no summary field, try to extract from the item itself
              const summaryText = typeof firstItem === 'string' ? firstItem : JSON.stringify(firstItem);
              console.log('[SaAI] Using fallback summary text:', summaryText);
              appendMessage('bot', summaryText, chatArea);
            }
          } else if (parsedReply && typeof parsedReply === 'object') {
            // Handle object format
            if (parsedReply.summary) {
              appendMessage('bot', parsedReply.summary, chatArea);
            } else if (parsedReply.message) {
              appendMessage('bot', parsedReply.message, chatArea);
            } else {
              appendMessage('bot', JSON.stringify(parsedReply), chatArea);
            }
          } else {
            // Fallback to raw text
            appendMessage('bot', parsedReply, chatArea);
          }
          
        } catch (parseError) {
          console.error('[SaAI] Error parsing reply:', parseError);
          console.error('[SaAI] Parse error details:', parseError.message);
          console.error('[SaAI] Parse error stack:', parseError.stack);
          console.log('[SaAI] Raw reply data:', responseData.reply);
          
          // If parsing fails, try to extract plain text
          let plainText = responseData.reply;
          
          // Try to extract text from common patterns
          if (plainText.includes('summary')) {
            // Try to extract summary from JSON-like string
            const summaryMatch = plainText.match(/"summary":"([^"]+)"/);
            if (summaryMatch) {
              plainText = summaryMatch[1];
            }
          }
          
          appendMessage('bot', plainText, chatArea);
        }
      } else if (responseData && typeof responseData === 'string') {
        // Handle direct string response
        console.log('[SaAI] Found direct string response:', responseData);
        appendMessage('bot', responseData, chatArea);
      } else if (responseData && responseData.summary) {
        // Handle direct summary field
        console.log('[SaAI] Found direct summary field:', responseData.summary);
        appendMessage('bot', responseData.summary, chatArea);
      } else if (responseData && responseData.message) {
        // Direct message response
        appendMessage('bot', responseData.message, chatArea);
      } else if (responseData && Array.isArray(responseData)) {
        // Handle direct array response
        console.log('[SaAI] Found direct array response:', responseData);
        const firstItem = responseData[0];
        if (firstItem && firstItem.summary) {
          console.log('[SaAI] Found summary in direct array:', firstItem.summary);
          appendMessage('bot', firstItem.summary, chatArea);
        } else {
          console.log('[SaAI] Using first array item as text:', firstItem);
          appendMessage('bot', typeof firstItem === 'string' ? firstItem : JSON.stringify(firstItem), chatArea);
        }
      } else if (responseData && typeof responseData === 'object' && !Array.isArray(responseData)) {
        // Handle direct structured object response
        console.log('[SaAI] Checking for direct structured object response...');
        const keys = Object.keys(responseData);
        console.log('[SaAI] Object keys:', keys);
        
        // Check if this is a structured response with sections
        if (keys.some(key => key.includes('Subject') || key.includes('Purpose') || key.includes('Points') || key.includes('Decisions') || key.includes('Questions') || key.includes('Action'))) {
          console.log('[SaAI] Found direct structured response object');
          const formattedResponse = formatStructuredResponse(responseData);
          console.log('[SaAI] Formatted direct response, length:', formattedResponse.length);
          appendMessage('bot', formattedResponse, chatArea);
        } else if (responseData.summary) {
          // Check for direct summary field
          console.log('[SaAI] Found direct summary field');
          appendMessage('bot', responseData.summary, chatArea);
        } else if (responseData.message) {
          // Check for direct message field
          console.log('[SaAI] Found direct message field');
          appendMessage('bot', responseData.message, chatArea);
        } else {
          // Fallback for other object types
          console.log('[SaAI] Using object as JSON string');
          appendMessage('bot', JSON.stringify(responseData, null, 2), chatArea);
        }
      } else {
        // Check for empty response
        if (!responseData || (typeof responseData === 'object' && Object.keys(responseData).length === 0)) {
          console.log('[SaAI] Empty response detected:', responseData);
          appendMessage('bot', 'I received an empty response from the AI. This might be due to a webhook configuration issue or the AI service being temporarily unavailable. Please try again in a moment.', chatArea);
          return;
        }
        
        // Fallback
        console.log('[SaAI] No valid response format found, using fallback');
        console.log('[SaAI] responseData:', responseData);
        console.log('[SaAI] responseData.reply:', responseData?.reply);
        console.log('[SaAI] responseData.message:', responseData?.message);
        console.log('[SaAI] responseData.summary:', responseData?.summary);
        console.log('[SaAI] responseData type:', typeof responseData);
        console.log('[SaAI] responseData keys:', responseData ? Object.keys(responseData) : 'null');
        console.log('[SaAI] responseData.reply exists:', !!responseData?.reply);
        console.log('[SaAI] responseData.reply truthy:', !!responseData?.reply);
        console.log('[SaAI] responseData.reply length:', responseData?.reply?.length);
        appendMessage('bot', 'I received your message!', chatArea);
      }
    } else {
      throw new Error(response?.error || 'Failed to get response from AI');
    }
    
  } catch (error) {
    console.error('[SaAI] Chat error:', error);
    
    // Remove typing indicator
    if (typingIndicator) {
      typingIndicator.remove();
    }
    
    appendMessage('bot', `Error: ${error.message}`, chatArea);
  }
}

function appendMessage(sender, text, chatArea, temporary = false) {
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${sender}-message${temporary ? ' temporary' : ''}`;
  
  messageDiv.innerHTML = `
    <div class="message-content">
      ${text}
    </div>
  `;
  
  chatArea.appendChild(messageDiv);
  chatArea.scrollTop = chatArea.scrollHeight;
  
  // Save chat history after each message
  if (!temporary) {
    saveChatHistory();
  }
  
  return temporary ? messageDiv : null;
}

// === UTILITY FUNCTIONS ===

/**
 * Compute days old from various date inputs, with guardrails.
 * Accepts ISO/RFC strings, epoch seconds/ms, and numeric strings.
 */
function computeDaysOld(input) {
  if (input === null || input === undefined || input === '') return null;
  try {
    let emailDate;
    if (typeof input === 'number') {
      const ms = input < 1e12 ? input * 1000 : input;
      emailDate = new Date(ms);
    } else if (typeof input === 'string' && /^\d+$/.test(input.trim())) {
      const n = parseInt(input.trim(), 10);
      const ms = n < 1e12 ? n * 1000 : n;
      emailDate = new Date(ms);
    } else {
      emailDate = new Date(input);
    }
    if (isNaN(emailDate.getTime())) return null;
    const now = new Date();
    // Guard against absurd dates
    if (emailDate.getTime() > now.getTime() + 24 * 60 * 60 * 1000) return null;
    if (emailDate.getFullYear() < 1995) return null;
    const diffTime = now.getTime() - emailDate.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  } catch (error) {
    console.error('[SaAI] Error computing days old:', error);
    return null;
  }
}

function appendTableMessage(sender, emailData, chatArea) {
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${sender}-message`;
  
  const tableContainer = document.createElement('div');
  tableContainer.className = 'email-summary-table';
  
  const title = document.createElement('h3');
  title.textContent = '📧 Gmail Summary';
  tableContainer.appendChild(title);
  
  // Helper function to clean and format email addresses
  function formatEmailAddress(emailString) {
    if (!emailString) return 'Unknown Sender';
    
    // Remove angle brackets and extract email
    let cleanEmail = emailString.replace(/[<>]/g, '').trim();
    
    // If it's a very long string (like the one in the image), try to extract a readable part
    if (cleanEmail.length > 50) {
      // Try to find an @ symbol and extract domain
      const atIndex = cleanEmail.indexOf('@');
      if (atIndex > 0) {
        const domain = cleanEmail.substring(atIndex + 1);
        // Extract a readable domain name
        const domainParts = domain.split('.');
        if (domainParts.length >= 2) {
          return `${domainParts[0]}.${domainParts[1]}`;
        }
        return domain;
      }
      
      // If no @ symbol, try to extract a readable part
      const readablePart = cleanEmail.substring(0, 20);
      return readablePart + '...';
    }
    
    // For normal email addresses, just clean them up
    return cleanEmail;
  }
  
  // Helper function to truncate long subjects
  function truncateSubject(subject, maxLength = 50) {
    if (!subject) return 'No Subject';
    if (subject.length <= maxLength) return subject;
    return subject.substring(0, maxLength) + '...';
  }
  
  // Helper function to format next action
  function formatNextAction(action) {
    if (!action) return '—';
    if (typeof action === 'string') {
      // No truncation - let CSS handle text wrapping
      return action;
    }
    return '—';
  }
  
  // Helper function to format days old (robust, handles numeric strings and dates)
  function formatDaysOld(daysOld) {
    if (daysOld === null || daysOld === undefined) return '—';
    if (typeof daysOld === 'string') {
      const trimmed = daysOld.trim();
      // Pure number? treat as days count
      if (/^\d+$/.test(trimmed)) {
        const n = parseInt(trimmed, 10);
        if (n === 0) return 'Today';
        if (n === 1) return '1 day';
        return `${n} days`;
      }
      // Try as date string
      const computed = computeDaysOld(trimmed);
      if (computed !== null) {
        if (computed === 0) return 'Today';
        if (computed === 1) return '1 day';
        return `${computed} days`;
      }
      return trimmed || '—';
    }
    if (typeof daysOld === 'number' && Number.isFinite(daysOld)) {
      if (daysOld === 0) return 'Today';
      if (daysOld === 1) return '1 day';
      return `${daysOld} days`;
    }
    return '—';
  }
  
  const priorities = [
    { key: 'high_priority_emails', label: 'High Priority', color: '#ffebee', icon: '🔴' },
    { key: 'medium_priority', label: 'Medium Priority', color: '#fff3e0', icon: '🟡' },
    { key: 'low_priority', label: 'Low Priority', color: '#f0f9ff', icon: '🔵' },
    { key: 'already_replied_closed_threads', label: 'Already Replied', color: '#e8f5e8', icon: '✅' },
    { key: 'missed_or_ignored_emails', label: 'Missed/Ignored', color: '#f5f5f5', icon: '⏰' }
  ];
  
  let totalRows = 0;
  priorities.forEach(priority => {
    const emails = emailData[priority.key];
    if (emails && emails.length > 0) totalRows += emails.length;
  });
  
  // Show preview if large
  const PREVIEW_ROWS = 3;
  let previewMode = totalRows > 6;
  
  console.log('[SaAI] Table preview mode calculation:', {
    totalRows,
    PREVIEW_ROWS,
    previewMode,
    willShowButton: previewMode
  });
  
  priorities.forEach(priority => {
    const emails = emailData[priority.key];
    if (emails && emails.length > 0) {
      const section = document.createElement('div');
      section.className = 'priority-section';
      
      // Add data-priority attribute for enhanced styling
      if (priority.key === 'high_priority_emails') {
        section.setAttribute('data-priority', 'high');
      } else if (priority.key === 'medium_priority') {
        section.setAttribute('data-priority', 'medium');
      } else if (priority.key === 'low_priority') {
        section.setAttribute('data-priority', 'low');
      } else if (priority.key === 'already_replied_closed_threads') {
        section.setAttribute('data-priority', 'replied');
      } else if (priority.key === 'missed_or_ignored_emails') {
        section.setAttribute('data-priority', 'missed');
      }
      
      const header = document.createElement('h4');
      header.innerHTML = `${priority.icon} ${priority.label} <span class="email-count">(${emails.length})</span>`;
      section.appendChild(header);
      
      const table = document.createElement('table');
      table.className = 'email-table';
      
      const thead = document.createElement('thead');
      thead.innerHTML = `
        <tr>
          <th>Subject</th>
          <th>From</th>
          <th>Next Action</th>
          <th>Days Old</th>
        </tr>
      `;
      table.appendChild(thead);
      
      const tbody = document.createElement('tbody');
      const emailsToShow = previewMode ? emails.slice(0, PREVIEW_ROWS) : emails;
      
      emailsToShow.forEach((email, idx) => {
        const row = document.createElement('tr');
        row.className = idx % 2 === 0 ? 'even-row' : 'odd-row';
        
        const subjectCell = document.createElement('td');
        subjectCell.className = 'subject-cell';
        subjectCell.textContent = truncateSubject(email.subject);
        subjectCell.title = email.subject; // Show full subject on hover
        
        const senderCell = document.createElement('td');
        senderCell.className = 'sender-cell';
        senderCell.textContent = formatEmailAddress(email.sender);
        senderCell.title = email.sender; // Show full email on hover
        
        const nextActionCell = document.createElement('td');
        nextActionCell.className = 'next-action-cell';
        const nextActionValue = (email && (email.next_action || email.nextAction || email.next_action_required || email.nextActionRequired || email.action || email.todo)) || '';
        nextActionCell.textContent = formatNextAction(nextActionValue);
        nextActionCell.title = nextActionValue; // Show full action on hover
        
        const daysOldCell = document.createElement('td');
        daysOldCell.className = 'days-old-cell';
        
        // For all sections, show data as provided by N8N (no overrides)
        const daysOld = email.days_old !== undefined ? email.days_old : 
                       email['days old'] !== undefined ? email['days old'] :
                       (email.receivedAt ? computeDaysOld(email.receivedAt) : null);
        daysOldCell.textContent = formatDaysOld(daysOld);
        
        row.appendChild(subjectCell);
        row.appendChild(senderCell);
        row.appendChild(nextActionCell);
        row.appendChild(daysOldCell);
        tbody.appendChild(row);
      });
      
      table.appendChild(tbody);
      section.appendChild(table);
      
      // Add "show more" indicator if in preview mode
      if (previewMode && emails.length > PREVIEW_ROWS) {
        const moreIndicator = document.createElement('div');
        moreIndicator.className = 'more-indicator';
        moreIndicator.textContent = `+${emails.length - PREVIEW_ROWS} more emails`;
        section.appendChild(moreIndicator);
      }
      
      tableContainer.appendChild(section);
    }
  });
  
  if (previewMode) {
    console.log('[SaAI] Creating View Full Summary button');
    const viewFullBtn = document.createElement('button');
    viewFullBtn.textContent = '📋 View Full Summary';
    viewFullBtn.className = 'view-full-btn';
    viewFullBtn.id = 'view-full-summary-btn';
    
    // Add both onclick and addEventListener for better compatibility
    viewFullBtn.onclick = () => {
      console.log('[SaAI] View Full Summary button clicked (onclick)');
      console.log('[SaAI] Email data for full table:', emailData);
      openFullTable(emailData);
    };
    
    viewFullBtn.addEventListener('click', (e) => {
      console.log('[SaAI] View Full Summary button clicked (addEventListener)');
      e.preventDefault();
      e.stopPropagation();
      console.log('[SaAI] Email data for full table:', emailData);
      openFullTable(emailData);
    });
    
    tableContainer.appendChild(viewFullBtn);
    console.log('[SaAI] View Full Summary button created and added to DOM');
    
    // Verify button was added
    const addedButton = tableContainer.querySelector('#view-full-summary-btn');
    console.log('[SaAI] Button verification:', {
      buttonFound: !!addedButton,
      buttonText: addedButton?.textContent,
      buttonParent: addedButton?.parentNode?.className
    });
  } else {
    console.log('[SaAI] Preview mode is false, not creating button');
  }
  
  // If no emails found
  if (!priorities.some(p => emailData[p.key] && emailData[p.key].length > 0)) {
    const noEmailsMsg = document.createElement('div');
    noEmailsMsg.className = 'no-emails';
    noEmailsMsg.innerHTML = `
      <div class="no-emails-icon">📭</div>
      <div class="no-emails-text">No emails found in your inbox.</div>
    `;
    tableContainer.appendChild(noEmailsMsg);
  }
  
  messageDiv.appendChild(tableContainer);
  chatArea.appendChild(messageDiv);
  chatArea.scrollTop = chatArea.scrollHeight;
}

function openFullTable(emailData) {
  try {
    console.log('[SaAI] Opening full table with data:', emailData);
    
    const tableWindow = window.open('', '_blank');
    
    if (!tableWindow) {
      console.error('[SaAI] Failed to open new window - popup blocked?');
      alert('Failed to open full table. Please allow popups for this site.');
      return;
    }
  
  // Normalize incoming data: handle outer array and JSON string in `reply`
  function normalizeEmailData(raw) {
    try {
      // If raw is a string, try JSON.parse first
      if (typeof raw === 'string') {
        const parsed = JSON.parse(raw);
        return normalizeEmailData(parsed);
      }
      // If raw is an array like [{ reply: "{...}" }]
      if (Array.isArray(raw)) {
        const first = raw[0];
        if (first && typeof first.reply === 'string') {
          return JSON.parse(first.reply);
        }
        return first || {};
      }
      // If raw has a `reply` string directly
      if (raw && typeof raw.reply === 'string') {
        return JSON.parse(raw.reply);
      }
      // Otherwise assume it's already the final object shape
      return raw || {};
    } catch (e) {
      console.warn('[SaAI] Failed to normalize email data, using raw:', e);
      return raw || {};
    }
  }

  const normalizedData = normalizeEmailData(emailData);

  // Helper function to clean and format email addresses (same as in appendTableMessage)
  function formatEmailAddress(emailString) {
    if (!emailString) return 'Unknown Sender';
    
    // Remove angle brackets and extract email
    let cleanEmail = emailString.replace(/[<>]/g, '').trim();
    
    // If it's a very long string, try to extract a readable part
    if (cleanEmail.length > 50) {
      // Try to find an @ symbol and extract domain
      const atIndex = cleanEmail.indexOf('@');
      if (atIndex > 0) {
        const domain = cleanEmail.substring(atIndex + 1);
        // Extract a readable domain name
        const domainParts = domain.split('.');
        if (domainParts.length >= 2) {
          return `${domainParts[0]}.${domainParts[1]}`;
        }
        return domain;
      }
      
      // If no @ symbol, try to extract a readable part
      const readablePart = cleanEmail.substring(0, 20);
      return readablePart + '...';
    }
    
    // For normal email addresses, just clean them up
    return cleanEmail;
  }
  
  // Helper function to truncate long subjects
  function truncateSubject(subject, maxLength = 80) {
    if (!subject) return 'No Subject';
    if (subject.length <= maxLength) return subject;
    return subject.substring(0, maxLength) + '...';
  }
  
  // Extract next action from multiple possible keys
  function extractNextAction(email) {
    if (!email || typeof email !== 'object') return '—';
    const candidates = [
      email.next_action,
      email.nextAction,
      email.next_action_required,
      email.nextActionRequired,
      email.action,
      email.todo
    ];
    for (const val of candidates) {
      if (typeof val === 'string' && val.trim()) return val.trim();
    }
    return '—';
  }

  // Helper function to format next action (delegates to extractor)
  function formatNextAction(action) {
    if (!action) return '—';
    if (typeof action === 'string') return action;
    return '—';
  }
  
  // Helper function to format days old (same as in main scope)
  function formatDaysOld(daysOld) {
    if (daysOld === null || daysOld === undefined) return '—';
    // Numeric strings like "3"
    if (typeof daysOld === 'string') {
      const trimmed = daysOld.trim();
      if (/^\d+$/.test(trimmed)) {
        const n = parseInt(trimmed, 10);
        if (n === 0) return 'Today';
        if (n === 1) return '1 day';
        return `${n} days`;
      }
      // Non-numeric string; try as date string
      const computed = computeDaysOld(trimmed);
      if (computed !== null) {
        if (computed === 0) return 'Today';
        if (computed === 1) return '1 day';
        return `${computed} days`;
      }
      return trimmed || '—';
    }
    if (typeof daysOld === 'number' && Number.isFinite(daysOld)) {
      if (daysOld === 0) return 'Today';
      if (daysOld === 1) return '1 day';
      return `${daysOld} days`;
    }
    return '—';
  }
  
  // Helper function to compute days old (same as in main scope)
  function computeDaysOld(input) {
    if (input === null || input === undefined || input === '') return null;
    try {
      let emailDate;
      if (typeof input === 'number') {
        // Treat as epoch seconds if small, else ms
        const ms = input < 1e12 ? input * 1000 : input;
        emailDate = new Date(ms);
      } else if (typeof input === 'string' && /^\d+$/.test(input.trim())) {
        const n = parseInt(input.trim(), 10);
        const ms = n < 1e12 ? n * 1000 : n;
        emailDate = new Date(ms);
      } else {
        emailDate = new Date(input);
      }
      if (isNaN(emailDate.getTime())) return null;
      // Guard against absurd dates
      const now = new Date();
      if (emailDate.getTime() > now.getTime() + 24 * 60 * 60 * 1000) return null;
      if (emailDate.getFullYear() < 1995) return null;
      const diffTime = now.getTime() - emailDate.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      return diffDays;
    } catch (error) {
      console.error('[SaAI] Error computing days old:', error);
      return null;
    }
  }
  
  tableWindow.document.write(`
    <html>
      <head>
        <title>Gmail Summary</title>
        <style>
          body { 
            background: #ffffff; 
            color: #0f172a; 
            font-family: Inter, Segoe UI, Arial, sans-serif; 
            padding: 32px; 
            margin: 0;
          }
          h2 { 
            color: #0f172a; 
            text-align: center;
            margin-bottom: 32px;
            font-size: 24px;
            font-weight: 600;
          }
          .priority-section {
            margin-bottom: 32px;
            background: #f8fafc;
            border-radius: 12px;
            padding: 20px;
            border: 1px solid #e2e8f0;
          }
          .priority-header {
            color: #0f172a;
            font-size: 18px;
            font-weight: 600;
            margin-bottom: 16px;
            display: flex;
            align-items: center;
            gap: 8px;
          }
          .email-count {
            font-size: 14px;
            color: #64748b;
            font-weight: 400;
          }
          table { 
            width: 100%; 
            border-collapse: collapse; 
            margin-bottom: 16px; 
            background: #ffffff;
            border-radius: 8px;
            overflow: hidden;
            border: 1px solid #e2e8f0;
            table-layout: fixed;
          }
          th, td { 
            padding: 12px 16px; 
            text-align: left;
            border-bottom: 1px solid #f1f5f9;
            vertical-align: top;
          }
          th { 
            background: #f1f5f9; 
            color: #0f172a; 
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            font-size: 12px;
          }
          th:nth-child(1) { width: 30%; text-align: left; } /* Subject */
          th:nth-child(2) { width: 20%; text-align: left; } /* From */
          th:nth-child(3) { width: 35%; text-align: left; } /* Next Action */
          th:nth-child(4) { width: 15%; text-align: center; } /* Days Old */
          tr:nth-child(even) { 
            background: #ffffff; 
          }
          tr:nth-child(odd) { 
            background: #f8fafc; 
          }
          tr:hover {
            background: #f1f5f9;
            transition: background 0.2s ease;
          }
          .subject-cell {
            font-weight: 500;
            max-width: 100%;
            word-wrap: break-word;
            line-height: 1.4;
            color: #0f172a;
            padding-right: 8px;
          }
          .sender-cell {
            font-size: 13px;
            color: #64748b;
            max-width: 100%;
            word-wrap: break-word;
            font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
            padding-left: 8px;
          }
          .next-action-cell {
            font-size: 13px;
            color: #0f172a;
            max-width: 100%;
            word-wrap: break-word;
            line-height: 1.3;
            font-weight: 500;
            font-style: italic;
          }
          .days-old-cell {
            font-size: 13px;
            color: #64748b;
            max-width: 100%;
            word-wrap: break-word;
            font-weight: 600;
            text-align: center;
            font-family: 'Inter', sans-serif;
            vertical-align: middle;
          }
          
          /* Force center alignment for Days Old column in full table */
          .days-old-cell {
            text-align: center !important;
          }
          button { 
            padding: 12px 24px; 
            border-radius: 8px; 
            border: none; 
            background: #0f172a; 
            color: #ffffff; 
            font-weight: 600; 
            font-size: 14px; 
            cursor: pointer; 
            margin-top: 24px;
            transition: all 0.2s ease;
          }
          button:hover {
            background: #1e293b;
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
          }
          button:active {
            transform: translateY(0);
          }
          /* Desktop-only; mobile rules removed */
        </style>
      </head>
      <body>
        <h2>📧 Gmail Summary (Full Table)</h2>
        ${[
          { key: 'high_priority_emails', label: 'High Priority', icon: '🔴' },
          { key: 'medium_priority', label: 'Medium Priority', icon: '🟡' },
          { key: 'low_priority', label: 'Low Priority', icon: '🔵' },
          { key: 'already_replied_closed_threads', label: 'Already Replied', icon: '✅' },
          { key: 'missed_or_ignored_emails', label: 'Missed/Ignored', icon: '⏰' }
        ].map(priority => {
          const emails = normalizedData[priority.key];
          if (emails && emails.length > 0) {
            return `
              <div class="priority-section" data-priority="${priority.key === 'high_priority_emails' ? 'high' : 
                                                           priority.key === 'medium_priority' ? 'medium' : 
                                                           priority.key === 'low_priority' ? 'low' :
                                                           priority.key === 'already_replied_closed_threads' ? 'replied' : 'missed'}">
                <div class="priority-header">
                  ${priority.icon} ${priority.label} 
                  <span class="email-count">(${emails.length} emails)</span>
                </div>
                <table>
                  <thead>
                    <tr>
                      <th>Subject</th>
                      <th>From</th>
                      <th>Next Action</th>
                      <th>Days Old</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${emails.map(email => {
                      // Handle different priority types for full table view
                      let senderText, nextActionText, daysOldText;
                      
                      if (priority.key === 'missed_or_ignored_emails') {
                        senderText = formatEmailAddress(email.sender);
                        nextActionText = '—';
                        const daysOld = email.days_old !== undefined ? email.days_old : 
                                       email['days old'] !== undefined ? email['days old'] :
                                       (email.receivedAt ? computeDaysOld(email.receivedAt) : null);
                        daysOldText = formatDaysOld(daysOld);
                      } else {
                        senderText = formatEmailAddress(email.sender);
                        const na = extractNextAction(email);
                        nextActionText = formatNextAction(na);
                        const daysOld = email.days_old !== undefined ? email.days_old : 
                                       email['days old'] !== undefined ? email['days old'] :
                                       (email.receivedAt ? computeDaysOld(email.receivedAt) : null);
                        daysOldText = formatDaysOld(daysOld);
                      }
                      
                      return `
                        <tr>
                          <td class="subject-cell" title="${email.subject}">${truncateSubject(email.subject)}</td>
                          <td class="sender-cell" title="${email.sender}">${senderText}</td>
                          <td class="next-action-cell" title="${(extractNextAction(email) || '').replace(/"/g, '&quot;')}">${nextActionText}</td>
                          <td class="days-old-cell">${daysOldText}</td>
                        </tr>
                      `;
                    }).join('')}
                  </tbody>
                </table>
              </div>
            `;
          }
          return '';
        }).join('')}
        <div style="text-align: center;">
          <button onclick="window.close()">Close</button>
        </div>
        <script>
          // Ensure close button works
          document.querySelector('button').addEventListener('click', function() {
            window.close();
          });
        </script>
      </body>
    </html>
  `);
    tableWindow.document.close();
    
    console.log('[SaAI] Full table opened successfully');
    
  } catch (error) {
    console.error('[SaAI] Error opening full table:', error);
    alert('Error opening full table: ' + error.message);
  }
}

// === OAuth & Connection ===

function startOAuthFlow() {
  console.log('[SaAI] Starting OAuth flow');
  
  // Show OAuth loader
  showOAuthLoader();
  
  // Send message to background script
  chrome.runtime.sendMessage({
    action: 'sendToN8N',
    data: {
      endpoint: 'oauth',
      payload: { context: 'GmailConnectClicked' }
    }
  }, (response) => {
    if (response?.success) {
      console.log('[SaAI] OAuth success response:', response.data);
      showOAuthSuccess();
    } else {
      console.error('[SaAI] OAuth failed:', response?.error);
      showStatus('OAuth failed. Please try again.', 'error');
    }
  });
}

async function isGmailConnected() {
  const { userId, isConnected } = await chrome.storage.local.get(['userId', 'isConnected']);
  return !!(userId || isConnected);
}

async function debugConnectionStatus() {
  const storage = await chrome.storage.local.get(['userId', 'isConnected', 'oauthData']);
  console.log('[SaAI] Debug connection status:', storage);
  return storage;
}

// === UI Helpers ===

function showOAuthLoader() {
  const connectContent = document.querySelector('.saai-connect-content');
  if (connectContent) {
    connectContent.innerHTML = `
      <div class="loader">Connecting to Google...</div>
    `;
  }
}

function showOAuthSuccess() {
  const connectContent = document.querySelector('.saai-connect-content');
  if (connectContent) {
    connectContent.innerHTML = `
      <div class="saai-connect-icon">✅</div>
      <h2 class="saai-connect-heading">Connected Successfully!</h2>
      <p class="saai-connect-description">Your Gmail is now connected to Sa.AI Assistant.</p>
    `;
  }
  
  // Update sidebar content after a delay
  setTimeout(() => {
    updateSidebarContent();
  }, 2000);
}

function showStatus(message, type) {
  // Create status element
  const statusDiv = document.createElement('div');
  statusDiv.className = `saai-status status ${type}`;
  statusDiv.textContent = message;
  
  // Add to sidebar
  if (sidebarElement) {
    sidebarElement.appendChild(statusDiv);
    
    // Remove after 3 seconds
    setTimeout(() => {
      if (statusDiv.parentNode) {
        statusDiv.remove();
      }
    }, 3000);
  }
}

function injectSuggestions() {
  const chatArea = document.getElementById(CHAT_AREA_ID);
  if (!chatArea) return;
  
  // Remove existing suggestions if any
  const existingSuggestions = chatArea.querySelector('#saai-suggestions');
  if (existingSuggestions) {
    existingSuggestions.remove();
  }
  
  // Check if user has already sent a message (hide suggestions after first use)
  const messages = chatArea.querySelectorAll('.message');
  if (messages.length > 0) {
    return; // Don't show suggestions if user has already interacted
  }
  
  const suggestions = [
    {
      text: 'Summarize my inbox',
      icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
        <polyline points="22,6 12,13 2,6"/>
      </svg>`
    },
    {
      text: 'Summarize this thread',
      icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        <path d="M13 8H7"/>
        <path d="M17 12H7"/>
      </svg>`
    },
    {
      text: 'Extract all tasks',
      icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="9,11 12,14 22,4"/>
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
      </svg>`
    },
    {
      text: 'Show follow-ups needed',
      icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <polyline points="12,6 12,12 16,14"/>
      </svg>`
    }
  ];
  
  const suggestionsDiv = document.createElement('div');
  suggestionsDiv.id = 'saai-suggestions';
  suggestionsDiv.className = 'saai-suggestions';
  
  suggestions.forEach(suggestion => {
    const button = document.createElement('button');
    button.className = 'saai-suggestion';
    button.innerHTML = `
      <span class="saai-suggestion-icon">${suggestion.icon}</span>
      <span class="saai-suggestion-text">${suggestion.text}</span>
    `;
    button.addEventListener('click', () => {
      const input = document.getElementById('chat-input');
      if (input) {
        input.value = suggestion.text;
        input.focus();
      }
    });
    suggestionsDiv.appendChild(button);
  });
  
  chatArea.appendChild(suggestionsDiv);
}

// === Task Management ===

async function showTaskModal() {
  // Show loading state first
  const modal = document.createElement('div');
  modal.id = 'task-modal';
  modal.className = 'task-modal-overlay';
  
  modal.innerHTML = `
    <div class="task-modal-content">
      <div class="task-modal-header">
        <h3 class="task-modal-title">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="9,11 12,14 22,4"/>
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
          </svg>
          Task Management
        </h3>
        <button class="task-modal-close-btn">×</button>
      </div>
      <div class="task-modal-body">
        <div class="task-loading">
          <div class="task-loading-spinner"></div>
          <p>Extracting tasks from your emails...</p>
        </div>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // Add close button functionality
  const closeBtn = modal.querySelector('.task-modal-close-btn');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => closeTaskModal(modal));
  }
  
  try {
    // Get user ID from storage
    const { userId } = await chrome.storage.local.get(['userId']);
    
    if (!userId) {
      throw new Error('User ID not found. Please connect your Gmail account first.');
    }
    
    // Call the webhook to extract tasks
    const response = await fetch('https://dxb2025.app.n8n.cloud/webhook/d5c3a514-9b33-4b12-9263-238cf99c265f', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId: userId,
        context: 'ExtractTasksList'
      })
    });
    
    if (!response.ok) {
      throw new Error(`Webhook request failed: ${response.status} ${response.statusText}`);
    }
    
    const responseData = await response.json();
    
    // Update modal with tasks from webhook
    updateTaskModalWithData(modal, responseData);
    
  } catch (error) {
    console.error('[SaAI] Task extraction failed:', error);
    
    // Show error state
    modal.querySelector('.task-modal-body').innerHTML = `
      <div class="task-error">
        <div class="task-error-icon">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="15" y1="9" x2="9" y2="15"/>
            <line x1="9" y1="9" x2="15" y2="15"/>
          </svg>
        </div>
        <div class="task-error-text">Failed to load tasks</div>
        <p style="color: var(--saai-text-secondary); font-size: 12px; margin-top: 8px;">
          ${error.message}
        </p>
        <button class="task-retry-btn">Retry</button>
      </div>
    `;
    
    // Add retry functionality
    const retryBtn = modal.querySelector('.task-retry-btn');
    if (retryBtn) {
      retryBtn.addEventListener('click', () => {
        closeTaskModal(modal);
        showTaskModal();
      });
    }
  }
}

function updateTaskModalWithData(modal, data) {
  // Check if data contains tasks array
  const webhookTasks = Array.isArray(data) ? data : (data.tasks || []);
  
  // Get manual tasks from localStorage
  const manualTasks = getTasks().filter(task => task.isManual);
  
  // Create a map to avoid duplicates based on task content
  const taskMap = new Map();
  
  // Add webhook tasks first
  webhookTasks.forEach(task => {
    const taskKey = task.task || task.text || task.description || task.title || '';
    if (taskKey && !taskMap.has(taskKey)) {
      taskMap.set(taskKey, { ...task, source: 'webhook' });
    }
  });
  
  // Add manual tasks, avoiding duplicates
  manualTasks.forEach(task => {
    const taskKey = task.task || task.text || task.description || task.title || '';
    if (taskKey && !taskMap.has(taskKey)) {
      taskMap.set(taskKey, { ...task, source: 'manual' });
    }
  });
  
  // Convert map values back to array
  const allTasks = Array.from(taskMap.values());
  
  modal.querySelector('.task-modal-body').innerHTML = `
    <div class="task-list">
      ${allTasks.length === 0 ? `
        <div class="no-tasks">
          <div class="no-tasks-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="9,11 12,14 22,4"/>
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
            </svg>
          </div>
          <div class="no-tasks-text">No tasks found</div>
          <p style="color: var(--saai-text-secondary); font-size: 12px; margin-top: 8px;">
            Tasks will be automatically extracted from your emails or add them manually below
          </p>
        </div>
      ` : ''}
      ${allTasks.map((task, index) => `
        <div class="task-item" data-id="${task.id || `task-${index}`}" data-source="${task.source || 'unknown'}">
          <div class="task-content">
            <input type="checkbox" class="task-checkbox" ${task.completed ? 'checked' : ''}>
            <span class="task-text">${task.task || task.text || task.description || task.title || 'Untitled Task'}</span>
            ${task.priority ? `<span class="task-priority ${task.priority.toLowerCase()}">${task.priority}</span>` : ''}
            <button class="task-delete-btn">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        </div>
      `).join('')}
    </div>
    
    <!-- Manual Task Addition Section -->
    <div class="add-task-section">
      <input type="text" class="new-task-input" placeholder="Add new task manually...">
      <select class="task-priority-select">
        <option value="low">Low</option>
        <option value="medium" selected>Medium</option>
        <option value="high">High</option>
      </select>
      <button class="add-task-btn">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="12" y1="5" x2="12" y2="19"/>
          <line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
      </button>
    </div>
    
    <div class="task-actions">
      <button class="task-refresh-btn">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="23,4 23,10 17,10"/>
          <polyline points="1,20 1,14 7,14"/>
          <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/>
        </svg>
        Refresh Tasks
      </button>
      <button class="task-modal-ok-btn">Done</button>
    </div>
  `;
  
  // Add event listeners for the updated modal
  addTaskModalEventListeners(modal);
}

function addTaskModalEventListeners(modal) {
  const closeBtn = modal.querySelector('.task-modal-close-btn');
  const okBtn = modal.querySelector('.task-modal-ok-btn');
  const refreshBtn = modal.querySelector('.task-refresh-btn');
  const addBtn = modal.querySelector('.add-task-btn');
  const input = modal.querySelector('.new-task-input');
  const prioritySelect = modal.querySelector('.task-priority-select');
  
  // Close buttons
  [closeBtn, okBtn].forEach(btn => {
    if (btn) {
      btn.addEventListener('click', () => closeTaskModal(modal));
    }
  });
  
  // Refresh tasks button
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      closeTaskModal(modal);
      showTaskModal();
    });
  }
  
  // Add manual task
  if (addBtn && input && prioritySelect) {
    addBtn.addEventListener('click', async () => {
      const text = input.value.trim();
      if (text) {
        // Disable button during webhook call
        addBtn.disabled = true;
        addBtn.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="9,11 12,14 22,4"/>
          </svg>
        `;
        
        try {
          await addManualTask(text, prioritySelect.value);
          input.value = '';
          // Just close the modal - the task is already saved locally and will show on next open
          closeTaskModal(modal);
        } catch (error) {
          console.error('[SaAI] Failed to add task:', error);
          // Re-enable button on error
          addBtn.disabled = false;
          addBtn.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          `;
        }
      }
    });
    
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        addBtn.click();
      }
    });
  }
  
  // Task interactions (checkboxes and delete buttons)
  const taskItems = modal.querySelectorAll('.task-item');
  taskItems.forEach(item => {
    const checkbox = item.querySelector('.task-checkbox');
    const deleteBtn = item.querySelector('.task-delete-btn');
    
    if (checkbox) {
      checkbox.addEventListener('change', () => {
        const taskId = item.dataset.id;
        
        // Check if it's a manual task (stored locally)
        const taskSource = item.dataset.source;
        if (taskSource === 'manual') {
          toggleTaskComplete(taskId);
          console.log('[SaAI] Manual task completion toggled:', taskId);
        } else {
          // Webhook task - just log for now
          console.log('[SaAI] Webhook task completion toggled:', taskId);
          // TODO: Could send completion update to webhook later
        }
      });
    }
    
    if (deleteBtn) {
      deleteBtn.addEventListener('click', async () => {
        const taskId = item.dataset.id;
        const taskText = item.querySelector('.task-text').textContent;
        
        // Disable delete button during webhook call
        deleteBtn.disabled = true;
        deleteBtn.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="9,11 12,14 22,4"/>
          </svg>
        `;
        
        try {
          // Get user ID from storage
          const { userId } = await chrome.storage.local.get(['userId']);
          
          if (!userId) {
            throw new Error('User ID not found. Please connect your Gmail account first.');
          }
          
          // Send delete task request to webhook
          const response = await fetch('https://dxb2025.app.n8n.cloud/webhook/d5c3a514-9b33-4b12-9263-238cf99c265f', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              userId: userId,
              context: 'DeleteTask',
              taskName: taskText
            })
          });
          
          if (!response.ok) {
            throw new Error(`Webhook request failed: ${response.status} ${response.statusText}`);
          }
          
          console.log('[SaAI] Task deletion sent to webhook successfully');
          
          // Remove from local storage if it's a manual task
          const taskSource = item.dataset.source;
          if (taskSource === 'manual') {
            removeTask(taskId);
            console.log('[SaAI] Manual task deleted from local storage:', taskId);
          } else {
            console.log('[SaAI] Webhook task deletion confirmed:', taskId);
          }
          
          // Remove from UI
          item.remove();
          
        } catch (error) {
          console.error('[SaAI] Failed to delete task via webhook:', error);
          
          // Re-enable delete button on error
          deleteBtn.disabled = false;
          deleteBtn.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          `;
          
          // Still remove from local storage if it's a manual task
          const taskSource = item.dataset.source;
          if (taskSource === 'manual') {
            removeTask(taskId);
            console.log('[SaAI] Manual task deleted locally (webhook failed):', taskId);
            item.remove();
          }
          
          // Could show user notification about sync failure
          // alert('Task deleted locally but failed to sync with backend. Please try again later.');
        }
      });
    }
  });
}

function closeTaskModal(modal) {
  if (modal && modal.parentNode) {
    modal.remove();
  }
}

function getTasks() {
  const tasks = localStorage.getItem('saai-tasks');
  return tasks ? JSON.parse(tasks) : [];
}

function saveTasks(tasks) {
  localStorage.setItem('saai-tasks', JSON.stringify(tasks));
}

function addTask(taskText, priority = 'medium', dueDate = null) {
  const tasks = getTasks();
  const newTask = {
    id: Date.now().toString(),
    text: taskText,
    priority: priority,
    dueDate: dueDate,
    completed: false,
    createdAt: new Date().toISOString()
  };
  tasks.push(newTask);
  saveTasks(tasks);
}

function removeTask(taskId) {
  const tasks = getTasks();
  const filteredTasks = tasks.filter(task => task.id !== taskId);
  saveTasks(filteredTasks);
}

function toggleTaskComplete(taskId) {
  const tasks = getTasks();
  const task = tasks.find(t => t.id === taskId);
  if (task) {
    task.completed = !task.completed;
    saveTasks(tasks);
  }
}

// Add manual task function
async function addManualTask(taskText, priority = 'medium') {
  try {
    // Get user ID from storage
    const { userId } = await chrome.storage.local.get(['userId']);
    
    if (!userId) {
      throw new Error('User ID not found. Please connect your Gmail account first.');
    }
    
    // Send manual task to webhook for Supabase storage
    const response = await fetch('https://dxb2025.app.n8n.cloud/webhook/d5c3a514-9b33-4b12-9263-238cf99c265f', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId: userId,
        context: 'ManualTaskAddition',
        taskName: taskText,
        priority: priority
      })
    });
    
    if (!response.ok) {
      throw new Error(`Webhook request failed: ${response.status} ${response.statusText}`);
    }
    
    console.log('[SaAI] Manual task sent to webhook successfully');
    
    // Also save locally for immediate display
    const tasks = getTasks();
    const newTask = {
      id: `manual-${Date.now()}`,
      task: taskText,
      priority: priority,
      completed: false,
      createdAt: new Date().toISOString(),
      isManual: true // Flag to identify manually added tasks
    };
    tasks.push(newTask);
    saveTasks(tasks);
    
    console.log('[SaAI] Manual task added locally:', newTask);
    
  } catch (error) {
    console.error('[SaAI] Failed to add manual task:', error);
    
    // Still save locally even if webhook fails
    const tasks = getTasks();
    const newTask = {
      id: `manual-${Date.now()}`,
      task: taskText,
      priority: priority,
      completed: false,
      createdAt: new Date().toISOString(),
      isManual: true,
      webhookFailed: true // Flag to indicate webhook sync failed
    };
    tasks.push(newTask);
    saveTasks(tasks);
    
    console.log('[SaAI] Manual task saved locally (webhook failed):', newTask);
    
    // Could show user notification about sync failure
    // alert('Task added locally but failed to sync with backend. Please try again later.');
  }
}

// === Cleanup ===

function cleanup() {
  if (isSidebarOpen) {
    closeSidebar();
  }
  document.body.classList.remove('saai-sidebar-open');
}

// === Page Lifecycle ===

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}

// Cleanup on page unload
window.addEventListener('beforeunload', cleanup);

// Handle Gmail navigation
let lastUrl = location.href;
new MutationObserver(() => {
  const url = location.href;
  if (url !== lastUrl) {
    lastUrl = url;
    console.log('[SaAI] Gmail navigation detected');
    // Re-initialize if needed
    if (!isInitialized) {
      initialize();
    }
  }
}).observe(document, { subtree: true, childList: true });

} // Close the if block for duplicate script prevention
