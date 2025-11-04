
        // IMPORTANT: Replace this with your actual n8n webhook URL
        const API_URL = 'https://automation.kawkab.ai/webhook/5b7b4f15-1d1e-4a87-864f-7155ba72b7b4/chat';
        
        const welcomeScreen = document.getElementById('welcomeScreen');
        const chatMode = document.getElementById('chatMode');
        const mainInput = document.getElementById('mainInput');
        const mainSendButton = document.getElementById('mainSendButton');
        const chatInput = document.getElementById('chatInput');
        const chatSendButton = document.getElementById('chatSendButton');
        const chatMessages = document.getElementById('chatMessages');
        const typingIndicator = document.getElementById('typingIndicator');
        const themeToggle = document.getElementById('themeToggle');
        const themeIcon = document.getElementById('themeIcon');
        const errorMessage = document.getElementById('errorMessage');

        // Session ID for conversation continuity
        let sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

        // Client-side chat limits (disabled for unlimited usage)
        const DAILY_MAX = Infinity;        // unlimited prompts
        const PERIOD_MS = 10 * 60 * 60 * 1000; // window retained for compatibility
        const cooldownMs = 0;              // no cooldown between messages
        let userPromptCount = 0;           // current prompt count in window
        let lastSentAt = 0;                // timestamp of last sent message
        let quotaWindowStart = 0;          // start timestamp of current 10-hour window

        function loadDailyCount() {
            try {
                const now = Date.now();
                const stored = JSON.parse(localStorage.getItem('iplant.dailyQuota') || '{}');
                let start = stored.windowStart || 0;
                let count = stored.count | 0;
                if (!start || (now - start) >= PERIOD_MS) {
                    start = now;
                    count = 0;
                }
                quotaWindowStart = start;
                return { count };
            } catch {
                quotaWindowStart = Date.now();
                return { count: 0 };
            }
        }

        function saveDailyCount(count) {
            const obj = { windowStart: quotaWindowStart, count: count | 0 };
            try { localStorage.setItem('iplant.dailyQuota', JSON.stringify(obj)); } catch {}
        }

        // Initialize quota counter on load
        (function initDailyQuota(){
            const { count } = loadDailyCount();
            userPromptCount = count;
        })();

        // Theme Toggle Functionality (default: light mode)
        let isDarkMode = false;
        const savedTheme = sessionStorage.getItem('theme');

        if (savedTheme === 'dark') {
            isDarkMode = true;
            document.body.classList.remove('light-mode');
            themeIcon.textContent = '🌙';
        } else {
            // Default to light mode when not explicitly set to dark
            document.body.classList.add('light-mode');
            themeIcon.textContent = '☀️';
        }

        themeToggle.addEventListener('click', () => {
            isDarkMode = !isDarkMode;
            document.body.classList.toggle('light-mode');
            themeIcon.textContent = isDarkMode ? '🌙' : '☀️';
            themeIcon.classList.add('active');
            setTimeout(() => themeIcon.classList.remove('active'), 300);

            sessionStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
        });

        // Logo switching (light: logo.png, dark: logo5.png) with crossfade
        (function preloadLogos(){ try { new Image().src='logo.png'; new Image().src='logo5.png'; } catch(_){} })();
        function swapLogo(img, src){
            if (!img || img.getAttribute('src') === src) return;
            img.classList.add('switching');
            const onLoad = () => { img.classList.remove('switching'); img.removeEventListener('load', onLoad); };
            img.addEventListener('load', onLoad);
            img.setAttribute('src', src);
            setTimeout(() => img.classList.remove('switching'), 300);
        }
        function updateLogosFromTheme(){
            const dark = !document.body.classList.contains('light-mode');
            const src = dark ? 'logo5.png' : 'logo.png';
            document.querySelectorAll('.brand-logo').forEach(img => swapLogo(img, src));
        }
        updateLogosFromTheme();
        themeToggle.addEventListener('click', () => setTimeout(updateLogosFromTheme, 0));

        function showError(message) {
            errorMessage.textContent = message;
            errorMessage.classList.add('show');
            setTimeout(() => {
                errorMessage.classList.remove('show');
            }, 5000);
        }

        function setInputsEnabled(enabled) {
            [mainInput, chatInput, mainSendButton, chatSendButton].forEach(el => {
                if (el) el.disabled = !enabled;
            });
        }

        function enforcePromptLimitUI() {
            // Limits disabled: keep inputs enabled and friendly placeholders
            setInputsEnabled(true);
            if (mainInput) mainInput.placeholder = 'Ask anything about iPlant...';
            if (chatInput) chatInput.placeholder = 'Type your message...';
        }

        function formatBotMessage(content) {
            // Remove excessive asterisks and format properly
            content = content.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
            
            // Split into paragraphs
            let paragraphs = content.split(/\n\n+/);
            
            // Process numbered lists
            paragraphs = paragraphs.map(para => {
                // Check if it's a numbered list
                if (/^\d+\./.test(para.trim())) {
                    const items = para.split(/\n(?=\d+\.)/);
                    const listItems = items.map(item => {
                        const match = item.match(/^\d+\.\s*(.+)/);
                        if (match) {
                            return `<li>${match[1].trim()}</li>`;
                        }
                        return '';
                    }).join('');
                    return `<ol>${listItems}</ol>`;
                }
                // Check if it's a bullet list
                else if (/^[-•*]\s/.test(para.trim())) {
                    const items = para.split(/\n(?=[-•*]\s)/);
                    const listItems = items.map(item => {
                        const match = item.match(/^[-•*]\s+(.+)/);
                        if (match) {
                            return `<li>${match[1].trim()}</li>`;
                        }
                        return '';
                    }).join('');
                    return `<ul>${listItems}</ul>`;
                }
                // Regular paragraph
                else if (para.trim()) {
                    return `<p>${para.trim()}</p>`;
                }
                return '';
            });
            
            return paragraphs.join('');
        }

        function addMessage(content, isUser) {
            const messageDiv = document.createElement('div');
            messageDiv.className = `message ${isUser ? 'user' : 'bot'}`;
            
            const avatar = document.createElement('div');
            avatar.className = 'message-avatar';
            avatar.textContent = isUser ? '👤' : '🌱';
            
            const messageContent = document.createElement('div');
            messageContent.className = 'message-content';
            
            if (isUser) {
                messageContent.textContent = content;
            } else {
                // Format bot messages nicely
                messageContent.innerHTML = formatBotMessage(content);
            }
            
            messageDiv.appendChild(avatar);
            messageDiv.appendChild(messageContent);
            chatMessages.appendChild(messageDiv);
            
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }

        function switchToChatMode() {
            welcomeScreen.classList.add('hidden');
            chatMode.classList.add('active');
        }

        function switchToHome() {
            chatMode.classList.remove('active');
            welcomeScreen.classList.remove('hidden');
            typingIndicator.classList.remove('active');
            errorMessage.classList.remove('show');
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }

        function selectSuggestion(text) {
            switchToChatMode();
            sendMessage(text);
        }

        function clearChat() {
            chatMessages.innerHTML = '';
            typingIndicator.classList.remove('active');
            errorMessage.classList.remove('show');
            // Reset session and cooldown (daily quota persists)
            lastSentAt = 0;
            sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            // Restore inputs
            setInputsEnabled(true);
            if (mainInput) mainInput.placeholder = 'Ask anything about iPlant...';
            if (chatInput) chatInput.placeholder = 'Type your message...';
            switchToHome();
            enforcePromptLimitUI();
        }

        async function sendMessage(messageText = null) {
            const message = messageText || chatInput.value.trim() || mainInput.value.trim();
            if (!message) return;

            // Rate limiting and quota checks
              const now = Date.now();
              // Refresh quota window each send attempt
              {
                  const { count } = loadDailyCount();
                  userPromptCount = count;
              }
              if (userPromptCount >= DAILY_MAX) {
                enforcePromptLimitUI();
                return;
            }
            const remaining = cooldownMs - (now - lastSentAt);
            if (remaining > 0) {
                showError(`Please wait ${Math.ceil(remaining / 1000)}s before sending another message.`);
                return;
            }

            if (!messageText) {
                switchToChatMode();
            }

            addMessage(message, true);
            // Update counters after accepting the message
            lastSentAt = now;
              userPromptCount++;
              saveDailyCount(userPromptCount);
            enforcePromptLimitUI();
            chatInput.value = '';
            mainInput.value = '';
            chatSendButton.disabled = true;
            mainSendButton.disabled = true;
            typingIndicator.classList.add('active');

            try {
                console.log('Sending message to:', API_URL);
                console.log('Message:', message);
                
                const response = await fetch(API_URL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json',
                    },
                    body: JSON.stringify({ 
                        message: message,
                        sessionId: sessionId,
                        chatInput: message,
                        input: message,
                        query: message
                    })
                });

                console.log('Response status:', response.status);
                console.log('Response headers:', response.headers);

                typingIndicator.classList.remove('active');

                if (!response.ok) {
                    throw new Error(`Server error: ${response.status} ${response.statusText}`);
                }

                const contentType = response.headers.get('content-type');
                let data;
                
                if (contentType && contentType.includes('application/json')) {
                    data = await response.json();
                    console.log('Response data:', data);
                } else {
                    const textData = await response.text();
                    console.log('Response text:', textData);
                    data = { response: textData };
                }
                
                // Try multiple possible response fields
                let botResponse = data.response || 
                                data.message || 
                                data.output || 
                                data.reply || 
                                data.text ||
                                data.answer;

                // If data is a string, use it directly
                if (typeof data === 'string') {
                    botResponse = data;
                }

                // If response is an object with nested data
                if (!botResponse && typeof data === 'object') {
                    if (data.data) {
                        botResponse = data.data.response || data.data.message || data.data.output;
                    }
                    if (data.result) {
                        botResponse = data.result.response || data.result.message || data.result.output;
                    }
                }
                
                if (botResponse) {
                    addMessage(botResponse, false);
                } else {
                    console.warn('No valid response field found in data:', data);
                    addMessage('Thank you for your message! How can I help you with iPlant services today?', false);
                }
            } catch (error) {
                typingIndicator.classList.remove('active');
                console.error('Error details:', error);
                
                showError('Connection issue. Showing offline response.');
                
                addMessage(
                    'I\'m here to help! iPlant offers comprehensive plant care and landscaping services in Amman, Jordan. ' +
                    'You can reach us at info@iplantjo.com or call +962 79 567 4643. ' +
                    'What would you like to know more about?', 
                    false
                );
            } finally {
                chatSendButton.disabled = false;
                mainSendButton.disabled = false;
                enforcePromptLimitUI();
            }
        }

        // Make all logos navigate back to the home (welcome) screen
        document.querySelectorAll('.logo-home-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                switchToHome();
            });
        });

        // Clear chat modal wiring
        const clearModal = document.getElementById('clearModal');
        const clearCancelBtn = document.getElementById('clearCancelBtn');
        const clearConfirmBtn = document.getElementById('clearConfirmBtn');

        function openClearModal() {
            clearModal?.classList.add('active');
            clearModal?.setAttribute('aria-hidden', 'false');
            clearConfirmBtn?.focus();
        }

        function closeClearModal() {
            clearModal?.classList.remove('active');
            clearModal?.setAttribute('aria-hidden', 'true');
        }

        // Open modal from header button
        document.getElementById('clearChatBtn')?.addEventListener('click', (e) => {
            e.preventDefault();
            openClearModal();
        });

        // Modal actions
        clearCancelBtn?.addEventListener('click', closeClearModal);
        clearConfirmBtn?.addEventListener('click', () => {
            closeClearModal();
            clearChat();
        });
        // Close on overlay click
        clearModal?.addEventListener('click', (e) => {
            if (e.target === clearModal) closeClearModal();
        });
        // Close on Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && clearModal?.classList.contains('active')) {
                closeClearModal();
            }
        });

        mainSendButton.addEventListener('click', () => sendMessage());
        chatSendButton.addEventListener('click', () => sendMessage());
        
        mainInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') sendMessage();
        });

        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') sendMessage();
        });

        // Button ripple coordinate helper
        document.querySelectorAll('.send-button, .primary-btn, .modal-btn').forEach(btn => {
            btn.addEventListener('pointerdown', (e) => {
                const rect = btn.getBoundingClientRect();
                btn.style.setProperty('--x', `${e.clientX - rect.left}px`);
                btn.style.setProperty('--y', `${e.clientY - rect.top}px`);
            });
        });

        // Test connection on load (optional)
        console.log('Chatbot initialized with API URL:', API_URL);
    
