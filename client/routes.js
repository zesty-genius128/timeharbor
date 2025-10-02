import { FlowRouter } from 'meteor/ostrio:flow-router-extra';

// Import the current screen management for gradual migration
import { currentScreen } from './components/auth/AuthPage.js';

// Create a reactive var to store the current route template
import { ReactiveVar } from 'meteor/reactive-var';
export const currentRouteTemplate = new ReactiveVar(null);

/**
 * GRADUAL MIGRATION PLAN:
 * ✅ Phase 1: Home route (/) - COMPLETED
 * ✅ Phase 2: Teams route (/teams) - COMPLETED
 * ✅ Phase 3: Tickets route (/tickets) - COMPLETED
 * ✅ Phase 4: Calendar route (/calendar) - COMPLETED
 * 🔄 Phase 5: Admin route (/admin) - FINAL PHASE
 */

// Note: ostrio:flow-router-extra doesn't use FlowRouter.configure()
// Configuration is handled differently in this package

// =============================================================================
// PHASE 1: HOME PAGE ROUTE ONLY
// =============================================================================

/**
 * Home page route - Root path
 * This replaces the manual template switching for home page only
 */
FlowRouter.route('/', {
  name: 'home',
  action(params, queryParams) {
    // Check authentication first
    if (!Meteor.userId()) {
      // User not logged in - redirect to auth page
      currentScreen.set('authPage');
      return;
    }
    
    // User is logged in - show main layout with home template
    currentScreen.set('mainLayout');
    // Set the template for Flow Router managed routes
    currentRouteTemplate.set('home');
  }
});

// =============================================================================
// PHASE 2: TEAMS PAGE ROUTE
// =============================================================================

/**
 * Teams page route - /teams
 * This replaces the manual template switching for teams page
 */
FlowRouter.route('/teams', {
  name: 'teams',
  action(params, queryParams) {
    // Check authentication first
    if (!Meteor.userId()) {
      // User not logged in - redirect to auth page
      currentScreen.set('authPage');
      return;
    }
    
    // User is logged in - show main layout with teams template
    currentScreen.set('mainLayout');
    // Set the template for Flow Router managed routes
    currentRouteTemplate.set('teams');
  }
});

// =============================================================================
// PHASE 3: TICKETS PAGE ROUTE
// =============================================================================

/**
 * Tickets page route - /tickets
 * This replaces the manual template switching for tickets page
 */
FlowRouter.route('/tickets', {
  name: 'tickets',
  action(params, queryParams) {
    // Check authentication first
    if (!Meteor.userId()) {
      // User not logged in - redirect to auth page
      currentScreen.set('authPage');
      return;
    }
    
    // User is logged in - show main layout with tickets template
    currentScreen.set('mainLayout');
    // Set the template for Flow Router managed routes
    currentRouteTemplate.set('tickets');
  }
});

// =============================================================================
// PHASE 4: CALENDAR PAGE ROUTE
// =============================================================================

/**
 * Calendar page route - /calendar
 * This replaces the manual template switching for calendar page
 */
FlowRouter.route('/calendar', {
  name: 'calendar',
  action(params, queryParams) {
    // Check authentication first
    if (!Meteor.userId()) {
      // User not logged in - redirect to auth page
      currentScreen.set('authPage');
      return;
    }
    
    // User is logged in - show main layout with calendar template
    currentScreen.set('mainLayout');
    // Set the template for Flow Router managed routes
    currentRouteTemplate.set('calendar');
  }
});

// =============================================================================
// FALLBACK FOR NON-MIGRATED ROUTES
// =============================================================================

/**
 * Temporary fallback for routes not yet migrated
 * This ensures existing navigation still works during gradual migration
 */
FlowRouter.route('*', {
  name: 'notFound',
  action() {
    // For now, if route not found, check if user is logged in
    if (!Meteor.userId()) {
      currentScreen.set('authPage');
    } else {
      // Default to home page for unknown routes during migration
      currentScreen.set('mainLayout');
      currentRouteTemplate.set('home');
    }
  }
});

// =============================================================================
// UTILITY FUNCTIONS FOR GRADUAL MIGRATION
// =============================================================================

/**
 * Helper function to check if current route is handled by Flow Router
 * This helps during the gradual migration process
 */
export const isRouteHandledByFlowRouter = () => {
  const currentRoute = FlowRouter.getRouteName();
  return currentRoute === 'home' || currentRoute === 'teams' || currentRoute === 'tickets' || currentRoute === 'calendar';
};

/**
 * Helper function to navigate programmatically
 * Use this instead of setting currentTemplate directly for migrated routes
 */
export const navigateToRoute = (routeName, params = {}) => {
  if (routeName === 'home') {
    FlowRouter.go('/', params);
  } else if (routeName === 'teams') {
    FlowRouter.go('/teams', params);
  } else if (routeName === 'tickets') {
    FlowRouter.go('/tickets', params);
  } else if (routeName === 'calendar') {
    FlowRouter.go('/calendar', params);
  } else {
    // For non-migrated routes, fall back to old system
    console.log(`Route '${routeName}' not yet migrated to Flow Router`);
    return false;
  }
  return true;
};

console.log('✅ Flow Router configured - Phase 4: Home, Teams, Tickets, and Calendar routes');
