import { Template } from 'meteor/templating';
import { ReactiveVar } from 'meteor/reactive-var';

// Simple state management using ReactiveVar (built-in)
const authFormType = new ReactiveVar('hidden'); // Start with hidden form

// Export for navigation
export const currentScreen = new ReactiveVar('authPage');

// Clean template definition
Template.authPage.helpers({
  showLoginForm: () => authFormType.get() === 'login',
  showSignupForm: () => authFormType.get() === 'signup',
  showEmailForm: () => authFormType.get() !== 'hidden' // Show when not hidden
});

Template.authPage.events({
  'click #showSignupBtn': () => authFormType.set('signup'),
  'click #showLoginBtn': () => authFormType.set('login'),
  
  // Toggle for Login with Gmail button
  'click #showEmailForm': () => {
    authFormType.set(authFormType.get() === 'hidden' ? 'login' : 'hidden');
  },
  
  'submit #signupForm'(event) {
    event.preventDefault();
    const { username, password, confirmPassword } = event.target;
    
    if (password.value !== confirmPassword.value) return alert('Passwords do not match');
    if (password.value.length < 6) return alert('Password too short');
    
    Accounts.createUser({ username: username.value.trim(), password: password.value }, (err) => {
      if (err) alert('Signup failed: ' + err.reason);
      else currentScreen.set('mainLayout');
    });
  },
  
  'submit #loginForm'(event) {
    event.preventDefault();
    const { username, password } = event.target;
    
    Meteor.loginWithPassword(username.value.trim(), password.value, (err) => {
      if (err) alert('Login failed: ' + err.reason);
      else currentScreen.set('mainLayout');
    });
  }
});