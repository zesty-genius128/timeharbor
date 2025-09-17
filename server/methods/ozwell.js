import { Meteor } from 'meteor/meteor';
import { check, Match } from 'meteor/check';
import { OzwellConversations, Tickets, Teams, ClockEvents } from '../../collections.js';

/**
 * Ozwell AI Integration Methods
 * These methods support the Ozwell AI writing assistant integration
 * following the MCP (Model Context Protocol) specification
 */

// Ozwell API Configuration
const OZWELL_CONFIG = {
  baseUrl: 'https://ai.bluehive.com',
  apiKey: process.env.OZWELL_API_KEY || 'BHSK-sandbox-SAMPLE', // Use environment variable or sandbox key
  endpoints: {
    createWorkspace: '/api/v1/workspaces/create',
    createUser: '/api/v1/workspaces/{workspaceId}/create-user',
    createUserSession: '/api/v1/workspaces/{workspaceId}/create-user-session',
    testCredentials: '/api/v1/test-credentials'
  }
};

export const ozwellMethods = {
  /**
   * Test Ozwell API connection
   */
  async testOzwellConnection() {
    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'Must be logged in');
    }

    try {
      console.log('Testing Ozwell API connection...');
      console.log('API Key available:', !!OZWELL_CONFIG.apiKey);
      console.log('Base URL:', OZWELL_CONFIG.baseUrl);

      const response = await fetch(`${OZWELL_CONFIG.baseUrl}/api/v1/test-credentials`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OZWELL_CONFIG.apiKey}`
        }
      });

      console.log('API Response status:', response.status);
      
      if (response.ok) {
        const data = await response.json();
        console.log('API Response data:', data);
        return {
          success: true,
          status: response.status,
          data: data
        };
      } else {
        const errorText = await response.text();
        console.log('API Error:', response.status, errorText);
        return {
          success: false,
          status: response.status,
          error: errorText
        };
      }
    } catch (error) {
      console.error('Connection test failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  },

  /**
   * Enable Ozwell for a user by storing their API key
   */
  async enableOzwellForUser(apiKey) {
    check(apiKey, String);
    
    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'Must be logged in');
    }
    
    if (!apiKey || apiKey.length < 10) {
      throw new Meteor.Error('invalid-api-key', 'Please provide a valid Ozwell API key');
    }
    
    try {
      // Test the API key by making a test call
      const testResponse = await fetch(`${OZWELL_CONFIG.baseUrl}/api/v1/test-credentials`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        }
      });
      
      if (!testResponse.ok) {
        throw new Meteor.Error('invalid-api-key', 'API key is invalid or expired');
      }
      
      // Store the API key in user's profile
      await Meteor.users.updateAsync(this.userId, {
        $set: {
          'profile.ozwellApiKey': apiKey,
          'profile.ozwellEnabled': true,
          'profile.ozwellLastConnected': new Date()
        }
      });
      
      console.log(`Ozwell enabled for user ${this.userId}`);
      return { success: true };
      
    } catch (error) {
      if (error.name === 'Error' && error.message.includes('fetch')) {
        throw new Meteor.Error('connection-error', 'Unable to connect to Ozwell API. Please check your internet connection.');
      }
      throw error;
    }
  },
  
  /**
   * Disable Ozwell for a user
   */
  async disableOzwellForUser() {
    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'Must be logged in');
    }
    
    await Meteor.users.updateAsync(this.userId, {
      $unset: {
        'profile.ozwellApiKey': '',
        'profile.ozwellEnabled': '',
        'profile.ozwellLastConnected': ''
      }
    });
    
    console.log(`Ozwell disabled for user ${this.userId}`);
    return { success: true };
  },
  
  /**
   * Test user's Ozwell connection
   */
  async testUserOzwellConnection() {
    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'Must be logged in');
    }
    
    const user = await Meteor.users.findOneAsync(this.userId);
    const apiKey = user?.profile?.ozwellApiKey;
    
    if (!apiKey) {
      throw new Meteor.Error('no-api-key', 'Ozwell is not enabled. Please add your API key in settings.');
    }
    
    try {
      const response = await fetch(`${OZWELL_CONFIG.baseUrl}/api/v1/test-credentials`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        }
      });
      
      if (response.ok) {
        // Update last connected time
        await Meteor.users.updateAsync(this.userId, {
          $set: {
            'profile.ozwellLastConnected': new Date()
          }
        });
        
        const data = await response.json();
        return {
          success: true,
          status: response.status,
          data: data
        };
      } else {
        const errorText = await response.text();
        return {
          success: false,
          status: response.status,
          error: errorText
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  },

  /**
   * Send a message to Ozwell AI and get response
   */
  async sendMessageToOzwell(message, context) {
    check(message, String);
    check(context, {
      fieldType: String,
      originalText: Match.Optional(String),
      teamId: Match.Optional(String),
      projectContext: Match.Optional(Object)
    });

    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'Must be logged in');
    }
    
    // Get user's API key
    const user = await Meteor.users.findOneAsync(this.userId);
    const apiKey = user?.profile?.ozwellApiKey;
    
    if (!apiKey) {
      throw new Meteor.Error('ozwell-not-enabled', 'Ozwell is not enabled. Please add your API key in Settings.');
    }

    try {
      // Build context for Ozwell
      const ozwellContext = {
        fieldType: context.fieldType,
        originalText: context.originalText || '',
        projectType: 'time_tracking',
        domain: 'productivity',
        userIntent: message,
        examples: {
          activity_title: ['Fix Login Bug', 'Team Meeting - Sprint Planning', 'Research Database Optimization'],
          activity_notes: ['Completed initial research and documented findings', 'Made progress on feature with testing', 'Reviewed requirements and updated priorities']
        }
      };

      // Call Ozwell API
      const response = await fetch(`${OZWELL_CONFIG.baseUrl}/api/v1/chat/completion`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          message: message,
          context: ozwellContext,
          maxSuggestions: 3,
          format: 'suggestions'
        })
      });

      if (response.ok) {
        const data = await response.json();
        console.log('✅ Real Ozwell API response:', data);
        return {
          success: true,
          suggestions: data.suggestions || [],
          response: data.response || 'Here are some suggestions based on your request.'
        };
      } else {
        console.log(`API error ${response.status}, falling back to mock`);
        // Fall back to mock if API fails
        return this.generateMockResponse(message, context);
      }
    } catch (error) {
      console.log(`Connection error, falling back to mock:`, error.message);
      // Fall back to mock if connection fails
      return this.generateMockResponse(message, context);
    }
  },
  
  /**
   * Generate mock response (fallback)
   */
  generateMockResponse(message, context) {
    const msg = message.toLowerCase();
    const fieldType = context.fieldType;
    
    // Intelligent mock responses based on message analysis
    if (msg.includes('testing') || msg.includes('test')) {
      if (fieldType === 'activity_title') {
        return {
          success: true,
          suggestions: ['Mock UI Testing', 'Testing Application Features', 'Quality Assurance Testing'],
          response: 'Great! Here are some testing-focused titles:'
        };
      } else {
        return {
          success: true,
          suggestions: ['Creating and testing UI mockups', 'Validating user interface components', 'Mock data testing for UI elements'],
          response: 'Here are some testing-related descriptions:'
        };
      }
    }
    
    if (msg.includes('ticket') || msg.includes('open')) {
      if (fieldType === 'activity_title') {
        return {
          success: true,
          suggestions: ['Create UI Testing Ticket', 'New Mock Testing Task', 'Testing Work Item'],
          response: 'Here are some ticket-oriented titles:'
        };
      } else {
        return {
          success: true,
          suggestions: ['Creating ticket for UI testing work', 'Opening task for mock testing', 'Tracking testing progress'],
          response: 'Here are descriptions for ticket creation:'
        };
      }
    }
    
    if (msg.includes('shorten') || msg.includes('shorter')) {
      if (fieldType === 'activity_title') {
        return {
          success: true,
          suggestions: ['UI Testing', 'Mock Testing', 'QA Work'],
          response: 'Here are shorter, more concise titles:'
        };
      } else {
        return {
          success: true,
          suggestions: ['Testing UI components', 'Mock UI validation', 'Interface testing'],
          response: 'Here are shorter descriptions:'
        };
      }
    }
    
    // Default response
    if (fieldType === 'activity_title') {
      return {
        success: true,
        suggestions: ['Working on New Feature', 'Development Task', 'Project Work'],
        response: 'Here are some general title suggestions:'
      };
    } else {
      return {
        success: true,
        suggestions: ['Working on project development', 'Making progress on new features', 'Continuing development work'],
        response: 'Here are some general descriptions:'
      };
    }
  },

  /**
   * Get Ozwell configuration (client-safe)
   */
  async getOzwellConfig() {
    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'Must be logged in');
    }

    return {
      baseUrl: OZWELL_CONFIG.baseUrl,
      endpoints: OZWELL_CONFIG.endpoints,
      hasApiKey: !!OZWELL_CONFIG.apiKey
    };
  },

  /**
   * Create Ozwell workspace for a project (mock implementation)
   */
  async createOzwellWorkspace(projectId, projectName) {
    check(projectId, String);
    check(projectName, String);

    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'Must be logged in');
    }

    // Mock implementation to avoid API token issues
    // In production, uncomment the real API call below
    const mockWorkspaceId = `workspace_${projectId}_${Date.now()}`;
    console.log(`Mock: Created Ozwell workspace ${mockWorkspaceId} for project ${projectName}`);
    return mockWorkspaceId;
  },

  /**
   * Create Ozwell user in workspace (mock implementation)
   */
  async createOzwellUser(workspaceId) {
    check(workspaceId, String);

    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'Must be logged in');
    }

    // Mock implementation
    const mockUserId = `user_${this.userId}_${Date.now()}`;
    console.log(`Mock: Created Ozwell user ${mockUserId} in workspace ${workspaceId}`);
    return mockUserId;
  },

  /**
   * Create Ozwell user session using user's API key
   */
  async createOzwellUserSession(workspaceId, userId, forceNew = false) {
    check(workspaceId, String);
    check(userId, String);
    check(forceNew, Boolean);

    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'Must be logged in');
    }
    
    // Get user's API key
    const user = await Meteor.users.findOneAsync(this.userId);
    const apiKey = user?.profile?.ozwellApiKey;
    
    if (!apiKey) {
      throw new Meteor.Error('ozwell-not-enabled', 'Ozwell is not enabled. Please add your API key in Settings.');
    }

    try {
      // Try to create real session with user's API key
      const response = await fetch(`${OZWELL_CONFIG.baseUrl}/api/v1/workspaces/${workspaceId}/create-user-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          userId: userId,
          forceNew: forceNew
        })
      });

      if (response.ok) {
        const data = await response.json();
        console.log(`Real Ozwell session created for user ${userId} in workspace ${workspaceId}`);
        return data;
      } else {
        console.log(`API error ${response.status}, falling back to mock`);
        // Fall back to mock if API fails
        return this.createMockOzwellSession(workspaceId, userId);
      }
    } catch (error) {
      console.log(`Connection error, falling back to mock:`, error.message);
      // Fall back to mock if connection fails
      return this.createMockOzwellSession(workspaceId, userId);
    }
  },
  
  /**
   * Create mock Ozwell session (fallback)
   */
  createMockOzwellSession(workspaceId, userId) {
    const mockSession = {
      loginUrl: 'https://demo.bluehive.com/ozwell-demo',
      loginToken: `token_${Date.now()}`,
      userId: userId
    };
    
    console.log(`Mock: Created Ozwell session for user ${userId} in workspace ${workspaceId}`);
    return mockSession;
  },

  /**
   * Save or update a conversation for project-scoped AI context
   * @param {Object} conversationData - Contains projectId, messages, and metadata
   */
  async saveOzwellConversation(conversationData) {
    check(conversationData, {
      projectId: String,
      messages: [Object], // Array of messages following MCP MessageSchema
      workspaceId: Match.Optional(String),
      sessionId: Match.Optional(String),
      lastActivity: Date,
      context: Match.Optional(Object)
    });

    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'Must be logged in to save conversations');
    }

    // Verify user has access to the project/team
    const team = await Teams.findOneAsync({
      _id: conversationData.projectId,
      members: this.userId
    });

    if (!team) {
      throw new Meteor.Error('not-authorized', 'User does not have access to this project');
    }

    // Update or insert conversation
    const existingConversation = await OzwellConversations.findOneAsync({
      projectId: conversationData.projectId,
      userId: this.userId
    });

    const conversationDoc = {
      ...conversationData,
      userId: this.userId,
      updatedAt: new Date()
    };

    if (existingConversation) {
      await OzwellConversations.updateAsync(existingConversation._id, {
        $set: conversationDoc
      });
      return existingConversation._id;
    } else {
      conversationDoc.createdAt = new Date();
      return await OzwellConversations.insertAsync(conversationDoc);
    }
  },

  /**
   * Get conversation history for a project
   * @param {String} projectId - The project/team ID
   */
  async getOzwellConversation(projectId) {
    check(projectId, String);

    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'Must be logged in');
    }

    // Verify user has access to the project/team
    const team = await Teams.findOneAsync({
      _id: projectId,
      members: this.userId
    });

    if (!team) {
      throw new Meteor.Error('not-authorized', 'User does not have access to this project');
    }

    return await OzwellConversations.findOneAsync({
      projectId: projectId,
      userId: this.userId
    });
  },

  /**
   * Search user's activity history for AI context
   * @param {String} query - Search query
   * @param {Number} limit - Maximum results to return
   */
  async searchMyHistory(query, limit = 10) {
    check(query, String);
    check(limit, Number);

    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'Must be logged in');
    }

    // Search user's tickets and activities
    const searchRegex = new RegExp(query, 'i');
    
    const tickets = await Tickets.find({
      userId: this.userId,
      $or: [
        { title: searchRegex },
        { description: searchRegex }
      ]
    }, {
      limit: limit,
      sort: { createdAt: -1 }
    }).fetchAsync();

    const activities = await ClockEvents.find({
      userId: this.userId,
      $or: [
        { title: searchRegex },
        { description: searchRegex }
      ]
    }, {
      limit: limit,
      sort: { startTime: -1 }
    }).fetchAsync();

    return { tickets, activities };
  },

  /**
   * Search user's complete history across all projects for AI context
   * @param {String} query - Search query (optional)
   * @param {Number} limit - Maximum results to return
   */
  async searchUserHistory(query = '', limit = 10) {
    check(query, String);
    check(limit, Number);

    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'Must be logged in');
    }

    // Get all teams the user is a member of
    const userTeams = await Teams.find({
      members: this.userId
    }).fetchAsync();

    const teamIds = userTeams.map(team => team._id);

    const searchConditions = { teamId: { $in: teamIds } };
    
    if (query) {
      const searchRegex = new RegExp(query, 'i');
      searchConditions.$or = [
        { title: searchRegex },
        { description: searchRegex },
        { github: searchRegex }
      ];
    }

    // Search tickets across all user's teams
    const tickets = await Tickets.find(searchConditions, {
      limit: limit,
      sort: { createdAt: -1 },
      fields: {
        title: 1,
        description: 1,
        github: 1,
        teamId: 1,
        createdAt: 1,
        accumulatedTime: 1
      }
    }).fetchAsync();

    // Get clock events (activities) for the user
    const activities = await ClockEvents.find({
      userId: this.userId
    }, {
      limit: limit,
      sort: { startTime: -1 },
      fields: {
        teamId: 1,
        startTime: 1,
        endTime: 1,
        tickets: 1
      }
    }).fetchAsync();

    // Enrich with team names
    const enrichedTickets = tickets.map(ticket => {
      const team = userTeams.find(t => t._id === ticket.teamId);
      return {
        ...ticket,
        teamName: team?.name || 'Unknown Team'
      };
    });

    const enrichedActivities = activities.map(activity => {
      const team = userTeams.find(t => t._id === activity.teamId);
      return {
        ...activity,
        teamName: team?.name || 'Unknown Team'
      };
    });

    return { tickets: enrichedTickets, activities: enrichedActivities };
  },

  /**
   * Search project history for AI context
   * @param {String} projectId - The project/team ID
   * @param {String} query - Search query (optional)
   * @param {Number} limit - Maximum results to return
   */
  async searchProjectHistory(projectId, query = '', limit = 10) {
    check(projectId, String);
    check(query, String);
    check(limit, Number);

    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'Must be logged in');
    }

    // Verify user has access to the project/team
    const team = await Teams.findOneAsync({
      _id: projectId,
      members: this.userId
    });

    if (!team) {
      throw new Meteor.Error('not-authorized', 'User does not have access to this project');
    }

    const searchConditions = { teamId: projectId };
    
    if (query) {
      const searchRegex = new RegExp(query, 'i');
      searchConditions.$or = [
        { title: searchRegex },
        { description: searchRegex }
      ];
    }

    const tickets = await Tickets.find(searchConditions, {
      limit: limit,
      sort: { createdAt: -1 }
    }).fetchAsync();

    const activities = await ClockEvents.find({
      ...searchConditions,
      teamId: projectId
    }, {
      limit: limit,
      sort: { startTime: -1 }
    }).fetchAsync();

    return { tickets, activities };
  },

  /**
   * Get current page context for AI assistance
   * @param {String} pageType - Type of page (e.g., 'ticket_form', 'dashboard')
   * @param {Object} pageData - Additional page-specific data
   */
  async getPageContext(pageType, pageData = {}) {
    check(pageType, String);
    check(pageData, Object);

    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'Must be logged in');
    }

    const context = {
      pageType,
      userId: this.userId,
      timestamp: new Date(),
      ...pageData
    };

    // Add page-specific context
    switch (pageType) {
      case 'ticket_form':
        // Add current team/project context
        if (pageData.teamId) {
          const team = await Teams.findOneAsync({
            _id: pageData.teamId,
            members: this.userId
          });
          if (team) {
            context.teamName = team.name;
            context.teamCode = team.code;
          }
        }
        break;
        
      case 'dashboard':
        // Add recent activity summary
        const recentActivities = await ClockEvents.find({
          userId: this.userId
        }, {
          limit: 5,
          sort: { startTime: -1 }
        }).fetchAsync();
        context.recentActivities = recentActivities;
        break;
    }

    return context;
  }
};

// Methods are registered in server/main.js