import { Template } from 'meteor/templating';
import { ReactiveVar } from 'meteor/reactive-var';
import { Meteor } from 'meteor/meteor';

import './SettingsPage.html';

/**
 * Settings Page - User configuration including Ozwell AI integration
 */

Template.settings.onCreated(function() {
  this.isEnabling = new ReactiveVar(false);
  this.isTestingConnection = new ReactiveVar(false);
  this.ozwellError = new ReactiveVar(null);
  this.connectionTestResult = new ReactiveVar(null);
});

Template.settings.helpers({
  currentUser() {
    return Meteor.user();
  },
  
  ozwellEnabled() {
    const user = Meteor.user();
    return user && user.profile && user.profile.ozwellApiKey;
  },
  
  lastFourChars() {
    const user = Meteor.user();
    if (user && user.profile && user.profile.ozwellApiKey) {
      const key = user.profile.ozwellApiKey;
      return key.slice(-4);
    }
    return '';
  },
  
  lastConnected() {
    const user = Meteor.user();
    return user && user.profile && user.profile.ozwellLastConnected;
  },
  
  isEnabling() {
    return Template.instance().isEnabling.get();
  },
  
  isTestingConnection() {
    return Template.instance().isTestingConnection.get();
  },
  
  ozwellError() {
    return Template.instance().ozwellError.get();
  },
  
  connectionTestResult() {
    return Template.instance().connectionTestResult.get();
  },
  
  connectionTestClass() {
    const result = Template.instance().connectionTestResult.get();
    if (result && result.includes('✅')) {
      return 'alert-success';
    } else if (result && result.includes('❌')) {
      return 'alert-error';
    }
    return 'alert-info';
  },
  
  enableFormAttrs() {
    return Template.instance().isEnabling.get() ? { disabled: 'disabled' } : {};
  },
  
  testConnectionAttrs() {
    return Template.instance().isTestingConnection.get() ? { disabled: 'disabled' } : {};
  },
  
  formatDate(date) {
    if (!date) return 'Never';
    return new Date(date).toLocaleDateString();
  }
});

Template.settings.events({
  'submit #enableOzwellForm'(event, template) {
    event.preventDefault();
    
    const formData = new FormData(event.target);
    const apiKey = formData.get('apiKey');
    
    if (!apiKey) {
      template.ozwellError.set('Please enter your Ozwell API key');
      return;
    }
    
    template.isEnabling.set(true);
    template.ozwellError.set(null);
    
    Meteor.call('enableOzwellForUser', apiKey, (error, result) => {
      template.isEnabling.set(false);
      
      if (error) {
        console.error('Failed to enable Ozwell:', error);
        template.ozwellError.set(error.reason || 'Failed to enable Ozwell. Please check your API key.');
      } else {
        template.ozwellError.set(null);
        // Clear form
        event.target.reset();
        // Show success message briefly
        template.connectionTestResult.set('✅ Ozwell AI enabled successfully!');
        setTimeout(() => {
          template.connectionTestResult.set(null);
        }, 3000);
      }
    });
  },
  
  'click #testOzwellConnection'(event, template) {
    template.isTestingConnection.set(true);
    template.connectionTestResult.set(null);
    
    Meteor.call('testUserOzwellConnection', (error, result) => {
      template.isTestingConnection.set(false);
      
      if (error) {
        template.connectionTestResult.set('❌ Connection test failed: ' + (error.reason || error.message));
      } else {
        if (result.success) {
          template.connectionTestResult.set('✅ Connection successful! Ozwell AI is working correctly.');
        } else {
          template.connectionTestResult.set('❌ Connection failed: ' + (result.error || 'Unknown error'));
        }
      }
    });
  },
  
  'click #updateOzwellKey'(event, template) {
    // Show a simple prompt for now - could be enhanced to a modal
    const newKey = prompt('Enter your new Ozwell API key:');
    if (newKey) {
      template.isEnabling.set(true);
      template.ozwellError.set(null);
      
      Meteor.call('enableOzwellForUser', newKey, (error, result) => {
        template.isEnabling.set(false);
        
        if (error) {
          template.ozwellError.set(error.reason || 'Failed to update API key.');
        } else {
          template.connectionTestResult.set('✅ API key updated successfully!');
          setTimeout(() => {
            template.connectionTestResult.set(null);
          }, 3000);
        }
      });
    }
  },
  
  'click #disableOzwell'(event, template) {
    if (confirm('Are you sure you want to disable Ozwell AI? You can re-enable it anytime.')) {
      Meteor.call('disableOzwellForUser', (error) => {
        if (error) {
          template.ozwellError.set(error.reason || 'Failed to disable Ozwell.');
        } else {
          template.ozwellError.set(null);
          template.connectionTestResult.set(null);
        }
      });
    }
  }
});