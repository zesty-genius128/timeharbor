import { Template } from 'meteor/templating';
import { Teams, Tickets, ClockEvents } from '../../../collections.js';
import { currentTime } from '../layout/MainLayout.js';

Template.home.onCreated(function () {
  this.autorun(() => {
    this.subscribe('userTeams');
    this.subscribe('clockEventsForUser');
    // Subscribe to all clock events for teams the user leads
    const leaderTeams = Teams.find({ leader: Meteor.userId() }).fetch();
    const teamIds = leaderTeams.map(t => t._id);
    if (teamIds.length) {
      this.subscribe('clockEventsForTeams', teamIds);
      // Also subscribe to all tickets for these teams
      this.subscribe('teamTickets', teamIds);
    }
    // Subscribe to all users in those teams for username display
    const allMembers = Array.from(new Set(leaderTeams.flatMap(t => t.members)));
    if (allMembers.length) {
      this.subscribe('usersByIds', allMembers);
    }
  });
});

Template.home.helpers({
  leaderTeams() {
    return Teams.find({ leader: Meteor.userId() }).fetch();
  },
  teamClockEvents(teamId) {
    return ClockEvents.find({ teamId }).fetch();
  },
  allClockEvents() {
    // Show all clock events for teams the user leads, flat list, most recent first
    const leaderTeams = Teams.find({ leader: Meteor.userId() }).fetch();
    const teamIds = leaderTeams.map(t => t._id);
    return ClockEvents.find({ teamId: { $in: teamIds } }, { sort: { startTimestamp: -1 } }).fetch();
  },
  teamName(teamId) {
    const team = Teams.findOne(teamId);
    return team && team.name ? team.name : teamId;
  },
  userName(userId) {
    const user = Meteor.users && Meteor.users.findOne(userId);
    return user && user.username ? user.username : userId;
  },
  formatDate(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleString();
  },
  ticketTitle(ticketId) {
    const ticket = Tickets.findOne(ticketId);
    return ticket ? ticket.title : `Unknown Ticket (${ticketId})`;
  },
  clockEventTotalTime(clockEvent) {
    let total = clockEvent.accumulatedTime || 0;
    if (!clockEvent.endTime && clockEvent.startTimestamp) {
      const now = currentTime.get(); // Use reactive time source
      total += Math.max(0, Math.floor((now - clockEvent.startTimestamp) / 1000));
    }
    return total;
  },
  ticketTotalTime(ticket) {
    let total = ticket.accumulatedTime || 0;
    if (ticket.startTimestamp) {
      const now = currentTime.get(); // Use reactive time source
      total += Math.max(0, Math.floor((now - ticket.startTimestamp) / 1000));
    }
    return total;
  },
  formatTime(time) {
    const t = Number(time) || 0;
    const h = Math.floor(t / 3600);
    const m = Math.floor((t % 3600) / 60);
    const s = t % 60;
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  },
}); 