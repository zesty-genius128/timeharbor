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

    /* Real API implementation (uncomment when you have a valid API key):
    try {
      const response = await fetch(`${OZWELL_CONFIG.baseUrl}${OZWELL_CONFIG.endpoints.createWorkspace}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OZWELL_CONFIG.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: `TimeHarbor - ${projectName}`,
          metaData: {
            externalId: projectId,
            source: 'timeharbor',
            userId: this.userId
          }
        })
      });

      const data = await response.json();
      if (data.status === 200) {
        return data.workspaceId;
      } else {
        throw new Meteor.Error('ozwell-api-error', `Failed to create workspace: ${data.message || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error creating Ozwell workspace:', error);
      throw new Meteor.Error('ozwell-api-error', 'Failed to connect to Ozwell API');
    }
    */
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

    /* Real API implementation:
    try {
      const url = `${OZWELL_CONFIG.baseUrl}${OZWELL_CONFIG.endpoints.createUser.replace('{workspaceId}', workspaceId)}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OZWELL_CONFIG.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      });

      const data = await response.json();
      if (data.status === 200) {
        return data.userId;
      } else {
        throw new Meteor.Error('ozwell-api-error', `Failed to create user: ${data.message || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error creating Ozwell user:', error);
      throw new Meteor.Error('ozwell-api-error', 'Failed to connect to Ozwell API');
    }
    */
  },

  /**
   * Create Ozwell user session (mock implementation)
   */
  async createOzwellUserSession(workspaceId, userId, forceNew = false) {
    check(workspaceId, String);
    check(userId, String);
    check(forceNew, Boolean);

    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'Must be logged in');
    }

    // Mock implementation
    const mockLoginUrl = `https://demo.ozwell.ai/session?workspace=${workspaceId}&user=${userId}&demo=true`;
    const mockSession = {
      loginUrl: mockLoginUrl,
      loginToken: `token_${Date.now()}`,
      userId: userId
    };
    
    console.log(`Mock: Created Ozwell session for user ${userId} in workspace ${workspaceId}`);
    return mockSession;

    /* Real API implementation:
    try {
      const url = `${OZWELL_CONFIG.baseUrl}${OZWELL_CONFIG.endpoints.createUserSession.replace('{workspaceId}', workspaceId)}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OZWELL_CONFIG.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          userId: userId,
          metaData: {
            createListenSession: true,
            forceNewSession: forceNew,
            embedType: 'iframe-basic'
          }
        })
      });

      const data = await response.json();
      if (data.status === 200) {
        return {
          loginUrl: data.loginUrl,
          loginToken: data.loginToken,
          userId: data.userId
        };
      } else {
        throw new Meteor.Error('ozwell-api-error', `Failed to create session: ${data.message || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error creating Ozwell session:', error);
      throw new Meteor.Error('ozwell-api-error', 'Failed to connect to Ozwell API');
    }
    */
  },
  /**
   * Get Ozwell configuration for client (without exposing API key)
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
   * Create Ozwell workspace (server-side with API key)
   */
  async createOzwellWorkspace(projectId, projectName) {
    check(projectId, String);
    check(projectName, String);

    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'Must be logged in');
    }

    try {
      const response = await fetch(`${OZWELL_CONFIG.baseUrl}${OZWELL_CONFIG.endpoints.createWorkspace}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OZWELL_CONFIG.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: `TimeHarbor - ${projectName}`,
          metaData: {
            externalId: projectId,
            source: 'timeharbor',
            userId: this.userId
          }
        })
      });

      const data = await response.json();
      if (data.status === 200) {
        return data.workspaceId;
      } else {
        throw new Meteor.Error('ozwell-error', `Failed to create workspace: ${data.message || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error creating Ozwell workspace:', error);
      throw new Meteor.Error('ozwell-error', 'Failed to create workspace');
    }
  },

  /**
   * Create Ozwell user
   */
  async createOzwellUser(workspaceId) {
    check(workspaceId, String);

    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'Must be logged in');
    }

    try {
      const url = `${OZWELL_CONFIG.baseUrl}${OZWELL_CONFIG.endpoints.createUser.replace('{workspaceId}', workspaceId)}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OZWELL_CONFIG.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      });

      const data = await response.json();
      if (data.status === 200) {
        return data.userId;
      } else {
        throw new Meteor.Error('ozwell-error', `Failed to create user: ${data.message || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error creating Ozwell user:', error);
      throw new Meteor.Error('ozwell-error', 'Failed to create user');
    }
  },

  /**
   * Create Ozwell user session
   */
  async createOzwellUserSession(workspaceId, userId, forceNew = false) {
    check(workspaceId, String);
    check(userId, String);
    check(forceNew, Boolean);

    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'Must be logged in');
    }

    try {
      const url = `${OZWELL_CONFIG.baseUrl}${OZWELL_CONFIG.endpoints.createUserSession.replace('{workspaceId}', workspaceId)}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OZWELL_CONFIG.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          userId: userId,
          metaData: {
            createListenSession: true,
            forceNewSession: forceNew,
            embedType: 'iframe-basic'
          }
        })
      });

      const data = await response.json();
      if (data.status === 200) {
        return {
          loginUrl: data.loginUrl,
          loginToken: data.loginToken,
          userId: data.userId
        };
      } else {
        throw new Meteor.Error('ozwell-error', `Failed to create session: ${data.message || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error creating Ozwell session:', error);
      throw new Meteor.Error('ozwell-error', 'Failed to create session');
    }
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
      throw new Meteor.Error('not-authorized', 'You are not a member of this team');
    }

    // Find existing conversation or create new one
    const existingConversation = await OzwellConversations.findOneAsync({
      projectId: conversationData.projectId,
      userId: this.userId
    });

    const conversationDoc = {
      projectId: conversationData.projectId,
      userId: this.userId,
      messages: conversationData.messages,
      workspaceId: conversationData.workspaceId,
      sessionId: conversationData.sessionId,
      lastActivity: conversationData.lastActivity,
      context: conversationData.context || {},
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
   * @param {String} projectId - The team/project ID
   */
  async getOzwellConversation(projectId) {
    check(projectId, String);

    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'Must be logged in');
    }

    // Verify user has access to the project
    const team = await Teams.findOneAsync({ 
      _id: projectId, 
      members: this.userId 
    });
    
    if (!team) {
      throw new Meteor.Error('not-authorized', 'You are not a member of this team');
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

    // Get user's teams first
    const userTeams = await Teams.find({ members: this.userId }).fetchAsync();
    const teamIds = userTeams.map(team => team._id);

    // Search across user's tickets and clock events
    const searchRegex = new RegExp(query, 'i');
    
    const tickets = await Tickets.find({
      teamId: { $in: teamIds },
      $or: [
        { title: searchRegex },
        { github: searchRegex }
      ]
    }, { 
      limit: Math.floor(limit / 2),
      sort: { createdAt: -1 }
    }).fetchAsync();

    const clockEvents = await ClockEvents.find({
      userId: this.userId,
      teamId: { $in: teamIds }
    }, {
      limit: Math.floor(limit / 2),
      sort: { startTime: -1 }
    }).fetchAsync();

    return {
      tickets: tickets.map(ticket => ({
        type: 'ticket',
        id: ticket._id,
        title: ticket.title,
        reference: ticket.github,
        teamId: ticket.teamId,
        createdAt: ticket.createdAt
      })),
      activities: clockEvents.map(event => ({
        type: 'activity',
        id: event._id,
        ticketId: event.ticketId,
        teamId: event.teamId,
        startTime: event.startTime,
        endTime: event.endTime,
        duration: event.duration
      }))
    };
  },

  /**
   * Search project history for AI context
   * @param {String} projectId - The team/project ID
   * @param {String} query - Search query
   * @param {Number} limit - Maximum results to return
   */
  async searchProjectHistory(projectId, query, limit = 20) {
    check(projectId, String);
    check(query, String);
    check(limit, Number);

    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'Must be logged in');
    }

    // Verify user has access to the project
    const team = await Teams.findOneAsync({ 
      _id: projectId, 
      members: this.userId 
    });
    
    if (!team) {
      throw new Meteor.Error('not-authorized', 'You are not a member of this team');
    }

    const searchRegex = new RegExp(query, 'i');

    // Search project tickets
    const tickets = await Tickets.find({
      teamId: projectId,
      $or: [
        { title: searchRegex },
        { github: searchRegex }
      ]
    }, { 
      limit: Math.floor(limit / 2),
      sort: { createdAt: -1 }
    }).fetchAsync();

    // Search project activities
    const clockEvents = await ClockEvents.find({
      teamId: projectId
    }, {
      limit: Math.floor(limit / 2),
      sort: { startTime: -1 }
    }).fetchAsync();

    return {
      project: {
        id: team._id,
        name: team.name,
        code: team.code,
        memberCount: team.members ? team.members.length : 0
      },
      tickets: tickets.map(ticket => ({
        type: 'ticket',
        id: ticket._id,
        title: ticket.title,
        reference: ticket.github,
        createdAt: ticket.createdAt,
        totalTime: ticket.displayTime || 0
      })),
      activities: clockEvents.map(event => ({
        type: 'activity',
        id: event._id,
        ticketId: event.ticketId,
        startTime: event.startTime,
        endTime: event.endTime,
        duration: event.duration
      }))
    };
  },

  /**
   * Get current page context for AI
   * @param {String} pageType - Type of page (tickets, teams, etc.)
   * @param {Object} pageData - Current page data
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

    // Add specific context based on page type
    switch (pageType) {
      case 'tickets':
        if (pageData.teamId) {
          const team = await Teams.findOneAsync({ 
            _id: pageData.teamId, 
            members: this.userId 
          });
          if (team) {
            context.currentProject = {
              id: team._id,
              name: team.name,
              code: team.code
            };
          }
        }
        break;

      case 'ticket_form':
        context.formType = 'activity_creation';
        break;

      case 'teams':
        const userTeams = await Teams.find({ members: this.userId }).fetchAsync();
        context.availableProjects = userTeams.map(team => ({
          id: team._id,
          name: team.name,
          code: team.code
        }));
        break;
    }

    return context;
  }
};

// Register methods with Meteor
Meteor.methods(ozwellMethods);