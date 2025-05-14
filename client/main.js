import { Template } from 'meteor/templating';
import { ReactiveVar } from 'meteor/reactive-var';
import { Teams } from '../collections.js';

import './main.html';

// Reactive variable to track the current template
const currentTemplate = new ReactiveVar('home');

// Reactive variable to track the current screen
const currentScreen = new ReactiveVar('authPage');

Template.mainLayout.onCreated(function () {
  this.autorun(() => {
    if (Meteor.userId()) {
      currentScreen.set('mainLayout');
    } else {
      currentScreen.set('authPage'); // Redirect to auth screen if not logged in
    }
  });
});

Template.mainLayout.helpers({
  main() {
    return currentTemplate.get(); // Ensure it returns the current template
  },
});

Template.mainLayout.events({
  'click nav a'(event) {
    event.preventDefault();
    const target = event.currentTarget.getAttribute('href').substring(1);
    currentTemplate.set(target || 'home');
  },
});

Template.body.helpers({
  currentScreen() {
    return currentScreen.get();
  },
});

Template.authPage.events({
  'click #joinTeam'() {
    currentScreen.set('joinTeam');
  },
  'click #createParticipant'() {
    currentScreen.set('createParticipant');
  },
  'click #createTeam'() {
    currentScreen.set('createTeam');
  },
  'click #signup'(event) {
    event.preventDefault();

    // Switch to the signup form screen
    currentScreen.set('signupForm');
  },
  'click #login'(event) {
    event.preventDefault();

    // Switch to the login form screen
    currentScreen.set('loginForm');
  },
  'submit #signupForm'(event) {
    event.preventDefault();

    // Collect user input
    const username = event.target.username.value;
    const password = event.target.password.value;

    // Call server method to create a new user
    Meteor.call('createUserAccount', { username, password }, (err, result) => {
      if (err) {
        console.error('Error creating user:', err);
        alert('Failed to create user: ' + err.reason);
      } else {
        alert('User created successfully!');
        currentScreen.set('mainLayout');
      }
    });
  },
  'submit #loginForm'(event) {
    event.preventDefault();

    // Collect user input
    const username = event.target.username.value;
    const password = event.target.password.value;

    // Log in the user
    Meteor.loginWithPassword(username, password, (err) => {
      if (err) {
        console.error('Error logging in:', err);
        alert('Failed to log in: ' + err.reason);
      } else {
        alert('Logged in successfully!');
        currentScreen.set('mainLayout');
      }
    });
  },
});

Template.teams.onCreated(function () {
  this.showCreateTeam = new ReactiveVar(false);
  this.selectedTeamId = new ReactiveVar(null);
  this.selectedTeamUsers = new ReactiveVar([]);
  this.autorun(() => {
    this.subscribe('userTeams');
    const selectedId = this.selectedTeamId.get();
    if (selectedId) {
      this.subscribe('teamDetails', selectedId);
      const team = Teams.findOne(selectedId);
      if (team && team.members && team.members.length > 0) {
        Meteor.call('getUsers', team.members, (err, users) => {
          if (!err) {
            this.selectedTeamUsers.set(users);
          } else {
            this.selectedTeamUsers.set([]);
          }
        });
      } else {
        this.selectedTeamUsers.set([]);
      }
    } else {
      this.selectedTeamUsers.set([]);
    }
  });
});

Template.teams.helpers({
  showCreateTeam() {
    return Template.instance().showCreateTeam.get();
  },
  userTeams() {
    return Teams.find({ members: Meteor.userId() });
  },
  selectedTeam() {
    const id = Template.instance().selectedTeamId.get();
    const queriedTeam = id ? Teams.findOne(id) : null;
    if (!queriedTeam) return null;
    return {
      name: queriedTeam.name,
      code: queriedTeam.code,
      members: Template.instance().selectedTeamUsers.get(),
      admins: queriedTeam.admins,
      leader: queriedTeam.leader,
      createdAt: queriedTeam.createdAt,
    };
  },
});

Template.teams.events({
  'click #showCreateTeamForm'(e, t) {
    t.showCreateTeam.set(true);
  },
  'click #cancelCreateTeam'(e, t) {
    t.showCreateTeam.set(false);
  },
  'submit #createTeamForm'(e, t) {
    e.preventDefault();
    const teamName = e.target.teamName.value;
    Meteor.call('createTeam', teamName, (err) => {
      if (!err) {
        t.showCreateTeam.set(false);
      } else {
        alert('Error creating team: ' + err.reason);
      }
    });
  },
  'click .team-link'(e, t) {
    e.preventDefault();
    t.selectedTeamId.set(e.currentTarget.dataset.id);
  },
  'click #backToTeams'(e, t) {
    t.selectedTeamId.set(null);
    t.selectedTeamUsers.set([]); // Clear users when going back
  },
});
