import { Teams } from '../../collections.js';

// Get all teams for the current user
export const getUserTeams = () => {
    return Teams.find({members: Meteor.userId()}).fetch();
};

// Get team name from team ID
export const getTeamName = (teamId) => {
    const team = Teams.findOne(teamId);
    return team?.name || teamId;
};

// Get user email from user ID
export const getUserEmail = (userId) => {
    const user = Meteor.users?.findOne(userId);
    
    // If no user found, check if it's the current user
    if (!user && userId === Meteor.userId()) {
        const currentUser = Meteor.user();
        return currentUser?.emails?.[0]?.address || currentUser?.services?.google?.email || 'Unknown User';
    }
    
    if (user) {
        // Try multiple email sources for OAuth users
        return user.emails?.[0]?.address || 
               user.services?.google?.email || 
               user.profile?.email ||
               'Unknown User';
    }
    
    return 'Unknown User';
};