import { Meteor } from 'meteor/meteor';
import { Mongo } from 'meteor/mongo';
import { countAsync } from 'meteor/mongo';
import { Accounts } from 'meteor/accounts-base';

// Define collections
export const Tickets = new Mongo.Collection('tickets');
export const Teams = new Mongo.Collection('teams');
export const Sessions = new Mongo.Collection('sessions');

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
});

Meteor.methods({
  'teams.join'(teamCode) {
    check(teamCode, String);
    // Logic to add the user to the team with the given teamCode
    console.log(`User ${this.userId} is joining team with code: ${teamCode}`);
  },
  'participants.create'(name) {
    check(name, String);
    // Logic to create a participant account
    console.log(`Creating participant with name: ${name}`);
    Accounts.createUser({ username: name });
  },
  'teams.create'(teamName, ownerName) {
    check(teamName, String);
    check(ownerName, String);
    // Logic to create a team and assign the user as the owner
    console.log(`Creating team: ${teamName} with owner: ${ownerName}`);
    const userId = Accounts.createUser({ username: ownerName });
    Teams.insert({ name: teamName, ownerId: userId, createdAt: new Date() });
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
});
