import { Template } from 'meteor/templating';
import { ReactiveVar } from 'meteor/reactive-var';
import { FlowRouter } from 'meteor/ostrio:flow-router-extra';
import { currentScreen } from '../auth/AuthPage.js';
import { isRouteHandledByFlowRouter, currentRouteTemplate } from '../../routes.js';

// Constants for better maintainability
const MESSAGE_TIMEOUT = 3000;
const ERROR_PREFIX = 'Logout failed: ';

// Logout state variables (local to MainLayout)
const isLogoutLoading = new ReactiveVar(false);
const logoutMessage = new ReactiveVar('');

// Reactive variable to track the current template
const currentTemplate = new ReactiveVar('home');

// Reactive variable to track current time for timers
export const currentTime = new ReactiveVar(Date.now());
setInterval(() => currentTime.set(Date.now()), 1000);

// Reactive variables to track subscription loading states
export const isTeamsLoading = new ReactiveVar(true);
export const isClockEventsLoading = new ReactiveVar(true);

/**
 * Handles the result of logout operation
 * @param {Error|null} error - Error object if logout failed
 */
const handleLogoutResult = (error) => {
  isLogoutLoading.set(false);
  
  if (error) {
    // Show error message and auto-clear after timeout
    logoutMessage.set(`${ERROR_PREFIX}${error.reason || error.message}`);
    setTimeout(() => logoutMessage.set(''), MESSAGE_TIMEOUT);
  } else {
    // Success - just redirect, no message needed
    currentScreen.set('authPage');
    currentTemplate.set('home');
  }
};

// Safety check for template
if (Template.mainLayout) {
  Template.mainLayout.onCreated(function () {
    this.autorun(() => {
      if (!Meteor.userId()) {
        currentScreen.set('authPage');
      } else {
        currentScreen.set('mainLayout');
        // Subscribe to common data when user is logged in
        const teamsHandle = this.subscribe('userTeams');
        const clockEventsHandle = this.subscribe('clockEventsForUser');
        
        // Update loading states
        isTeamsLoading.set(!teamsHandle.ready());
        isClockEventsLoading.set(!clockEventsHandle.ready());
      }
    });
  });

  Template.mainLayout.helpers({
    main() {
      // GRADUAL MIGRATION: Check if current route is handled by Flow Router
      if (isRouteHandledByFlowRouter()) {
        // Return the template set by Flow Router
        return currentRouteTemplate.get();
      }
      // Fall back to old system for non-migrated routes
      return currentTemplate.get();
    },
    currentUser() {
      return Meteor.user();
    },
    isLogoutLoading() {
      return isLogoutLoading.get();
    },
    logoutMessage() {
      return logoutMessage.get();
    },
    logoutBtnAttrs() {
      return isLogoutLoading.get() ? { disabled: true } : {};
    }
  });

  Template.mainLayout.events({
    'click nav a'(event) {
      event.preventDefault();
      const href = event.currentTarget.getAttribute('href');
      const target = href.substring(1);
      
      // GRADUAL MIGRATION: Check if this route is handled by Flow Router
      if (href === '/' || target === 'home' || target === '') {
        // Use Flow Router for home page
        FlowRouter.go('/');
      } else if (href === '/teams' || target === 'teams') {
        // Use Flow Router for teams page
        FlowRouter.go('/teams');
      } else {
        // Use old system for non-migrated routes
        currentTemplate.set(target || 'home');
      }
    },
    'click #logoutBtn'(event, instance) {
      event.preventDefault();
      
      // Early return if already loading or user cancels
      if (isLogoutLoading.get() || !confirm('Are you sure you want to log out?')) {
        return;
      }
      
      // Start logout process
      isLogoutLoading.set(true);
      Meteor.logout(handleLogoutResult);
    }
  });
}

Template.body.helpers({
  currentScreen() {
    return currentScreen.get();
  },
});