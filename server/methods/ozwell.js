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
   * Create Ozwell user session (mock implementation)
   */
  async createOzwellUserSession(workspaceId, userId, forceNew = false) {
    check(workspaceId, String);
    check(userId, String);
    check(forceNew, Boolean);

    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'Must be logged in');
    }

    // Mock implementation - return a demo URL that won't cause CORS issues
    const mockSession = {
      loginUrl: 'https://demo.bluehive.com/ozwell-demo',
      loginToken: `token_${Date.now()}`,
      userId: userId
    };
    
    console.log(`Mock: Created Ozwell session for user ${userId} in workspace ${workspaceId}`);
    return mockSession;
  },

  /**
   * Save or update a conversation for field-specific AI context
   * @param {Object} conversationData - Contains projectId, contextType, fieldType, messages, and metadata
   */
  async saveOzwellConversation(conversationData) {
    check(conversationData, {
      projectId: String,
      contextType: String, // e.g., 'ticket_form', 'note_edit', etc.
      fieldType: String, // e.g., 'activity_title', 'activity_notes', etc.
      messages: [Object], // Array of messages following MCP MessageSchema
      workspaceId: Match.Optional(String),
      sessionId: Match.Optional(String),
      lastActivity: Date,
      context: Match.Optional(Object),
      relatedEntityId: Match.Optional(String), // e.g., specific ticket ID if editing existing ticket
      relatedEntityType: Match.Optional(String) // e.g., 'ticket', 'note', etc.
    });

    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'Must be logged in');
    }

    // Verify user has access to the project
    const team = await Teams.findOneAsync({
      _id: conversationData.projectId,
      members: this.userId
    });

    if (!team) {
      throw new Meteor.Error('not-authorized', 'User does not have access to this project');
    }

    // Find existing conversation for this specific field context
    const existingConversation = await OzwellConversations.findOneAsync({
      projectId: conversationData.projectId,
      contextType: conversationData.contextType,
      fieldType: conversationData.fieldType,
      userId: this.userId,
      relatedEntityId: conversationData.relatedEntityId || { $exists: false }
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
   * Get conversation history for a specific field context
   * @param {String} projectId - The project/team ID
   * @param {String} contextType - The context type (e.g., 'ticket_form')
   * @param {String} fieldType - The field type (e.g., 'activity_title')
   * @param {String} relatedEntityId - Optional: specific entity ID for existing items
   */
  async getOzwellConversation(projectId, contextType, fieldType, relatedEntityId = null) {
    check(projectId, String);
    check(contextType, String);
    check(fieldType, String);
    check(relatedEntityId, Match.Optional(String));

    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'Must be logged in');
    }

    // Verify user has access to the project
    const team = await Teams.findOneAsync({
      _id: projectId,
      members: this.userId
    });

    if (!team) {
      throw new Meteor.Error('not-authorized', 'User does not have access to this project');
    }

    const query = {
      projectId: projectId,
      contextType: contextType,
      fieldType: fieldType,
      userId: this.userId
    };

    // Add relatedEntityId to query if provided
    if (relatedEntityId) {
      query.relatedEntityId = relatedEntityId;
    } else {
      query.relatedEntityId = { $exists: false };
    }

    return await OzwellConversations.findOneAsync(query);
  },

  /**
   * Get all conversations for a project (for migration/debugging)
   * @param {String} projectId - The project/team ID
   */
  async getAllOzwellConversations(projectId) {
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
      throw new Meteor.Error('not-authorized', 'User does not have access to this project');
    }

    return await OzwellConversations.find({
      projectId: projectId,
      userId: this.userId
    }).fetchAsync();
  },

  /**
   * Migrate old conversation format to new field-specific format
   * This helps transition existing conversations to the new schema
   */
  async migrateOzwellConversations() {
    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'Must be logged in');
    }

    // Find old conversations without contextType/fieldType
    const oldConversations = await OzwellConversations.find({
      userId: this.userId,
      contextType: { $exists: false }
    }).fetchAsync();

    let migratedCount = 0;

    for (const conv of oldConversations) {
      // Update old conversations to have default context
      await OzwellConversations.updateAsync(conv._id, {
        $set: {
          contextType: 'general',
          fieldType: 'general',
          updatedAt: new Date()
        }
      });
      migratedCount++;
    }

    return {
      message: `Migrated ${migratedCount} conversations to new format`,
      migratedCount
    };
  },

  /**
   * Search conversations by field type for context building
   * @param {String} projectId - The project/team ID
   * @param {String} fieldType - The field type to search for
   * @param {Number} limit - Maximum results to return
   */
  async searchConversationsByField(projectId, fieldType, limit = 5) {
    check(projectId, String);
    check(fieldType, String);
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
      throw new Meteor.Error('not-authorized', 'User does not have access to this project');
    }

    return await OzwellConversations.find({
      projectId: projectId,
      fieldType: fieldType,
      userId: this.userId
    }, {
      sort: { updatedAt: -1 },
      limit: limit
    }).fetchAsync();
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