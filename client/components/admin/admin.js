// Admin Review Template
import { Template } from 'meteor/templating';
import { ReactiveVar } from 'meteor/reactive-var';
import { Teams, Tickets } from '../../../collections.js';

Template.admin.onCreated(function () {
  this.selectedAdminTeamId = new ReactiveVar(null);
  this.titleFilter = new ReactiveVar('');
  this.statusFilter = new ReactiveVar('');
  this.creatorFilter = new ReactiveVar('');
  this.sortField = new ReactiveVar('createdAt');
  this.sortDirection = new ReactiveVar(-1); // -1 for desc, 1 for asc
  this.selectedTickets = new ReactiveVar([]);

  this.autorun(() => {
    this.subscribe('userTeams');
    const selectedTeamId = this.selectedAdminTeamId.get();
    if (selectedTeamId) {
      this.subscribe('adminTeamTickets', selectedTeamId);
      this.subscribe('teamMembers', [selectedTeamId]);
    }
  });
});

Template.admin.helpers({
  adminTeams() {
    // Only show teams where user is admin or leader
    return Teams.find({
      $or: [
        { leader: Meteor.userId() },
        { admins: Meteor.userId() }
      ]
    });
  },

  selectedAdminTeamId() {
    return Template.instance().selectedAdminTeamId.get();
  },

  isSelectedAdminTeam(teamId) {
    return Template.instance().selectedAdminTeamId.get() === teamId ? 'selected' : '';
  },

  adminTickets() {
    const teamId = Template.instance().selectedAdminTeamId.get();
    if (!teamId) return [];
    return Tickets.find({ teamId }).fetch();
  },

  filteredAndSortedTickets() {
    const instance = Template.instance();
    const teamId = instance.selectedAdminTeamId.get();
    if (!teamId) return [];

    let tickets = Tickets.find({ teamId }).fetch();

    // Apply filters
    const titleFilter = instance.titleFilter.get().toLowerCase();
    const statusFilter = instance.statusFilter.get();
    const creatorFilter = instance.creatorFilter.get();

    if (titleFilter) {
      tickets = tickets.filter(t => t.title.toLowerCase().includes(titleFilter));
    }

    if (statusFilter) {
      tickets = tickets.filter(t => (t.status || 'open') === statusFilter);
    }

    if (creatorFilter) {
      tickets = tickets.filter(t => t.createdBy === creatorFilter);
    }

    // Apply sorting
    const sortField = instance.sortField.get();
    const sortDirection = instance.sortDirection.get();

    tickets.sort((a, b) => {
      let aVal = a[sortField];
      let bVal = b[sortField];

      // Handle special cases
      if (sortField === 'status') {
        aVal = aVal || 'open';
        bVal = bVal || 'open';
      }

      if (sortField === 'accumulatedTime') {
        aVal = aVal || 0;
        bVal = bVal || 0;
      }

      if (aVal < bVal) return -1 * sortDirection;
      if (aVal > bVal) return 1 * sortDirection;
      return 0;
    });

    return tickets;
  },

  uniqueCreators() {
    const teamId = Template.instance().selectedAdminTeamId.get();
    if (!teamId) return [];

    const tickets = Tickets.find({ teamId }).fetch();
    const userIds = [...new Set(tickets.map(t => t.createdBy))];
    return Meteor.users.find({ _id: { $in: userIds } }).fetch();
  },

  formatDate(date) {
    if (!date) return '';
    return new Date(date).toLocaleDateString() + ' ' + new Date(date).toLocaleTimeString();
  },

  formatTime(seconds) {
    if (!seconds) return '0:00:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  },

  statusBadgeClass(status) {
    const s = status || 'open';
    switch (s) {
      case 'open': return 'badge-primary';
      case 'reviewed': return 'badge-info';
      case 'closed': return 'badge-success';
      case 'deleted': return 'badge-error';
      default: return 'badge-ghost';
    }
  },

  capitalizeStatus(status) {
    const s = status || 'open';
    return s.charAt(0).toUpperCase() + s.slice(1);
  },

  creatorName(userId) {
    const user = Meteor.users.findOne(userId);
    return user ? user.username : 'Unknown';
  },

  reviewerName(userId) {
    const user = Meteor.users.findOne(userId);
    return user ? user.username : 'Unknown';
  },

  githubLink(github) {
    if (!github) return '';
    // If it's already a full URL, return as is
    if (github.startsWith('http://') || github.startsWith('https://')) {
      return github;
    }
    // Otherwise treat as relative link
    return github;
  }
});

Template.admin.events({
  'change #adminTeamSelect'(e, t) {
    const teamId = e.target.value;
    t.selectedAdminTeamId.set(teamId || null);
    // Reset filters when changing teams
    t.titleFilter.set('');
    t.statusFilter.set('');
    t.creatorFilter.set('');
    t.selectedTickets.set([]);
    // Reset form values
    t.$('#titleFilter').val('');
    t.$('#statusFilter').val('');
    t.$('#creatorFilter').val('');
  },

  'input #titleFilter'(e, t) {
    t.titleFilter.set(e.target.value);
  },

  'change #statusFilter'(e, t) {
    t.statusFilter.set(e.target.value);
  },

  'change #creatorFilter'(e, t) {
    t.creatorFilter.set(e.target.value);
  },

  'click .sortable'(e, t) {
    const sortField = e.currentTarget.dataset.sort;
    const currentField = t.sortField.get();
    const currentDirection = t.sortDirection.get();

    if (currentField === sortField) {
      // Toggle direction
      t.sortDirection.set(currentDirection * -1);
    } else {
      // New field, default to descending
      t.sortField.set(sortField);
      t.sortDirection.set(-1);
    }

    // Update visual indicators
    t.$('.sort-indicator').text('↕');
    const indicator = currentDirection === -1 ? '↓' : '↑';
    t.$(e.currentTarget).find('.sort-indicator').text(indicator);
  },

  'change .ticket-checkbox, change #headerSelectAll'(e, t) {
    const selectedTickets = [];
    t.$('.ticket-checkbox:checked').each(function() {
      selectedTickets.push($(this).data('ticket-id'));
    });
    t.selectedTickets.set(selectedTickets);

    // Update UI
    const count = selectedTickets.length;
    t.$('#selectedCount').text(`${count} items selected`);

    // Enable/disable batch buttons
    const hasSelection = count > 0;
    t.$('#batchReviewed, #batchClosed, #batchDeleted').prop('disabled', !hasSelection);

    // Update select all checkbox state
    const totalVisible = t.$('.ticket-checkbox').length;
    t.$('#selectAll, #headerSelectAll').prop('checked', count === totalVisible && count > 0);
  },

  'click #selectAll'(e, t) {
    const checked = e.target.checked;
    t.$('.ticket-checkbox').prop('checked', checked);
    t.$('.ticket-checkbox').first().trigger('change');
  },

  'click #batchReviewed'(e, t) {
    const selectedTickets = t.selectedTickets.get();
    const teamId = t.selectedAdminTeamId.get();

    if (selectedTickets.length === 0 || !teamId) return;

    Meteor.call('batchUpdateTicketStatus', {
      ticketIds: selectedTickets,
      status: 'reviewed',
      teamId: teamId
    }, (error) => {
      if (error) {
        alert('Error updating tickets: ' + error.message);
      } else {
        t.selectedTickets.set([]);
        t.$('.ticket-checkbox').prop('checked', false);
        t.$('#selectedCount').text('0 items selected');
        t.$('#batchReviewed, #batchClosed, #batchDeleted').prop('disabled', true);
      }
    });
  },

  'click #batchClosed'(e, t) {
    const selectedTickets = t.selectedTickets.get();
    const teamId = t.selectedAdminTeamId.get();

    if (selectedTickets.length === 0 || !teamId) return;

    Meteor.call('batchUpdateTicketStatus', {
      ticketIds: selectedTickets,
      status: 'closed',
      teamId: teamId
    }, (error) => {
      if (error) {
        alert('Error updating tickets: ' + error.message);
      } else {
        t.selectedTickets.set([]);
        t.$('.ticket-checkbox').prop('checked', false);
        t.$('#selectedCount').text('0 items selected');
        t.$('#batchReviewed, #batchClosed, #batchDeleted').prop('disabled', true);
      }
    });
  },

  'click #batchDeleted'(e, t) {
    const selectedTickets = t.selectedTickets.get();
    const teamId = t.selectedAdminTeamId.get();

    if (selectedTickets.length === 0 || !teamId) return;

    if (!confirm(`Are you sure you want to mark ${selectedTickets.length} items as deleted?`)) {
      return;
    }

    Meteor.call('batchUpdateTicketStatus', {
      ticketIds: selectedTickets,
      status: 'deleted',
      teamId: teamId
    }, (error) => {
      if (error) {
        alert('Error updating tickets: ' + error.message);
      } else {
        t.selectedTickets.set([]);
        t.$('.ticket-checkbox').prop('checked', false);
        t.$('#selectedCount').text('0 items selected');
        t.$('#batchReviewed, #batchClosed, #batchDeleted').prop('disabled', true);
      }
    });
  }
});
