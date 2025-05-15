import { Meteor } from 'meteor/meteor';
import { Mongo } from 'meteor/mongo';
import { countAsync } from 'meteor/mongo';
import { Accounts } from 'meteor/accounts-base';
import { check } from 'meteor/check';
import { Tickets, Teams, Sessions, ClockEvents } from '../collections.js';

function generateTeamCode() {
  // Simple random code, can be improved for production
  return Math.random().toString(36).substr(2, 8).toUpperCase();
}

Meteor.startup(async () => {
  // Code to run on server startup
  if (await Tickets.find().countAsync() === 0) {
    await Tickets.insertAsync({ title: 'Sample Ticket', description: 'This is a sample ticket.', createdAt: new Date() });
  }

  if (await Teams.find().countAsync() === 0) {
    await Teams.insertAsync({ name: 'Sample Team', createdAt: new Date() });
  }

  if (await Sessions.find().countAsync() === 0) {
    await Sessions.insertAsync({ userId: 'sampleUser', startTime: new Date(), endTime: null });
  }

  // Add a code to any existing teams that do not have one
  const teamsWithoutCode = await Teams.find({ code: { $exists: false } }).fetchAsync();
  for (const team of teamsWithoutCode) {
    const code = generateTeamCode();
    await Teams.updateAsync(team._id, { $set: { code } });
  }
});

Meteor.publish('userTeams', function () {
  return Teams.find({ members: this.userId });
});

Meteor.publish('teamDetails', function (teamId) {
  return Teams.find({ _id: teamId });
});

Meteor.publish('teamMembers', function (teamIds) {
  check(teamIds, [String]);
  const teams = Teams.find({ _id: { $in: teamIds } }).fetch();
  const userIds = Array.from(new Set(teams.flatMap(team => team.members)));
  return Meteor.users.find({ _id: { $in: userIds } }, { fields: { username: 1 } });
});

Meteor.publish('teamTickets', function (teamId) {
  check(teamId, String);
  return Tickets.find({ teamId });
});

Meteor.publish('clockEventsForUser', function () {
  if (!this.userId) return this.ready();
  return ClockEvents.find({ userId: this.userId });
});

Meteor.methods({
  async joinTeamWithCode(teamCode) {
    check(teamCode, String);
    if (!this.userId) {
      throw new Meteor.Error('not-authorized');
    }
    const team = await Teams.findOneAsync({ code: teamCode });
    if (!team) {
      throw new Meteor.Error('not-found', 'Team not found');
    }
    if (team.members.includes(this.userId)) {
      throw new Meteor.Error('already-member', 'You are already a member of this team');
    }
    await Teams.updateAsync(team._id, { $push: { members: this.userId } });
    return team._id;
  },
  'participants.create'(name) {
    check(name, String);
    // Logic to create a participant account
    console.log(`Creating participant with name: ${name}`);
    Accounts.createUser({ username: name });
  },
  async createTeam(teamName) {
    check(teamName, String);
    if (!this.userId) {
      throw new Meteor.Error('not-authorized');
    }
    const code = generateTeamCode();
    const teamId = await Teams.insertAsync({
      name: teamName,
      members: [this.userId],
      admins: [this.userId],
      leader: this.userId,
      code,
      createdAt: new Date(),
    });
    return teamId;
  },
  createUserAccount({ username, password }) {
    if (!username || !password) {
      throw new Meteor.Error('invalid-data', 'Username and password are required');
    }

    try {
      const userId = Accounts.createUser({ username, password });
      console.log('User created:', { userId, username }); // Log user creation details
      return userId;
    } catch (error) {
      console.error('Error in createUserAccount method:', error);
      throw new Meteor.Error('server-error', 'Failed to create user');
    }
  },
  async getUsers(userIds) {
    check(userIds, [String]);
    const users = await Meteor.users.find({ _id: { $in: userIds } }).fetchAsync();
    return users.map(user => ({ id: user._id, username: user.username }));
  },
  async createTicket({ teamId, title, github, accumulatedTime }) {
    check(teamId, String);
    check(title, String);
    check(github, String);
    check(accumulatedTime, Number);
    if (!this.userId) throw new Meteor.Error('not-authorized');
    return await Tickets.insertAsync({
      teamId,
      title,
      github,
      accumulatedTime,
      createdBy: this.userId,
      createdAt: new Date(),
    });
  },
  incrementTicketTime(ticketId, seconds) {
    check(ticketId, String);
    check(seconds, Number);
    Tickets.update(ticketId, { $inc: { timeSpent: seconds } });
  },
  updateTicketStart(ticketId, now) {
    check(ticketId, String);
    check(now, Number);
    if (!this.userId) throw new Meteor.Error('not-authorized');
    return Tickets.updateAsync(ticketId, { $set: { startTimestamp: now } });
  },
  updateTicketStop(ticketId, now) {
    check(ticketId, String);
    check(now, Number);
    if (!this.userId) throw new Meteor.Error('not-authorized');
    return Tickets.findOneAsync(ticketId).then(ticket => {
      if (ticket && ticket.startTimestamp) {
        const elapsed = Math.floor((now - ticket.startTimestamp) / 1000);
        const prev = ticket.accumulatedTime || 0;
        return Tickets.updateAsync(ticketId, {
          $set: { accumulatedTime: prev + elapsed },
          $unset: { startTimestamp: '' }
        });
      }
    });
  },
  async clockEventStart(teamId) {
    check(teamId, String);
    if (!this.userId) throw new Meteor.Error('not-authorized');
    // End any previous open clock event for this user/team
    await ClockEvents.updateAsync({ userId: this.userId, teamId, endTime: null }, { $set: { endTime: new Date() } }, { multi: true });
    // Start a new clock event
    const clockEventId = await ClockEvents.insertAsync({
      userId: this.userId,
      teamId,
      startTimestamp: Date.now(),
      accumulatedTime: 0,
      endTime: null
    });
    return clockEventId;
  },
  async clockEventStop(teamId) {
    check(teamId, String);
    if (!this.userId) throw new Meteor.Error('not-authorized');
    const clockEvent = await ClockEvents.findOneAsync({ userId: this.userId, teamId, endTime: null });
    if (clockEvent && clockEvent.startTimestamp) {
      const now = Date.now();
      const elapsed = Math.floor((now - clockEvent.startTimestamp) / 1000);
      const prev = clockEvent.accumulatedTime || 0;
      await ClockEvents.updateAsync(clockEvent._id, {
        $set: { accumulatedTime: prev + elapsed, endTime: new Date() },
        $unset: { startTimestamp: '' }
      });
    }
  },
  async clockEventAddTicket(clockEventId, ticketId, now) {
    check(clockEventId, String);
    check(ticketId, String);
    check(now, Number);
    if (!this.userId) throw new Meteor.Error('not-authorized');
    // Check if ticket entry already exists in the clock event
    const clockEvent = await ClockEvents.findOneAsync(clockEventId);
    if (!clockEvent) return;
    const existing = (clockEvent.tickets || []).find(t => t.ticketId === ticketId);
    if (existing) {
      // If already exists and is stopped, start it again by setting startTimestamp
      await ClockEvents.updateAsync(
        { _id: clockEventId, 'tickets.ticketId': ticketId },
        { $set: { 'tickets.$.startTimestamp': now } }
      );
    } else {
      // Otherwise, add a new ticket entry
      await ClockEvents.updateAsync(clockEventId, {
        $push: {
          tickets: {
            ticketId,
            startTimestamp: now,
            accumulatedTime: 0
          }
        }
      });
    }
  },
  async clockEventStopTicket(clockEventId, ticketId, now) {
    check(clockEventId, String);
    check(ticketId, String);
    check(now, Number);
    if (!this.userId) throw new Meteor.Error('not-authorized');
    const clockEvent = await ClockEvents.findOneAsync(clockEventId);
    if (!clockEvent || !clockEvent.tickets) return;
    const ticketEntry = clockEvent.tickets.find(t => t.ticketId === ticketId && t.startTimestamp);
    if (ticketEntry) {
      const elapsed = Math.floor((now - ticketEntry.startTimestamp) / 1000);
      const prev = ticketEntry.accumulatedTime || 0;
      // Update the ticket entry in the tickets array
      await ClockEvents.updateAsync(
        { _id: clockEventId, 'tickets.ticketId': ticketId },
        {
          $set: {
            'tickets.$.accumulatedTime': prev + elapsed
          },
          $unset: {
            'tickets.$.startTimestamp': ''
          }
        }
      );
    }
  },
});
