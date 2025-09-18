// Listen for autofill postMessage from Ozwell iframe (top-level, not inside any event block)
window.addEventListener('message', (event) => {
  if (
    event.data &&
    event.data.channel === 'iframe-basic' &&
    event.data.message === 'autofill' &&
    typeof event.data.data?.text === 'string'
  ) {
    // Autofill the input box with the provided text
    const inputTarget = ozwellState.currentInputTarget.get();
    let inputElement = inputTarget ? document.querySelector(inputTarget) : null;
    if (!inputElement) {
      // Fallback: autofill the first text input or textarea on the page
      inputElement = document.querySelector('input[type="text"], textarea');
    }
    if (inputElement) {
      inputElement.value = event.data.data.text;
      inputElement.dispatchEvent(new Event('input', { bubbles: true }));
      inputElement.dispatchEvent(new Event('change', { bubbles: true }));
      inputElement.focus();
      // Show a temporary confirmation message
      let confirmDiv = document.createElement('div');
      confirmDiv.textContent = 'Autofilled!';
      confirmDiv.style.position = 'fixed';
      confirmDiv.style.top = '20px';
      confirmDiv.style.right = '20px';
      confirmDiv.style.background = '#38bdf8';
      confirmDiv.style.color = '#fff';
      confirmDiv.style.padding = '8px 16px';
      confirmDiv.style.borderRadius = '8px';
      confirmDiv.style.zIndex = '9999';
      document.body.appendChild(confirmDiv);
      setTimeout(() => {
        confirmDiv.remove();
      }, 1500);
    }
    // Optionally close the modal after autofill
    OzwellHelper.close();
  }
});
import { Template } from 'meteor/templating';
import { ReactiveVar } from 'meteor/reactive-var';
import { OzwellConversations } from '../../../collections.js';

/**
 * Ozwell AI Integration
 * Handles modal/sidecar display and iframe communication
 */

// Global reactive variables for Ozwell state
const ozwellState = {
  isOpen: new ReactiveVar(false),
  viewMode: new ReactiveVar('modal'), // 'modal' or 'sidecar'
  sessionUrl: new ReactiveVar(null),
  loadingSession: new ReactiveVar(false),
  status: new ReactiveVar(''),
  currentInputTarget: new ReactiveVar(null),
  currentContext: new ReactiveVar(null),
  workspaceId: new ReactiveVar(null),
  sessionId: new ReactiveVar(null)
};

// Ozwell API configuration
const OZWELL_CONFIG = {
  // Client will get configuration from server to avoid exposing API keys
  baseUrl: null,
  endpoints: null,
  hasApiKey: false
};

// Initialize configuration from server
Meteor.callAsync('getOzwellConfig').then(config => {
  Object.assign(OZWELL_CONFIG, config);
  console.log('Ozwell config loaded:', config);

  // Test API connection
  return Meteor.callAsync('testOzwellConnection');
}).then(testResult => {
  console.log('Ozwell API test result:', testResult);
  if (testResult.success) {
    console.log('🎉 Ozwell API is available!');
  } else {
    console.log('⚠️ Ozwell API not available, using mock mode');
  }
}).catch(error => {
  console.error('Failed to get Ozwell configuration or test connection:', error);
});

/**
 * Ozwell Integration Helper Functions
 */
const OzwellHelper = {
  // Create workspace and user session using server methods
  async createSession(context) {
    try {
      ozwellState.loadingSession.set(true);
      ozwellState.status.set('Loading AI assistant...');

      // Store context for later use
      ozwellState.currentContext.set(context);

      // Check if user has Ozwell enabled and API key
      const user = Meteor.user();
      if (!user?.profile?.ozwellEnabled || !user?.profile?.ozwellApiKey) {
        ozwellState.status.set('Ozwell not enabled. Please configure in Settings.');
        ozwellState.sessionUrl.set(null);
        return null;
      }

      // Try to create a real Ozwell session first
      const realSessionUrl = await this.createRealOzwellSession(context);
      if (realSessionUrl) {
        console.log('✅ Real Ozwell session created:', realSessionUrl);
        ozwellState.sessionUrl.set(realSessionUrl);
        ozwellState.status.set('AI assistant ready');

        // Setup communication with real Ozwell iframe
        setTimeout(() => {
          this.setupRealOzwellComm();
        }, 500);

        return realSessionUrl;
      }

      // Fallback to mock if real session fails
      console.log('⚠️ Real Ozwell session failed, using mock');
      const mockChatUrl = `${window.location.origin}/mock-ozwell-chat.html`;
      ozwellState.sessionUrl.set(mockChatUrl);
      ozwellState.status.set('AI assistant ready (mock mode)');

      // Setup iframe communication for mock
      setTimeout(() => {
        this.setupMockIframeComm();
      }, 500);

      return mockChatUrl;

    } catch (error) {
      console.error('Failed to create Ozwell session:', error);
      ozwellState.status.set('Failed to connect to AI assistant');
      ozwellState.sessionUrl.set(null);
    } finally {
      ozwellState.loadingSession.set(false);
    }
  },

  // Create real Ozwell session
  async createRealOzwellSession(context) {
    try {
      // Get current context for the session
      const inputTarget = ozwellState.currentInputTarget.get();

      if (!context || !inputTarget) {
        console.warn('❌ Missing context for Ozwell session');
        return null;
      }

      // Get current text from the input field
      const inputElement = document.querySelector(inputTarget);
      const currentText = inputElement ? inputElement.value : '';

      // Extract field type from context
      let fieldType = 'text';
      if (context.contextData && context.contextData.formType) {
        fieldType = context.contextData.formType;
      }

      // Create project-specific Ozwell session via server method
      const sessionResult = await new Promise((resolve, reject) => {
        Meteor.call('createProjectSession', 'timeharbor-project', (error, result) => {
          if (error) {
            console.error('Project session creation failed:', error);
            reject(error);
          } else {
            resolve(result);
          }
        });
      });

      if (sessionResult && sessionResult.sessionUrl) {
        // Store session ID for future reference
        if (sessionResult.sessionId) {
          ozwellState.sessionId.set(sessionResult.sessionId);
          console.log('📝 Session ID stored:', sessionResult.sessionId);
        }

        // Add context parameters to the session URL for better AI understanding
        const url = new URL(sessionResult.sessionUrl);
        url.searchParams.set('context', JSON.stringify({
          fieldType: fieldType,
          currentText: currentText,
          projectType: 'time_tracking',
          teamName: context.teamName || 'Current Project',
          userHint: this.generateUserHint(fieldType, currentText)
        }));

        return url.toString();
      }

      return null;
    } catch (error) {
      console.error('Error creating real Ozwell session:', error);
      return null;
    }
  },

  // Generate helpful hint for the user based on context
  generateUserHint(fieldType, currentText) {
    if (fieldType === 'activity_title') {
      if (currentText.trim()) {
        return `Help me improve this activity title: "${currentText}"`;
      } else {
        return 'Help me write a professional activity title for my time tracking';
      }
    } else if (fieldType === 'activity_notes') {
      if (currentText.trim()) {
        return `Help me expand these activity notes: "${currentText}"`;
      } else {
        return 'Help me write detailed activity notes for my time tracking';
      }
    }
    return 'Help me write professional text for my time tracking application';
  },

  // Setup communication with real Ozwell iframe
  setupRealOzwellComm() {
    window.addEventListener('message', (event) => {
      // Accept messages from Ozwell domains
      if (!event.origin.includes('bluehive.com') && !event.origin.includes('ozwell.com')) {
        return;
      }

      const { message, channel, data } = event.data;

      // Handle Ozwell iframe messages
      if (channel === 'iframe-basic') {
        switch (message) {
          case 'text_selected':
          case 'content_selected':
            // User selected text from Ozwell
            console.log('📥 Text selected from real Ozwell:', data);
            this.handleRealOzwellTextSelected(data);
            break;

          case 'session_ready':
            // Ozwell session is ready, send initial context
            console.log('🚀 Real Ozwell session ready');
            this.sendRealOzwellContext();
            break;

          case 'cancelled':
          case 'close':
            // User cancelled the session
            console.log('❌ Real Ozwell session cancelled');
            OzwellHelper.close();
            break;

          // MCP Request Handlers for Real Ozwell
          case 'mcp_request':
            console.log('📨 MCP request from real Ozwell:', data);
            this.handleRealOzwellMCPRequest(data, event.source);
            break;
        }
      }
    });
  },

  // Send context to real Ozwell session
  sendRealOzwellContext() {
    const context = ozwellState.currentContext.get();
    const inputTarget = ozwellState.currentInputTarget.get();

    if (!context || !inputTarget) {
      console.warn('❌ Missing context for real Ozwell session');
      return;
    }

    const iframe = document.getElementById('ozwellIframe') || document.getElementById('ozwellIframeSidecar');
    if (!iframe) {
      console.warn('❌ No Ozwell iframe found');
      return;
    }

    // Get current text from the input field
    const inputElement = document.querySelector(inputTarget);
    const currentText = inputElement ? inputElement.value : '';

    // Extract field type from context
    let fieldType = 'text';
    if (context.contextData && context.contextData.formType) {
      fieldType = context.contextData.formType;
    }

    const contextData = {
      message: 'set_context',
      channel: 'iframe-basic',
      data: {
        fieldType: fieldType,
        currentText: currentText,
        projectType: 'time_tracking',
        teamName: context.teamName || 'Current Project',
        userHint: this.generateUserHint(fieldType, currentText)
      }
    };

    console.log('📤 Sending context to real Ozwell:', contextData);
    iframe.contentWindow.postMessage(contextData, '*');
  },

  // Handle text selection from real Ozwell
  handleRealOzwellTextSelected(data) {
    const inputTarget = ozwellState.currentInputTarget.get();
    if (!inputTarget) return;

    // Find the input element and update its value
    const inputElement = document.querySelector(inputTarget);
    if (inputElement) {
      const selectedText = data.selectedText || data.text || data.content;
      inputElement.value = selectedText;

      // Trigger input event for reactive updates
      inputElement.dispatchEvent(new Event('input', { bubbles: true }));

      console.log('✅ Text selected from real Ozwell and applied:', selectedText);
    }

    // Close the modal after a short delay to let user see the change
    setTimeout(() => {
      OzwellHelper.close();
    }, 500);
  },

  // Handle MCP requests from real Ozwell iframe
  async handleRealOzwellMCPRequest(data, source) {
    const { requestType, requestId, params } = data;

    try {
      switch (requestType) {
        case 'get_context':
          await this.handleMCPContextRequest({ requestId, params }, source);
          break;
        case 'search_user_history':
          await this.handleMCPUserHistorySearch({ requestId, params }, source);
          break;
        case 'search_project_history':
          await this.handleMCPProjectHistorySearch({ requestId, params }, source);
          break;
        case 'get_page_context':
          await this.handleMCPPageContextRequest({ requestId, params }, source);
          break;
        default:
          source.postMessage({
            channel: 'iframe-basic',
            message: 'mcp_response',
            data: {
              requestId,
              error: `Unknown MCP request type: ${requestType}`
            }
          }, '*');
      }
    } catch (error) {
      console.error('❌ Real Ozwell MCP request failed:', error);
      source.postMessage({
        channel: 'iframe-basic',
        message: 'mcp_response',
        data: {
          requestId,
          error: error.message || 'MCP request failed'
        }
      }, '*');
    }
  },

  // Setup postMessage communication with iframe
  setupIframeComm() {
    window.addEventListener('message', (event) => {
      // Verify origin for security - accept from Ozwell domains
      if (!event.origin.includes('bluehive.com')) {
        return;
      }

      const { message, channel, data } = event.data;

      // Only handle iframe-basic channel messages
      if (channel !== 'iframe-basic') {
        return;
      }

      switch (message) {
        case 'sessionRendered':
          // Ozwell is ready to receive context
          this.sendInitialContext();
          break;

        case 'aiResponse':
          this.handleAIResponse(data);
          break;

        case 'requestContext':
          this.sendCurrentContext();
          break;

        case 'close':
          OzwellHelper.close();
          break;
      }
    });
  },

  // Setup postMessage communication with mock iframe
  setupMockIframeComm() {
    window.addEventListener('message', (event) => {
      // Accept messages from our own domain for mock testing
      if (event.origin !== window.location.origin) {
        return;
      }

      switch (event.data.type) {
        case 'chat_ready':
          // Mock chat is ready, send initial context
          this.sendMockContext();
          break;

        case 'text_selected':
          // User selected text from AI suggestions
          this.handleMockTextSelected(event.data);
          break;

        case 'cancelled':
          // User cancelled the chat
          OzwellHelper.close();
          break;

        case 'ozwell_api_call':
          // Handle API call request from iframe
          console.log('📤 Received API call request from iframe:', event.data);

          // Call the server method to send to Ozwell API
          Meteor.call('sendMessageToOzwell', event.data.message, event.data.context, (error, result) => {
            if (error) {
              console.error('❌ Error calling Ozwell API:', error);
              // Send error response back to iframe
              event.source.postMessage({
                type: 'ozwell_api_response',
                result: {
                  success: false,
                  error: error.reason || 'Unknown error'
                }
              }, window.location.origin);
            } else {
              console.log('✅ Ozwell API response:', result);
              // Send successful response back to iframe
              event.source.postMessage({
                type: 'ozwell_api_response',
                result: result
              }, window.location.origin);
            }
          });
          break;

        case 'mcp_context_request':
          // Handle MCP context requests from iframe
          this.handleMCPContextRequest(event.data, event.source);
          break;

        case 'mcp_search_user_history':
          // Handle user history search requests
          this.handleMCPUserHistorySearch(event.data, event.source);
          break;

        case 'mcp_search_project_history':
          // Handle project history search requests
          this.handleMCPProjectHistorySearch(event.data, event.source);
          break;

        case 'mcp_get_page_context':
          // Handle page context requests
          this.handleMCPPageContextRequest(event.data, event.source);
          break;
      }
    });
  },

  // Send context to mock iframe
  sendMockContext() {
    const context = ozwellState.currentContext.get();
    const inputTarget = ozwellState.currentInputTarget.get();

    console.log('🔍 sendMockContext called with:', { context, inputTarget });

    if (!context || !inputTarget) {
      console.warn('❌ Missing context or inputTarget:', { context, inputTarget });
      return;
    }

    const iframe = document.getElementById('ozwellIframe') || document.getElementById('ozwellIframeSidecar');
    if (!iframe) {
      console.warn('❌ No iframe found');
      return;
    }

    // Get current text from the input field
    const inputElement = document.querySelector(inputTarget);
    const currentText = inputElement ? inputElement.value : '';
    console.log('📝 Current text from input:', currentText);

    // Extract field type from context
    let fieldType = 'text';
    if (context.contextData && context.contextData.formType) {
      fieldType = context.contextData.formType;
    }
    console.log('🏷️ Field type extracted:', fieldType);

    const messageData = {
      type: 'init_session',
      currentText: currentText,
      fieldType: fieldType,
      teamName: context.teamName || 'Current Project'
    };

    console.log('📤 Sending to iframe:', messageData);

    // Send initialization data to mock chat
    iframe.contentWindow.postMessage(messageData, window.location.origin);
  },

  // Handle text selection from mock chat
  handleMockTextSelected(data) {
    const inputTarget = ozwellState.currentInputTarget.get();
    if (!inputTarget) return;

    // Find the input element and update its value
    const inputElement = document.querySelector(inputTarget);
    if (inputElement) {
      inputElement.value = data.selectedText;

      // Trigger input event so any listeners get notified
      inputElement.dispatchEvent(new Event('input', { bubbles: true }));
      inputElement.dispatchEvent(new Event('change', { bubbles: true }));

      // Focus the input to show the change
      inputElement.focus();
    }

    // Close the modal
    OzwellHelper.close();
  },

  // Send initial context to Ozwell iframe
  async sendInitialContext() {
    const context = ozwellState.currentContext.get();
    if (!context) return;

    const iframe = document.getElementById('ozwellIframe') || document.getElementById('ozwellIframeSidecar');
    if (!iframe) return;

    // Get additional context from server
    const fullContext = await this.getFullContext(context);

    // Send context via postMessage according to Ozwell documentation
    iframe.contentWindow.postMessage({
      channel: 'iframe-basic',
      message: 'setContext',
      context: this.formatContextForOzwell(fullContext)
    }, '*');
  },

  // Format context for Ozwell according to their documentation
  formatContextForOzwell(fullContext) {
    let contextText = `TimeHarbor Project Context\n\n`;

    // Current activity/form context
    if (fullContext.pageContext) {
      contextText += `Current Activity:\n${JSON.stringify(fullContext.pageContext, null, 2)}\n\n`;
    }

    // User's recent activities
    if (fullContext.userHistory?.tickets?.length > 0) {
      contextText += `Recent User Activities:\n`;
      fullContext.userHistory.tickets.forEach(ticket => {
        contextText += `- ${ticket.title}: ${ticket.description || 'No description'}\n`;
      });
      contextText += '\n';
    }

    // Project history
    if (fullContext.projectHistory?.tickets?.length > 0) {
      contextText += `Project Activity History:\n`;
      fullContext.projectHistory.tickets.slice(0, 5).forEach(ticket => {
        contextText += `- ${ticket.title}: ${ticket.description || 'No description'}\n`;
      });
      contextText += '\n';
    }

    // Existing conversation
    if (fullContext.conversationHistory?.length > 0) {
      contextText += `Previous Conversation:\n`;
      fullContext.conversationHistory.slice(-3).forEach(msg => {
        contextText += `${msg.role}: ${msg.content}\n`;
      });
      contextText += '\n';
    }

    // Current form field context
    if (fullContext.contextType === 'ticket_form') {
      contextText += `Task: Help improve the content for a ${fullContext.contextData?.formType || 'activity'} in TimeHarbor time tracking system.\n`;
      contextText += `Instructions: Please provide clear, professional suggestions that would be appropriate for time tracking and project management.\n`;
    }

    return contextText;
  },

  // Get full context including project history
  async getFullContext(baseContext) {
    try {
      const promises = [];

      // Get page context
      promises.push(
        Meteor.callAsync('getPageContext', baseContext.contextType, baseContext.contextData || {})
      );

      // Get user history if available
      if (baseContext.searchQuery) {
        promises.push(
          Meteor.callAsync('searchUserHistory', baseContext.searchQuery, 5)
        );
      }

      // Get project history if we have a project ID
      if (baseContext.projectId) {
        promises.push(
          Meteor.callAsync('searchProjectHistory', baseContext.projectId, '', 10)
        );
      }

      // Get existing conversation
      if (baseContext.projectId) {
        promises.push(
          Meteor.callAsync('getOzwellConversation', baseContext.projectId)
        );
      }

      const [pageContext, userHistory, projectHistory, conversation] = await Promise.all(promises);

      return {
        ...baseContext,
        pageContext,
        userHistory: userHistory || { tickets: [], activities: [] },
        projectHistory: projectHistory || { tickets: [], activities: [] },
        conversationHistory: conversation?.messages || [],
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('Failed to get full context:', error);
      return baseContext;
    }
  },

  // Handle AI response from iframe
  handleAIResponse(data) {
    const inputTarget = ozwellState.currentInputTarget.get();

    if (data.enhancedText && inputTarget) {
      // Update the original input field
      const targetElement = document.querySelector(inputTarget);
      if (targetElement) {
        targetElement.value = data.enhancedText;

        // Trigger change event
        const event = new Event('change', { bubbles: true });
        targetElement.dispatchEvent(event);

        // Show success feedback
        ozwellState.status.set('Text updated successfully!');

        // Auto-close after delay
        setTimeout(() => {
          this.close();
        }, 2000);
      }
    }

    // Save conversation
    this.saveConversation(data);
  },

  // Save conversation to database
  async saveConversation(aiData) {
    const context = ozwellState.currentContext.get();
    if (!context?.projectId) return;

    try {
      await Meteor.callAsync('saveOzwellConversation', {
        projectId: context.projectId,
        messages: aiData.messages || [],
        workspaceId: ozwellState.workspaceId.get(),
        sessionId: ozwellState.sessionId.get(),
        lastActivity: new Date(),
        context: context
      });
    } catch (error) {
      console.error('Failed to save conversation:', error);
    }
  },

  // Open Ozwell with context
  async open(inputTarget, contextType, contextData) {
    // Check if user has Ozwell enabled
    const user = Meteor.user();
    if (!user?.profile?.ozwellApiKey) {
      // Show alert and redirect to settings
      if (confirm('Ozwell AI is not enabled. Would you like to go to Settings to enable it?')) {
        // Trigger navigation to settings (this will work with the existing nav system)
        const settingsLink = document.querySelector('a[href="/settings"]');
        if (settingsLink) {
          settingsLink.click();
        } else {
          alert('Please go to Settings to enable Ozwell AI integration.');
        }
      }
      return;
    }

    // Build context object
    const context = {
      inputTarget,
      contextType,
      contextData: contextData || {},
      projectId: contextData?.teamId || contextData?.projectId,
      searchQuery: contextData?.searchQuery
    };

    // Check if we already have a session for this project/context
    const prevContext = ozwellState.currentContext.get();
    const prevSessionUrl = ozwellState.sessionUrl.get();
    const prevProjectId = prevContext?.projectId;
    const newProjectId = context.projectId;

    ozwellState.currentInputTarget.set(inputTarget);
    ozwellState.currentContext.set(context);
    ozwellState.isOpen.set(true);
    ozwellState.status.set('Initializing...');

    // Only create a new session if project/context changed or no session exists
    if (!prevSessionUrl || prevProjectId !== newProjectId) {
      await this.createSession(context);
    }

    // Setup iframe communication
    this.setupIframeComm();
  },

  // Close Ozwell
  close() {
    ozwellState.isOpen.set(false);
    // Do NOT clear sessionUrl or currentContext, so session persists
    ozwellState.currentInputTarget.set(null);
    ozwellState.status.set('');
  },

  // Toggle view mode
  toggleViewMode() {
    const current = ozwellState.viewMode.get();
    ozwellState.viewMode.set(current === 'modal' ? 'sidecar' : 'modal');
  },

  // MCP Context Request Handlers
  async handleMCPContextRequest(data, source) {
    try {
      const context = ozwellState.currentContext.get();
      const fullContext = await this.getFullContext(context || {});

      source.postMessage({
        type: 'mcp_context_response',
        requestId: data.requestId,
        data: fullContext
      }, window.location.origin);
    } catch (error) {
      console.error('❌ MCP context request failed:', error);
      source.postMessage({
        type: 'mcp_context_response',
        requestId: data.requestId,
        error: error.message || 'Failed to get context'
      }, window.location.origin);
    }
  },

  async handleMCPUserHistorySearch(data, source) {
    try {
      const { query = '', limit = 10 } = data.params || {};

      const result = await Meteor.callAsync('searchUserHistory', query, limit);

      source.postMessage({
        type: 'mcp_user_history_response',
        requestId: data.requestId,
        data: result
      }, window.location.origin);
    } catch (error) {
      console.error('❌ MCP user history search failed:', error);
      source.postMessage({
        type: 'mcp_user_history_response',
        requestId: data.requestId,
        error: error.message || 'Failed to search user history'
      }, window.location.origin);
    }
  },

  async handleMCPProjectHistorySearch(data, source) {
    try {
      const { projectId, query = '', limit = 10 } = data.params || {};

      if (!projectId) {
        throw new Error('Project ID is required');
      }

      const result = await Meteor.callAsync('searchProjectHistory', projectId, query, limit);

      source.postMessage({
        type: 'mcp_project_history_response',
        requestId: data.requestId,
        data: result
      }, window.location.origin);
    } catch (error) {
      console.error('❌ MCP project history search failed:', error);
      source.postMessage({
        type: 'mcp_project_history_response',
        requestId: data.requestId,
        error: error.message || 'Failed to search project history'
      }, window.location.origin);
    }
  },

  async handleMCPPageContextRequest(data, source) {
    try {
      const { pageType, pageData = {} } = data.params || {};

      if (!pageType) {
        throw new Error('Page type is required');
      }

      const result = await Meteor.callAsync('getPageContext', pageType, pageData);

      source.postMessage({
        type: 'mcp_page_context_response',
        requestId: data.requestId,
        data: result
      }, window.location.origin);
    } catch (error) {
      console.error('❌ MCP page context request failed:', error);
      source.postMessage({
        type: 'mcp_page_context_response',
        requestId: data.requestId,
        error: error.message || 'Failed to get page context'
      }, window.location.origin);
    }
  }
};

/**
 * Template Helpers
 */

// Ozwell Modal Template
Template.ozwellModal.helpers({
  isOzwellOpen() {
    return ozwellState.isOpen.get() && ozwellState.viewMode.get() === 'modal';
  },
  ozwellSessionUrl() {
    return ozwellState.sessionUrl.get() || 'about:blank';
  },
  ozwellLoadingSession() {
    return ozwellState.loadingSession.get();
  },
  ozwellStatus() {
    return ozwellState.status.get();
  },
  ozwellViewMode(mode) {
    return ozwellState.viewMode.get() === mode;
  }
});

// Ozwell Sidecar Template
Template.ozwellSidecar.helpers({
  isOzwellSidecarOpen() {
    return ozwellState.isOpen.get() && ozwellState.viewMode.get() === 'sidecar';
  },
  ozwellSessionUrl() {
    return ozwellState.sessionUrl.get() || 'about:blank';
  },
  ozwellLoadingSession() {
    return ozwellState.loadingSession.get();
  },
  ozwellStatus() {
    return ozwellState.status.get();
  }
});

/**
 * Template Events
 */

// Modal Events
Template.ozwellModal.events({
  'click #ozwellSaveClose'(event) {
    // Send postMessage to iframe to trigger save
    const iframe = document.getElementById('ozwellIframe');
    if (iframe) {
      iframe.contentWindow.postMessage({
        channel: 'iframe-basic',
        message: 'saveAndClose'
      }, '*');
    }
    OzwellHelper.close();
  },

  'click #ozwellCancel'(event) {
    OzwellHelper.close();
  },
  'click #ozwellClose'() {
    OzwellHelper.close();
  },

  'click #ozwellToggleView'() {
    OzwellHelper.toggleViewMode();
  },

  'click #ozwellRetry'() {
    const context = ozwellState.currentContext.get();
    if (context) {
      OzwellHelper.createSession(context);
    }
  }
});

// Sidecar Events
Template.ozwellSidecar.events({
  'click #ozwellSaveCloseSidecar'(event) {
    // Send postMessage to sidecar iframe to trigger save
    const iframe = document.getElementById('ozwellIframeSidecar');
    if (iframe) {
      iframe.contentWindow.postMessage({
        channel: 'iframe-basic',
        message: 'saveAndClose'
      }, '*');
    }
    OzwellHelper.close();
  },

  'click #ozwellCancelSidecar'(event) {
    OzwellHelper.close();
  },
  'click #ozwellCloseSidecar'() {
    OzwellHelper.close();
  },

  'click #ozwellToggleViewSidecar'() {
    OzwellHelper.toggleViewMode();
  },

  'click #ozwellRetrySidecar'() {
    const context = ozwellState.currentContext.get();
    if (context) {
      OzwellHelper.createSession(context);
    }
  }
});

// Global click handler for Ozwell trigger buttons
Template.body.events({
  'click .ozwell-trigger'(event) {
    event.preventDefault();

    const button = event.currentTarget;
    const inputTarget = button.getAttribute('data-input-target');
    const contextType = button.getAttribute('data-context-type');
    const contextData = button.getAttribute('data-context-data');

    console.log('🔘 Plus button clicked:', { inputTarget, contextType, contextData });

    let parsedContextData = {};
    try {
      if (contextData) {
        parsedContextData = JSON.parse(contextData);
        console.log('✅ Parsed context data:', parsedContextData);
      }
    } catch (e) {
      console.warn('❌ Failed to parse context data:', e);
    }

    console.log('🚀 Opening Ozwell with:', { inputTarget, contextType, parsedContextData });
    OzwellHelper.open(inputTarget, contextType, parsedContextData);
  }
});

// Export for use in other components
export { OzwellHelper, ozwellState };