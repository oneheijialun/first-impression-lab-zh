import {sqliteTable,text,integer,primaryKey} from 'drizzle-orm/sqlite-core';
export const sessions=sqliteTable('sessions',{
 id:text('id').primaryKey(),token:text('token').notNull(),mode:text('mode').notNull(),exposure:integer('exposure').notNull(),created:text('created').notNull(),completed:integer('completed').notNull().default(0)
});
export const records=sqliteTable('records',{
 sessionId:text('session_id').notNull().references(()=>sessions.id),kind:text('kind').notNull(),recordKey:text('record_key').notNull(),data:text('data').notNull(),created:text('created').notNull()
},table=>[primaryKey({columns:[table.sessionId,table.kind,table.recordKey]})]);
export const eyeExclusions=sqliteTable('eye_exclusions',{
 sessionId:text('session_id').primaryKey().references(()=>sessions.id),excluded:integer('excluded').notNull(),reason:text('reason').notNull(),updated:text('updated').notNull()
});
export const exclusionAudit=sqliteTable('eye_exclusion_audit',{
 id:integer('id').primaryKey({autoIncrement:true}),sessionId:text('session_id').notNull(),excluded:integer('excluded').notNull(),reason:text('reason').notNull(),created:text('created').notNull()
});
