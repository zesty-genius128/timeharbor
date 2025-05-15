import { Mongo } from 'meteor/mongo';

export const Tickets = new Mongo.Collection('tickets');
export const Teams = new Mongo.Collection('teams');
export const Sessions = new Mongo.Collection('sessions');
// Session schema:
// {
//   userId: String,
//   ticketId: String, // NEW: associate session with a ticket
//   startTime: Date,
//   endTime: Date
// }

export const ClockEvents = new Mongo.Collection('clockevents');
// ClockEvents schema:
// {
//   _id,
//   userId,
//   teamId,
//   ticketId, // optional, if clocking in on a specific ticket
//   startTimestamp,
//   accumulatedTime,
//   endTime // null if still clocked in
// }
