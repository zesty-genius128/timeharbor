import { Template } from 'meteor/templating';
import { ReactiveVar } from 'meteor/reactive-var';

// Import the HTML template
import './OzwellModal.html';

// Template helpers and events for OzwellModal
Template.ozwellModal.onCreated(function () {
    // Add reference for methods that need access to template
    const template = this;

    this.isOzwellOpen = new ReactiveVar(false);
    this.selectedPrompt = new ReactiveVar(null);
    this.ozwellSessionUrl = new ReactiveVar(null);
    this.availablePrompts = new ReactiveVar([]);
    this.canSave = new ReactiveVar(false);
    this.currentContext = new ReactiveVar(null);
    this.currentInputElement = new ReactiveVar(null);
    this.currentTeamId = new ReactiveVar(null);
    this.sessionReady = new ReactiveVar(false);
    this.generatedContent = new ReactiveVar(null); // Store content from Ozwell
    this.capturedContent = new ReactiveVar(null); // Store captured AI content from postMessage

    // Store reference to this template instance globally for access from other components
    window.ozwellModalInstance = this;

    // Set up global iframe loaded handler
    window.ozwellIframeLoaded = function () {
        console.log('Ozwell iframe loaded');
        if (window.ozwellModalInstance) {
            // Enable save button after iframe loads
            setTimeout(() => {
                window.ozwellModalInstance.canSave.set(true);
                console.log('Save button enabled after iframe load');
            }, 3000);
        }
    };

    // Define loadPrompts method first
    this.loadPrompts = function () {
        Meteor.call('getOzwellPrompts', (err, prompts) => {
            if (!err && prompts) {
                this.availablePrompts.set(prompts);
            } else {
                console.error('Failed to load Ozwell prompts:', err);
                // Fallback to time tracking specific prompts
                this.availablePrompts.set([
                    {
                        id: 'ticket-title',
                        title: 'Write ticket title',
                        description: 'Create a clear, concise ticket title',
                        icon: 'pencil',
                        template: 'Based on this work: "{{currentText}}" in project "{{teamName}}", create a professional ticket title that clearly describes what was accomplished. Make it concise and specific.',
                        systemMessage: 'You are a project management assistant. Create clear, professional ticket titles for time tracking entries.'
                    },
                    {
                        id: 'ticket-description',
                        title: 'Write ticket description',
                        description: 'Generate detailed work description',
                        icon: 'chart-bar',
                        template: 'Project: {{teamName}}\nCurrent work notes: "{{currentText}}"\nRecent activity: {{recentActivitySummary}}\n\nPlease write a detailed ticket description that explains what was accomplished, including technical details and business value. Format it professionally.',
                        systemMessage: 'You are a technical documentation assistant. Write clear, detailed descriptions of development work for time tracking and project management.'
                    },
                    {
                        id: 'daily-summary',
                        title: 'Daily work summary',
                        description: 'Summarize daily progress',
                        icon: 'clock',
                        template: 'Project: {{teamName}}\nToday\'s work: "{{currentText}}"\nTime spent: {{totalTimeToday}}\nRecent tickets: {{recentActivitySummary}}\n\nCreate a professional daily summary of work accomplished, highlighting key achievements and progress made.',
                        systemMessage: 'You are a productivity assistant. Create concise daily work summaries for time tracking and reporting.'
                    },
                    {
                        id: 'status-update',
                        title: 'Project status update',
                        description: 'Generate project status report',
                        icon: 'link',
                        template: 'Project: {{teamName}}\nCurrent progress: "{{currentText}}"\nRecent work: {{recentActivitySummary}}\nTotal time invested: {{totalProjectTime}}\n\nGenerate a professional status update for stakeholders, highlighting progress, current state, and next steps.',
                        systemMessage: 'You are a project communication specialist. Create clear status updates for stakeholders and team members.'
                    }
                ]);
            }
        });
    };

    // Load available prompts
    this.loadPrompts();

    // Open Ozwell modal with context
    this.openOzwell = function (inputElement, context = {}) {
        // Check if user has Ozwell configured
        const user = Meteor.user();
        if (!user?.profile?.ozwellEnabled) {
            alert('Please configure Ozwell in your settings first.');
            return;
        }

        template.currentInputElement.set(inputElement);
        template.currentContext.set(context);
        template.currentTeamId.set(context.teamId);
        template.isOzwellOpen.set(true);
        template.canSave.set(false);
        template.sessionReady.set(false);

        // Reset state
        template.selectedPrompt.set(null);
        template.ozwellSessionUrl.set(null);
    };

    // Set up postMessage listener for iframe communication
    this.setupPostMessageListener = function (prompt, context) {
        // Clean up any existing listener
        if (template.messageHandler) {
            window.removeEventListener('message', template.messageHandler);
        }

        template.messageHandler = function (event) {
            // Verify origin for security
            if (event.origin !== 'https://ai.bluehive.com') {
                return;
            }

            const data = event.data;
            console.log('Received postMessage from Ozwell:', data);

            // Handle different message formats from Ozwell
            if (data.channel === 'IframeSync' && data.type === 'ready') {
                template.sessionReady.set(true);

                // Enable save button after a short delay since Ozwell is ready
                setTimeout(() => {
                    template.canSave.set(true);
                }, 2000);

                // Send initial context to Ozwell
                const iframe = document.querySelector('#ozwell-iframe');
                if (iframe && iframe.contentWindow) {
                    const selectedPrompt = template.selectedPrompt.get();

                    // Process template variables
                    let promptText = selectedPrompt?.template || selectedPrompt?.title || prompt.template || prompt.title;
                    if (promptText && context) {
                        promptText = promptText
                            .replace(/\{\{teamName\}\}/g, context.teamName || 'Current Team')
                            .replace(/\{\{currentText\}\}/g, context.currentText || '')
                            .replace(/\{\{recentActivitySummary\}\}/g, context.recentActivitySummary || 'No recent activity')
                            .replace(/\{\{totalTimeToday\}\}/g, context.projectStats?.formattedTimeToday || '0m')
                            .replace(/\{\{totalProjectTime\}\}/g, context.projectStats?.formattedProjectTime || '0m');
                    }

                    // Rich MCP context with project data
                    const contextData = {
                        type: 'mcp-context',
                        protocol: 'model-context-protocol',
                        version: '1.0',
                        context: {
                            // Core project info
                            project: {
                                name: context.teamName || 'Current Team',
                                type: 'Time Tracking Application',
                                id: context.teamId
                            },

                            // User context
                            user: context.user || {},

                            // Current work context
                            currentWork: {
                                text: context.currentText || '',
                                ticket: context.currentTicket,
                                inputType: 'ticket_description'
                            },

                            // Project statistics and history
                            projectStats: context.projectStats || {},
                            recentActivity: context.recentActivity || [],

                            // AI prompt configuration
                            prompt: {
                                id: selectedPrompt?.id,
                                title: selectedPrompt?.title,
                                template: promptText,
                                systemMessage: selectedPrompt?.systemMessage || 'You are a helpful assistant for time tracking and project management.',
                                instructions: selectedPrompt?.description
                            },

                            // Application context
                            application: {
                                name: 'TimeHarbor',
                                domain: 'time-tracking',
                                capabilities: ['ticket-management', 'time-tracking', 'project-reporting']
                            }
                        }
                    };

                    console.log('Sending rich MCP context to Ozwell:', contextData);
                    iframe.contentWindow.postMessage(contextData, 'https://ai.bluehive.com');

                    // Send the processed prompt as initial message
                    if (promptText && promptText.length > 0) {
                        setTimeout(() => {
                            iframe.contentWindow.postMessage({
                                type: 'ozwell-send-message',
                                message: promptText
                            }, 'https://ai.bluehive.com');
                        }, 1000);
                    }
                }
            } else if (data.channel === 'iframe-basic' && data.message === 'sessionRendered') {
                // Session is rendered and ready
                template.sessionReady.set(true);
                template.canSave.set(true);
            } else if (data.type === 'ai-response' || data.type === 'message' || data.message) {
                // Capture AI-generated content from various message formats
                let content = null;

                if (data.content) {
                    content = data.content;
                } else if (data.text) {
                    content = data.text;
                } else if (data.message && typeof data.message === 'string') {
                    content = data.message;
                } else if (data.response) {
                    content = data.response;
                }

                if (content && typeof content === 'string' && content.trim().length > 10) {
                    console.log('Captured AI response:', content);
                    template.capturedContent.set(content);
                }
            } else if (data.type === 'ozwell-ready') {
                template.sessionReady.set(true);

                // Enable save button after a short delay since Ozwell is ready
                setTimeout(() => {
                    template.canSave.set(true);
                }, 2000);

                // Send initial context to Ozwell
                const iframe = document.querySelector('#ozwell-iframe');
                if (iframe && iframe.contentWindow) {
                    const selectedPrompt = template.selectedPrompt.get();
                    const contextData = {
                        type: 'mcp-context',
                        context: {
                            teamName: context.teamName || 'Current Team',
                            currentText: context.currentText || '',
                            prompt: selectedPrompt?.template || selectedPrompt?.title || prompt.template || prompt.title,
                            systemMessage: selectedPrompt?.systemMessage || prompt.systemMessage || 'You are a helpful writing assistant.',
                            projectType: 'Time Tracking Application',
                            instructions: selectedPrompt?.description || 'Help the user improve their content.',
                            ...context
                        }
                    };

                    console.log('Sending context to Ozwell:', contextData);
                    iframe.contentWindow.postMessage(contextData, 'https://ai.bluehive.com');

                    // Also send the prompt as initial message if available
                    if (selectedPrompt?.template && context.currentText) {
                        setTimeout(() => {
                            const promptMessage = selectedPrompt.template.replace('{{currentText}}', context.currentText || '')
                                .replace('{{teamName}}', context.teamName || 'Current Team');

                            iframe.contentWindow.postMessage({
                                type: 'ozwell-send-message',
                                message: promptMessage
                            }, 'https://ai.bluehive.com');
                        }, 1000);
                    }
                }
            } else if (data.type === 'ozwell-content-ready' || data.type === 'iframe-basic' || data.type === 'sessionRendered') {
                // Content is ready to be saved
                template.canSave.set(true);
                if (data.content) {
                    template.generatedContent.set(data.content);
                }
            } else if (data.type === 'ozwell-content-changed' || data.type === 'messageAdded' || data.type === 'messagesUpdated') {
                // Content has been modified in Ozwell
                template.canSave.set(true);
                if (data.content) {
                    template.generatedContent.set(data.content);
                }
            } else if (data.type === 'ozwell-get-content') {
                // Request current content from Ozwell - send a message to get it
                const iframe = document.querySelector('#ozwell-iframe');
                if (iframe && iframe.contentWindow) {
                    iframe.contentWindow.postMessage({
                        type: 'get-current-content'
                    }, 'https://ai.bluehive.com');
                }
            } else if (data.type === 'ozwell-current-content' || data.type === 'export-content' || data.type === 'content-export') {
                // Received the current content from Ozwell
                if (data.content) {
                    template.generatedContent.set(data.content);
                    template.canSave.set(true);
                    console.log('Received content from Ozwell:', data.content.substring(0, 100) + '...');
                }
            } else if (data.channel === 'iframe-basic' && data.content) {
                // Content received via iframe-basic channel
                template.generatedContent.set(data.content);
                template.canSave.set(true);
                console.log('Received content via iframe-basic:', data.content.substring(0, 100) + '...');
            } else if (data.channel === 'IframeSync' && data.content) {
                // Content received via IframeSync channel
                template.generatedContent.set(data.content);
                template.canSave.set(true);
                console.log('Received content via IframeSync:', data.content.substring(0, 100) + '...');
            } else if (data.type === 'message' && data.text) {
                // Message content received
                template.generatedContent.set(data.text);
                template.canSave.set(true);
                console.log('Received message content:', data.text.substring(0, 100) + '...');
            } else if (data.message && typeof data.message === 'string' && data.message.length > 10) {
                // Generic message content
                template.generatedContent.set(data.message);
                template.canSave.set(true);
                console.log('Received generic message:', data.message.substring(0, 100) + '...');
            } else if (data.channel === 'iframe-basic' && data.message === 'sessionRendered') {
                // Session is ready, try to extract content after a delay
                template.canSave.set(true);
                setTimeout(() => {
                    template.extractContentFromIframe();
                }, 3000);
            } else if (data.type && (data.type.includes('conversation') || data.type.includes('chat'))) {
                // Handle conversation data
                if (data.messages && Array.isArray(data.messages) && data.messages.length > 0) {
                    const lastMessage = data.messages[data.messages.length - 1];
                    if (lastMessage.content || lastMessage.text || lastMessage.message) {
                        const content = lastMessage.content || lastMessage.text || lastMessage.message;
                        template.generatedContent.set(content);
                        template.canSave.set(true);
                        console.log('Received conversation content:', content.substring(0, 100) + '...');
                    }
                }
            }

            // Enhanced content monitoring for real autofill
            // Monitor for any message that might contain AI-generated content
            if (data.type === 'messageAdded' || data.type === 'messagesUpdated' || data.type === 'conversationUpdated') {
                // Try to extract content from various data structures
                let extractedContent = null;

                if (data.messages && Array.isArray(data.messages) && data.messages.length > 0) {
                    // Get the last message from the conversation
                    const lastMessage = data.messages[data.messages.length - 1];
                    if (lastMessage.role === 'assistant' && lastMessage.content) {
                        extractedContent = lastMessage.content;
                    }
                } else if (data.message && data.message.content && data.message.role === 'assistant') {
                    extractedContent = data.message.content;
                } else if (data.content && typeof data.content === 'string') {
                    extractedContent = data.content;
                } else if (data.text && typeof data.text === 'string') {
                    extractedContent = data.text;
                }

                if (extractedContent && extractedContent.length > 20) {
                    template.generatedContent.set(extractedContent);
                    template.canSave.set(true);
                    console.log('Captured AI content automatically:', extractedContent.substring(0, 100) + '...');
                }
            }

            // Also monitor for clipboard events if Ozwell sends them
            if (data.type === 'clipboardUpdate' || data.type === 'textCopied') {
                if (data.content || data.text) {
                    const content = data.content || data.text;
                    template.generatedContent.set(content);
                    template.canSave.set(true);
                    console.log('Content captured from clipboard event:', content.substring(0, 100) + '...');
                }
            }

            // For any message from Ozwell iframe, enable save button (fallback)
            if (!template.canSave.get() && template.sessionReady.get()) {
                setTimeout(() => {
                    template.canSave.set(true);
                }, 3000);
            }

            // FINAL CATCH-ALL: Try to extract content from any unhandled message
            if (!template.capturedContent.get() && data) {
                // Look for any text content in the entire data object
                const searchForContent = (obj, depth = 0) => {
                    if (depth > 3) return null; // Prevent deep recursion

                    if (typeof obj === 'string' && obj.length > 30 &&
                        !obj.includes('sessionRendered') &&
                        !obj.includes('ready') &&
                        !obj.includes('http') &&
                        !obj.includes('iframe')) {
                        return obj;
                    }

                    if (obj && typeof obj === 'object') {
                        for (const key in obj) {
                            if (key === 'content' || key === 'text' || key === 'message' || key === 'response') {
                                const value = obj[key];
                                if (typeof value === 'string' && value.length > 30) {
                                    return value;
                                }
                            }

                            const found = searchForContent(obj[key], depth + 1);
                            if (found) return found;
                        }
                    }

                    return null;
                };

                const foundContent = searchForContent(data);
                if (foundContent) {
                    console.log('Catch-all found content:', foundContent.substring(0, 100) + '...');
                    template.capturedContent.set(foundContent);
                }
            }
        };

        window.addEventListener('message', template.messageHandler);
    };

    // Extract content from iframe when postMessage doesn't work
    this.extractContentFromIframe = function () {
        const iframe = document.querySelector('#ozwell-iframe');
        if (!iframe || !iframe.contentWindow) return;

        console.log('Attempting to extract content from iframe...');

        // Try multiple postMessage approaches first
        const contentRequests = [
            { type: 'get-conversation' },
            { type: 'get-current-content' },
            { type: 'export-content' },
            { type: 'get-last-message' },
            { type: 'get-chat-history' },
            { channel: 'iframe-basic', message: 'getMessages' },
            { channel: 'IframeSync', type: 'getContent' },
            { action: 'getChatHistory' },
            { action: 'getLastResponse' },
            { command: 'export' }
        ];

        contentRequests.forEach((request, index) => {
            setTimeout(() => {
                iframe.contentWindow.postMessage(request, 'https://ai.bluehive.com');
            }, index * 100);
        });

        // After trying postMessage, attempt DOM extraction
        setTimeout(() => {
            try {
                const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
                if (!iframeDoc) {
                    console.log('Cannot access iframe document (CORS)');
                    return;
                }

                // Look for chat messages with more comprehensive selectors
                const messageSelectors = [
                    '[data-testid*="message"]',
                    '[class*="message"]',
                    '[class*="chat"]',
                    '[class*="response"]',
                    '[class*="content"]',
                    '.message-content',
                    '.chat-message',
                    '.response-text',
                    '.message-text',
                    '.ai-response',
                    '.assistant-message',
                    '[role="log"] > div:last-child',
                    '[role="log"] [class*="message"]:last-child',
                    '.conversation [class*="message"]:last-child',
                    'div[data-message-id]',
                    '.prose',
                    'article',
                    'main [class*="text"]'
                ];

                let extractedContent = '';

                for (const selector of messageSelectors) {
                    try {
                        const elements = iframeDoc.querySelectorAll(selector);
                        if (elements.length > 0) {
                            const lastElement = elements[elements.length - 1];
                            const text = lastElement.textContent || lastElement.innerText;

                            if (text && text.trim().length > 20 &&
                                !text.toLowerCase().includes('type a message') &&
                                !text.toLowerCase().includes('send') &&
                                !text.toLowerCase().includes('loading') &&
                                !text.toLowerCase().includes('connecting')) {

                                extractedContent = text.trim();
                                console.log(`Content extracted using selector "${selector}":`, extractedContent.substring(0, 150) + '...');
                                break;
                            }
                        }
                    } catch (e) {
                        // Skip selector if it fails
                    }
                }

                // If still no content, try to find any meaningful text
                if (!extractedContent) {
                    const allText = iframeDoc.body ? (iframeDoc.body.textContent || iframeDoc.body.innerText) : '';
                    const lines = allText.split('\n')
                        .map(line => line.trim())
                        .filter(line =>
                            line.length > 30 &&
                            !line.toLowerCase().includes('type a message') &&
                            !line.toLowerCase().includes('ozwell') &&
                            !line.toLowerCase().includes('send') &&
                            !line.toLowerCase().includes('cancel') &&
                            !line.toLowerCase().includes('loading') &&
                            !line.toLowerCase().includes('connecting') &&
                            !line.toLowerCase().includes('powered by')
                        );

                    if (lines.length > 0) {
                        extractedContent = lines[lines.length - 1];
                        console.log('Content extracted from body text:', extractedContent.substring(0, 150) + '...');
                    }
                }

                if (extractedContent) {
                    template.generatedContent.set(extractedContent);
                    console.log('Successfully extracted content from iframe');
                } else {
                    console.log('No meaningful content found in iframe');
                }

            } catch (e) {
                console.log('Cannot access iframe content due to CORS:', e.message);
            }
        }, 1000);
    };

    // Initialize Ozwell session
    this.initializeOzwellSession = function (prompt) {
        const teamId = template.currentTeamId.get();
        const context = template.currentContext.get();

        if (!teamId) {
            console.error('No team ID available for Ozwell session');
            return;
        }

        // Show loading state
        template.ozwellSessionUrl.set(null);

        // Create Ozwell session
        Meteor.call('createOzwellSession', teamId, false, (err, sessionData) => {
            if (err) {
                console.error('Failed to create Ozwell session:', err);
                alert('Failed to start Ozwell session. Please check your configuration.');
                template.closeOzwell(false);
                return;
            }

            template.ozwellSessionUrl.set(sessionData.loginUrl);

            // Set up postMessage listener for iframe communication
            template.setupPostMessageListener(prompt, context);
        });
    };

    // Paste from clipboard and save
    this.pasteAndSave = async function () {
        try {
            // Try to read from clipboard
            const clipboardText = await navigator.clipboard.readText();

            if (clipboardText && clipboardText.trim().length > 0) {
                // Validate clipboard content - check if it looks like console logs or browser stuff
                const lowerClipboard = clipboardText.toLowerCase();
                const isConsoleLog = lowerClipboard.includes('console') ||
                    lowerClipboard.includes('hmr:') ||
                    lowerClipboard.includes('.js?hash=') ||
                    lowerClipboard.includes('ozwellbutton.js') ||
                    lowerClipboard.includes('ozwellmodal.js') ||
                    lowerClipboard.includes('meteor_js_resource') ||
                    clipboardText.includes('@') && clipboardText.includes(':');

                if (isConsoleLog) {
                    alert('❌ It looks like you copied console logs instead of Ozwell content.\n\n✅ Please:\n1. Click inside the Ozwell chat area above\n2. Select the AI-generated text (not the console)\n3. Copy it (Ctrl+C or Cmd+C)\n4. Click "Paste and Save" again');
                    return;
                }

                // Store the clipboard content
                template.generatedContent.set(clipboardText.trim());
                console.log('Content from clipboard:', clipboardText.substring(0, 100) + '...');

                // Perform autofill with clipboard content
                template.performAutofill();
            } else {
                // If no clipboard content, prompt user to manually copy
                alert('📋 No content found in clipboard.\n\n✅ Please:\n1. Click inside the Ozwell chat area above\n2. Select the AI-generated text\n3. Copy it (Ctrl+C or Cmd+C)\n4. Click "Paste and Save" again');
            }
        } catch (err) {
            console.log('Clipboard access not available:', err);
            // Fallback: prompt user with manual input
            const manualContent = prompt('Clipboard access is restricted.\n\nPlease copy the content from Ozwell above and paste it here:');
            if (manualContent && manualContent.trim().length > 0) {
                template.generatedContent.set(manualContent.trim());
                template.performAutofill();
            } else {
                alert('No content provided. Please copy the text from Ozwell and try again.');
            }
        }
    };

    // Close Ozwell modal
    this.closeOzwell = function (save = false) {
        if (save) {
            // First try to use captured content from postMessage
            let capturedContent = template.capturedContent.get();

            if (capturedContent && capturedContent.trim().length > 10) {
                console.log('Using captured content from postMessage:', capturedContent.substring(0, 100) + '...');
                template.generatedContent.set(capturedContent);
                template.performAutofill();
            } else {
                // Fallback: try iframe extraction
                template.extractContentFromIframe();

                // Wait a moment for extraction then proceed with autofill
                setTimeout(() => {
                    let existingContent = template.generatedContent.get();
                    if (existingContent && existingContent.trim().length > 0) {
                        console.log('Using extracted content:', existingContent.substring(0, 100) + '...');
                        template.performAutofill();
                    } else {
                        console.log('No content captured, using fallback message');
                        template.generatedContent.set('[No AI content found - please try copying manually]');
                        template.performAutofill();
                    }
                }, 1000);
            }
            return;
        }

        template.closeModal();
    };

    // Perform the actual autofill
    this.performAutofill = function () {
        let content = template.generatedContent.get();
        const inputElement = template.currentInputElement.get();

        // If no content was captured, try to get some content one more time
        if (!content || content.trim().length === 0 || content === 'Content generated with Ozwell AI assistant') {
            // Try to get content from the iframe one more time
            const iframe = document.querySelector('#ozwell-iframe');
            if (iframe && iframe.contentWindow) {
                try {
                    const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;

                    // Last attempt to get actual content
                    const textElements = iframeDoc.querySelectorAll('p, div, span');
                    let foundContent = '';

                    for (const element of textElements) {
                        const text = element.textContent || element.innerText;
                        if (text && text.trim().length > 20 &&
                            !text.includes('Type a message') &&
                            !text.includes('AI assistant') &&
                            !text.includes('Ozwell') &&
                            !text.includes('Send') &&
                            !text.includes('Cancel')) {
                            foundContent = text.trim();
                            break;
                        }
                    }

                    if (foundContent) {
                        content = foundContent;
                        console.log('Found content in final attempt:', content.substring(0, 100) + '...');
                    }
                } catch (e) {
                    // CORS restriction - expected
                }
            }

            // If still no content, use a more descriptive placeholder
            if (!content || content.trim().length === 0) {
                content = '[Ozwell AI content - please check the generated text above]';
            }
        }

        if (content && inputElement) {
            console.log('Autofilling content:', content.substring(0, 200) + (content.length > 200 ? '...' : ''));

            // Handle different types of input elements
            if (inputElement.tagName === 'TEXTAREA' || inputElement.tagName === 'INPUT') {
                inputElement.value = content;

                // Trigger input event to notify other parts of the app
                const event = new Event('input', { bubbles: true });
                inputElement.dispatchEvent(event);

                // Also trigger change event
                const changeEvent = new Event('change', { bubbles: true });
                inputElement.dispatchEvent(changeEvent);
            } else if (inputElement.contentEditable === 'true') {
                inputElement.textContent = content;

                // Trigger input event for contentEditable
                const event = new Event('input', { bubbles: true });
                inputElement.dispatchEvent(event);
            }

            // Focus the input element
            inputElement.focus();

            console.log('Ozwell content autofilled successfully');
        } else {
            console.log('No content to autofill or no input element');
        }

        template.closeModal();
    };

    // Close modal and clean up
    this.closeModal = function () {
        template.isOzwellOpen.set(false);

        // Clean up postMessage listener
        if (template.messageHandler) {
            window.removeEventListener('message', template.messageHandler);
            template.messageHandler = null;
        }

        // Reset state
        template.selectedPrompt.set(null);
        template.ozwellSessionUrl.set(null);
        template.currentInputElement.set(null);
        template.currentContext.set(null);
        template.currentTeamId.set(null);
        template.sessionReady.set(false);
        template.canSave.set(false);
        template.generatedContent.set(null);

        console.log('Ozwell modal closed');
    };
});

Template.ozwellModal.onDestroyed(function () {
    // Clean up global reference
    if (window.ozwellModalInstance === this) {
        window.ozwellModalInstance = null;
    }
});

Template.ozwellModal.helpers({
    isOzwellOpen() {
        return Template.instance().isOzwellOpen.get();
    },

    selectedPrompt() {
        return Template.instance().selectedPrompt.get();
    },

    ozwellSessionUrl() {
        return Template.instance().ozwellSessionUrl.get();
    },

    availablePrompts() {
        const allPrompts = Template.instance().availablePrompts.get();
        // Filter prompts based on current context if needed
        return allPrompts;
    },

    canSave() {
        return Template.instance().canSave.get();
    },

    saveButtonClass() {
        return Template.instance().canSave.get() ? '' : 'btn-disabled';
    },

    eq(a, b) {
        return a === b;
    }
});

Template.ozwellModal.events({
    'click #ozwell-close'(event, template) {
        template.closeModal();
    },

    'click #ozwell-backdrop'(event, template) {
        if (event.target.id === 'ozwell-backdrop') {
            template.closeModal();
        }
    },

    'click #ozwell-cancel'(event, template) {
        template.closeModal();
    },

    'click #ozwell-save'(event, template) {
        template.closeOzwell(true);
    },

    'click #ozwell-paste-save'(event, template) {
        template.pasteAndSave();
    },

    'click .prompt-btn'(event, template) {
        const promptId = event.currentTarget.getAttribute('data-prompt-id');
        const prompts = template.availablePrompts.get();
        const selectedPrompt = prompts.find(p => p.id === promptId);

        if (selectedPrompt) {
            template.selectedPrompt.set(selectedPrompt);
            template.initializeOzwellSession(selectedPrompt);
        }
    },

    'click #use-custom-prompt'(event, template) {
        // Create a custom prompt object
        const customPrompt = {
            id: 'custom',
            title: 'Custom Prompt',
            template: 'Current text: "{{currentText}}"\n\nProject: {{teamName}}\n\nPlease help me improve this content.',
            systemMessage: 'You are a helpful writing assistant. Help the user improve their content while maintaining their intended meaning.'
        };

        template.selectedPrompt.set(customPrompt);
        template.initializeOzwellSession(customPrompt);
    }
});

// Template methods
Template.ozwellModal.helpers({
    // Additional methods accessible from template
});

// Global helper function to open Ozwell from any component
window.openOzwell = function (inputElement, context = {}) {
    if (window.ozwellModalInstance) {
        window.ozwellModalInstance.openOzwell(inputElement, context);
    } else {
        console.error('Ozwell modal not available');
    }
};