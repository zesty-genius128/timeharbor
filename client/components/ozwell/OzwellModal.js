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
                // Fallback to basic prompts
                this.availablePrompts.set([
                    {
                        id: 'custom',
                        title: 'Help me write',
                        description: 'Get general writing assistance',
                        icon: 'pencil'
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
            } else if (data.channel === 'iframe-basic' && data.message === 'sessionRendered') {
                // Session is rendered and ready
                template.sessionReady.set(true);
                template.canSave.set(true);
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
            }

            // For any message from Ozwell iframe, enable save button (fallback)
            if (!template.canSave.get() && template.sessionReady.get()) {
                setTimeout(() => {
                    template.canSave.set(true);
                }, 3000);
            }
        };

        window.addEventListener('message', template.messageHandler);
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

    // Close Ozwell modal
    this.closeOzwell = function (save = false) {
        if (save) {
            // Try multiple ways to get content from Ozwell
            const iframe = document.querySelector('#ozwell-iframe');
            if (iframe && iframe.contentWindow && template.sessionReady.get()) {

                // First, try to send specific postMessage requests to get content
                console.log('Requesting content from Ozwell iframe...');

                // Try different postMessage requests that Ozwell might respond to
                const contentRequests = [
                    { type: 'get-current-content' },
                    { type: 'export-content' },
                    { channel: 'iframe-basic', message: 'getContent' },
                    { channel: 'IframeSync', type: 'getContent' },
                    { type: 'get-last-message' },
                    { type: 'export-conversation' }
                ];

                contentRequests.forEach((request, index) => {
                    setTimeout(() => {
                        iframe.contentWindow.postMessage(request, 'https://ai.bluehive.com');
                    }, index * 200);
                });

                // Wait longer for responses and then try to extract content
                setTimeout(() => {
                    // If we still don't have content, try to access iframe DOM directly
                    let extractedContent = template.generatedContent.get();

                    if (!extractedContent || extractedContent.trim().length === 0) {
                        try {
                            // Try to access iframe content directly
                            const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;

                            // Try multiple selectors to find content
                            const selectors = [
                                '.message-content',
                                '.chat-message',
                                '.response-text',
                                '.message-text',
                                '.content',
                                '[data-message]',
                                '.message:last-child',
                                '.chat-content .message:last-child',
                                'p:last-child',
                                'div[role="textbox"]',
                                '.ql-editor',
                                '.text-content'
                            ];

                            for (const selector of selectors) {
                                const elements = iframeDoc.querySelectorAll(selector);
                                if (elements.length > 0) {
                                    const lastElement = elements[elements.length - 1];
                                    const content = lastElement.textContent || lastElement.innerText;
                                    if (content && content.trim().length > 10 && !content.includes('Type a message')) {
                                        extractedContent = content.trim();
                                        console.log(`Content extracted using selector ${selector}:`, extractedContent.substring(0, 100) + '...');
                                        break;
                                    }
                                }
                            }

                            // If still no good content, try to get all text from the iframe
                            if (!extractedContent || extractedContent.trim().length === 0) {
                                const allText = iframeDoc.body.textContent || iframeDoc.body.innerText;
                                // Look for meaningful content (not UI text)
                                const lines = allText.split('\n').map(line => line.trim()).filter(line =>
                                    line.length > 20 &&
                                    !line.includes('Type a message') &&
                                    !line.includes('Ozwell AI') &&
                                    !line.includes('Send') &&
                                    !line.includes('Cancel') &&
                                    !line.toLowerCase().includes('loading') &&
                                    !line.toLowerCase().includes('connecting')
                                );

                                if (lines.length > 0) {
                                    extractedContent = lines[lines.length - 1]; // Get the last meaningful line
                                    console.log('Content extracted from body text:', extractedContent.substring(0, 100) + '...');
                                }
                            }

                        } catch (e) {
                            console.log('Cannot access iframe content directly (CORS):', e);
                            // This is expected due to CORS restrictions
                        }
                    }

                    if (extractedContent && extractedContent.trim().length > 0) {
                        template.generatedContent.set(extractedContent);
                    }

                    template.performAutofill();
                }, 1500);

                // Don't close immediately if we're saving - wait for autofill
                return;
            } else {
                // If no iframe or not ready, try to use any stored content
                template.performAutofill();
            }
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