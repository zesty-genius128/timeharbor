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

    // Calculate total time and organize by activity
    let totalMinutes = 0;
    const activities = [];

    todaysEvents.forEach(event => {
      const duration = event.endTime ? 
        (event.endTime.getTime() - event.startTime.getTime()) / (1000 * 60) : 0;
      totalMinutes += duration;

      const ticket = event.ticketId ? ticketMap[event.ticketId] : null;
      
      activities.push({
        title: event.title || ticket?.title || 'Untitled Activity',
        description: event.description || ticket?.description || '',
        duration: Math.round(duration),
        startTime: event.startTime,
        ticket: ticket
      });
    });

    const totalHours = Math.round(totalMinutes / 60 * 100) / 100;

    return {
      promptType: 'time_entry',
      teamName: team.name,
      date: today.toDateString(),
      totalHours: totalHours,
      activities: activities,
      generatedContent: this.generateTimeEntryText(activities, totalHours, team.name)
    };
  },

  /**
   * Get prompt for daily activity summary
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

    const targetDate = date || new Date();
    targetDate.setHours(0, 0, 0, 0);
    const nextDay = new Date(targetDate);
    nextDay.setDate(nextDay.getDate() + 1);

    const dayEvents = await ClockEvents.find({
      userId: this.userId,
      teamId: teamId,
      startTime: { $gte: targetDate, $lt: nextDay }
    }).fetchAsync();

    const tickets = await Tickets.find({ teamId }).fetchAsync();
    const ticketMap = {};
    tickets.forEach(ticket => {
      ticketMap[ticket._id] = ticket;
    });

    return {
      promptType: 'daily_summary',
      teamName: team.name,
      date: targetDate.toDateString(),
      events: dayEvents,
      tickets: ticketMap,
      generatedContent: this.generateDailySummary(dayEvents, ticketMap, team.name)
    };
  },

  /**
   * Get prompt for cross-linking related work
   * "Cross-link related work"
   */
  async getCrossLinkPrompt(teamId, currentText) {
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

    // Get recent project activities to find connections
    const recentTickets = await Tickets.find({ 
      teamId 
    }, { 
      limit: 20, 
      sort: { createdAt: -1 } 
    }).fetchAsync();

    const recentEvents = await ClockEvents.find({ 
      teamId 
    }, { 
      limit: 20, 
      sort: { startTime: -1 } 
    }).fetchAsync();

    return {
      promptType: 'cross_link',
      teamName: team.name,
      currentText: currentText,
      recentTickets: recentTickets,
      recentEvents: recentEvents,
      generatedContent: this.generateCrossLinks(currentText, recentTickets, recentEvents)
    };
  },

  /**
   * Get prompt for better activity titles
   * "Help me create a better activity title"
   */
  async getActivityTitlePrompt(teamId, currentTitle, reference = null) {
    check(teamId, String);
    check(currentTitle, String);
    check(reference, Match.Optional(String));

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

    // Get existing activities for naming patterns
    const existingTitles = await ClockEvents.find({ 
      teamId 
    }, { 
      fields: { title: 1 }, 
      limit: 50 
    }).fetchAsync();

    const ticketTitles = await Tickets.find({ 
      teamId 
    }, { 
      fields: { title: 1 }, 
      limit: 50 
    }).fetchAsync();

    return {
      promptType: 'activity_title',
      teamName: team.name,
      currentTitle: currentTitle,
      reference: reference,
      existingTitles: existingTitles.map(e => e.title),
      ticketTitles: ticketTitles.map(t => t.title),
      generatedContent: this.generateBetterTitle(currentTitle, existingTitles, ticketTitles)
    };
  },

  // Helper methods for generating content
  generateTimeEntryText(activities, totalHours, teamName) {
    if (activities.length === 0) {
      return `No activities recorded today for ${teamName}.`;
    }

    let text = `Daily Time Entry - ${teamName} (${totalHours} hours total)\n\n`;
    
    activities.forEach(activity => {
      const hours = Math.round(activity.duration / 60 * 100) / 100;
      text += `• ${activity.title} (${hours}h)`;
      if (activity.description) {
        text += `: ${activity.description}`;
      }
      text += '\n';
    });

    return text;
  },

  generateDailySummary(events, ticketMap, teamName) {
    if (events.length === 0) {
      return `No activity recorded today for ${teamName}.`;
    }

    let summary = `Daily Summary - ${teamName}\n\n`;
    summary += `Total activities: ${events.length}\n`;

    const uniqueTickets = new Set();
    events.forEach(event => {
      if (event.ticketId) uniqueTickets.add(event.ticketId);
    });

    if (uniqueTickets.size > 0) {
      summary += `Tickets worked on: ${uniqueTickets.size}\n`;
    }

    summary += '\nKey activities:\n';
    events.slice(0, 5).forEach(event => {
      const ticket = event.ticketId ? ticketMap[event.ticketId] : null;
      summary += `• ${event.title || ticket?.title || 'Untitled'}\n`;
    });

    return summary;
  },

  generateCrossLinks(currentText, tickets, events) {
    // Simple keyword matching for demonstration
    const keywords = currentText.toLowerCase().split(/\s+/);
    const suggestions = [];

    tickets.forEach(ticket => {
      const titleWords = ticket.title.toLowerCase().split(/\s+/);
      const hasMatch = keywords.some(keyword => 
        titleWords.some(word => word.includes(keyword) && keyword.length > 2)
      );
      
      if (hasMatch) {
        suggestions.push(`Related ticket: ${ticket.title}`);
      }
    });

    if (suggestions.length === 0) {
      suggestions.push('No direct connections found in recent project activities.');
    }

    return suggestions.slice(0, 5).join('\n');
  },

  generateBetterTitle(currentTitle, existingTitles, ticketTitles) {
    // Simple title improvement suggestions
    const suggestions = [];
    
    if (currentTitle.length < 10) {
      suggestions.push(`Consider adding more detail to "${currentTitle}"`);
    }
    
    if (!currentTitle.match(/^[A-Z]/)) {
      suggestions.push(`Capitalize the first letter: "${currentTitle.charAt(0).toUpperCase() + currentTitle.slice(1)}"`);
    }

    const words = currentTitle.toLowerCase().split(/\s+/);
    const commonPatterns = ['implement', 'fix', 'update', 'create', 'review'];
    
    if (!commonPatterns.some(pattern => words.includes(pattern))) {
      suggestions.push(`Consider starting with an action verb like: "Implement ${currentTitle}" or "Fix ${currentTitle}"`);
    }

    return suggestions.length > 0 ? suggestions.join('\n') : `"${currentTitle}" looks good!`;
  }
};

// Methods are registered in server/main.js