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
