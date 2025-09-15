import { Meteor } from 'meteor/meteor';
import { check } from 'meteor/check';
import { OzwellConversations, Tickets, Teams, ClockEvents } from '../../collections.js';

/**
 * Ozwell Prompt Library Methods
 * These methods provide pre-defined prompts for common tasks
 * as described in the Ozwell integration proposal
 */

export const promptLibraryMethods = {
  /**
   * Get prompt for helping with time entry descriptions
   * "Help me draft a time entry for my work today"
   */
  async getTimeEntryPrompt(teamId) {
    check(teamId, String);

    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'Must be logged in');
    }

    // Verify user has access to the team
    const team = await Teams.findOneAsync({ 
      _id: teamId, 
      members: this.userId 
    });
    
    if (!team) {
      throw new Meteor.Error('not-authorized', 'You are not a member of this team');
    }

    // Get today's activities
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todaysEvents = await ClockEvents.find({
      userId: this.userId,
      teamId: teamId,
      startTime: { $gte: today, $lt: tomorrow }
    }).fetchAsync();

    const tickets = await Tickets.find({ teamId }).fetchAsync();
    const ticketMap = {};
    tickets.forEach(ticket => {
      ticketMap[ticket._id] = ticket;
    });

    // Build context for the prompt
    const activitiesContext = todaysEvents.map(event => {
      const ticket = ticketMap[event.ticketId];
      const duration = event.duration || 0;
      
      return {
        activity: ticket?.title || 'Unknown Activity',
        duration: Math.round(duration / 60), // Convert to minutes
        reference: ticket?.github || '',
        startTime: event.startTime.toLocaleTimeString(),
        endTime: event.endTime ? event.endTime.toLocaleTimeString() : 'Ongoing'
      };
    });

    const totalTime = activitiesContext.reduce((sum, activity) => sum + activity.duration, 0);

    return {
      promptType: 'time_entry',
      template: `Please help me write a detailed time entry summary for my work today on the ${team.name} project. 

Today's Activities:
${activitiesContext.map(activity => 
  `- ${activity.activity} (${activity.duration} minutes, ${activity.startTime} - ${activity.endTime})${activity.reference ? ` [${activity.reference}]` : ''}`
).join('\n')}

Total time: ${totalTime} minutes

Please create a professional summary that:
1. Describes what I accomplished today
2. Highlights key activities and progress made
3. Mentions any challenges or blockers encountered
4. Includes relevant references or links
5. Uses clear, concise language suitable for time tracking

Context: This is for the ${team.name} project team.`,
      context: {
        projectName: team.name,
        projectCode: team.code,
        totalTimeMinutes: totalTime,
        activitiesCount: activitiesContext.length,
        activities: activitiesContext
      }
    };
  },

  /**
   * Get prompt for activity summarization
   * "Summarize my activity today"
   */
  async getDailySummaryPrompt(teamId, date = null) {
    check(teamId, String);
    check(date, Match.Optional(Date));

    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'Must be logged in');
    }

    const team = await Teams.findOneAsync({ 
      _id: teamId, 
      members: this.userId 
    });
    
    if (!team) {
      throw new Meteor.Error('not-authorized', 'You are not a member of this team');
    }

    // Default to today if no date provided
    const targetDate = date || new Date();
    targetDate.setHours(0, 0, 0, 0);
    const nextDay = new Date(targetDate);
    nextDay.setDate(nextDay.getDate() + 1);

    // Get all activities for the target date
    const events = await ClockEvents.find({
      userId: this.userId,
      teamId: teamId,
      startTime: { $gte: targetDate, $lt: nextDay }
    }).fetchAsync();

    const tickets = await Tickets.find({ teamId }).fetchAsync();
    const ticketMap = {};
    tickets.forEach(ticket => {
      ticketMap[ticket._id] = ticket;
    });

    const summary = events.map(event => {
      const ticket = ticketMap[event.ticketId];
      return {
        activity: ticket?.title || 'Unknown Activity',
        duration: Math.round((event.duration || 0) / 60),
        reference: ticket?.github || '',
        startTime: event.startTime.toLocaleTimeString(),
        endTime: event.endTime ? event.endTime.toLocaleTimeString() : 'Ongoing'
      };
    });

    const totalTime = summary.reduce((sum, activity) => sum + activity.duration, 0);

    return {
      promptType: 'daily_summary',
      template: `Please create a comprehensive summary of my work on ${targetDate.toDateString()} for the ${team.name} project.

Activities completed:
${summary.map(activity => 
  `- ${activity.activity}: ${activity.duration} minutes (${activity.startTime} - ${activity.endTime})${activity.reference ? ` [${activity.reference}]` : ''}`
).join('\n')}

Total productive time: ${totalTime} minutes

Please provide:
1. An executive summary of the day's accomplishments
2. Key insights or learnings from the work
3. Progress made toward project goals
4. Any roadblocks or challenges encountered
5. Recommendations for tomorrow's priorities
6. Overall productivity assessment

Format this as a professional daily report suitable for sharing with team members or stakeholders.`,
      context: {
        date: targetDate.toISOString(),
        projectName: team.name,
        totalTimeMinutes: totalTime,
        activitiesCount: summary.length,
        activities: summary
      }
    };
  },

  /**
   * Get prompt for cross-linking related work
   * "Cross-link related work"
   */
  async getCrossLinkPrompt(teamId, currentText = '') {
    check(teamId, String);
    check(currentText, String);

    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'Must be logged in');
    }

    const team = await Teams.findOneAsync({ 
      _id: teamId, 
      members: this.userId 
    });
    
    if (!team) {
      throw new Meteor.Error('not-authorized', 'You are not a member of this team');
    }

    // Get recent project activities and tickets
    const recentTickets = await Tickets.find({ 
      teamId 
    }, { 
      sort: { createdAt: -1 }, 
      limit: 20 
    }).fetchAsync();

    const recentEvents = await ClockEvents.find({ 
      teamId 
    }, { 
      sort: { startTime: -1 }, 
      limit: 20 
    }).fetchAsync();

    return {
      promptType: 'cross_link',
      template: `Please analyze the following text and suggest relevant connections to other work in the ${team.name} project:

Current text to analyze:
"${currentText}"

Available project activities and tickets:
${recentTickets.map(ticket => 
  `- ${ticket.title}${ticket.github ? ` [${ticket.github}]` : ''}`
).join('\n')}

Please:
1. Identify key topics, technologies, or concepts in the current text
2. Suggest relevant connections to existing project activities
3. Recommend specific tickets or references that relate to this work
4. Propose ways to link this work to the broader project context
5. Suggest any missing information or follow-up tasks

Provide your response as actionable suggestions for improving the documentation and connecting related work items.`,
      context: {
        projectName: team.name,
        ticketsCount: recentTickets.length,
        eventsCount: recentEvents.length,
        availableTickets: recentTickets.map(t => ({ id: t._id, title: t.title, reference: t.github }))
      }
    };
  },

  /**
   * Get prompt for activity title suggestions
   * "Help me create a better activity title"
   */
  async getActivityTitlePrompt(teamId, currentTitle = '', reference = '') {
    check(teamId, String);
    check(currentTitle, String);
    check(reference, String);

    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'Must be logged in');
    }

    const team = await Teams.findOneAsync({ 
      _id: teamId, 
      members: this.userId 
    });
    
    if (!team) {
      throw new Meteor.Error('not-authorized', 'You are not a member of this team');
    }

    // Get similar existing activities for context
    const existingTitles = await Tickets.find({ 
      teamId 
    }, { 
      fields: { title: 1, github: 1 },
      sort: { createdAt: -1 },
      limit: 10
    }).fetchAsync();

    return {
      promptType: 'activity_title',
      template: `Please help me create a clear, descriptive title for this activity in the ${team.name} project.

Current title: "${currentTitle}"
Reference/Link: ${reference}

Existing activity titles in this project for context:
${existingTitles.map(ticket => `- ${ticket.title}`).join('\n')}

Please suggest 3-5 alternative titles that are:
1. Clear and descriptive
2. Consistent with the project's naming conventions
3. Specific enough to distinguish from other activities
4. Professional and concise
5. Easy to search and filter

Consider the reference link/context and the existing project activities when making suggestions.`,
      context: {
        projectName: team.name,
        currentTitle,
        reference,
        existingTitles: existingTitles.map(t => t.title)
      }
    };
  },

  /**
   * Get available prompt templates
   */
  async getAvailablePrompts() {
    return [
      {
        id: 'time_entry',
        title: 'Help me draft a time entry for my work today',
        description: 'Creates a professional summary of daily activities for time tracking',
        icon: '📝',
        contextRequired: ['teamId']
      },
      {
        id: 'daily_summary',
        title: 'Summarize my activity today',
        description: 'Provides a comprehensive daily work summary and insights',
        icon: '📊',
        contextRequired: ['teamId']
      },
      {
        id: 'cross_link',
        title: 'Cross-link related work',
        description: 'Analyzes text and suggests connections to other project activities',
        icon: '🔗',
        contextRequired: ['teamId', 'currentText']
      },
      {
        id: 'activity_title',
        title: 'Help me create a better activity title',
        description: 'Suggests clear, descriptive titles for activities',
        icon: '🏷️',
        contextRequired: ['teamId']
      }
    ];
  }
};

// Register methods with Meteor
Meteor.methods(promptLibraryMethods);