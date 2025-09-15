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
}).catch(error => {
  console.error('Failed to get Ozwell configuration:', error);
});

/**
 * Ozwell Integration Helper Functions
 */
const OzwellHelper = {
  // Create workspace and user session using server methods
  async createSession(context) {
    try {
      ozwellState.loadingSession.set(true);
      ozwellState.status.set('Setting up Ozwell session...');

      // Get project information
      const projectId = context.projectId || context.teamId || 'default';
      const projectName = context.projectName || context.teamName || 'Default Project';

      // Step 1: Create workspace via server
      ozwellState.status.set('Creating workspace...');
      const workspaceId = await Meteor.callAsync('createOzwellWorkspace', projectId, projectName);
      ozwellState.workspaceId.set(workspaceId);

      // Step 2: Create user via server
      ozwellState.status.set('Creating user...');
      const userId = await Meteor.callAsync('createOzwellUser', workspaceId);

      // Step 3: Create user session via server
      ozwellState.status.set('Creating session...');
      const sessionData = await Meteor.callAsync('createOzwellUserSession', workspaceId, userId, false);

      ozwellState.sessionUrl.set(sessionData.loginUrl);
      ozwellState.sessionId.set(sessionData.userId);
      ozwellState.status.set('Session ready');

      return sessionData.loginUrl;

    } catch (error) {
      console.error('Failed to create Ozwell session:', error);
      ozwellState.status.set('Failed to connect to AI assistant');
      ozwellState.sessionUrl.set(null);
    } finally {
      ozwellState.loadingSession.set(false);
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
          Meteor.callAsync('searchMyHistory', baseContext.searchQuery, 5)
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
    const context = {
      inputTarget,
      contextType,
      contextData: contextData || {},
      projectId: contextData?.teamId || contextData?.projectId,
      searchQuery: contextData?.searchQuery
    };

    ozwellState.currentInputTarget.set(inputTarget);
    ozwellState.currentContext.set(context);
    ozwellState.isOpen.set(true);
    ozwellState.status.set('Initializing...');

    // Create session
    await this.createSession(context);

    // Setup iframe communication
    this.setupIframeComm();
  },

  // Close Ozwell
  close() {
    ozwellState.isOpen.set(false);
    ozwellState.sessionUrl.set(null);
    ozwellState.currentInputTarget.set(null);
    ozwellState.currentContext.set(null);
    ozwellState.status.set('');
  },

  // Toggle view mode
  toggleViewMode() {
    const current = ozwellState.viewMode.get();
    ozwellState.viewMode.set(current === 'modal' ? 'sidecar' : 'modal');
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
    
    let parsedContextData = {};
    try {
      if (contextData) {
        parsedContextData = JSON.parse(contextData);
      }
    } catch (e) {
      console.warn('Failed to parse context data:', e);
    }

    OzwellHelper.open(inputTarget, contextType, parsedContextData);
  }
});

// Export for use in other components
export { OzwellHelper, ozwellState };