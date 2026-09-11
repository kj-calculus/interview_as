import {sqliteTable,text,integer,uniqueIndex} from 'drizzle-orm/sqlite-core';
import {sql} from 'drizzle-orm';
export const users=sqliteTable('users',{
 id:text('id').primaryKey(),number:text('number').notNull().default(''),name:text('name').notNull(),role:text('role',{enum:['관리자','교사','학생']}).notNull(),class:text('class').notNull().default(''),password_hash:text('password_hash').notNull(),must_change:integer('must_change').notNull().default(0)
},t=>[uniqueIndex('student_number').on(t.number).where(sql`${t.role}='학생'`),uniqueIndex('user_id_case').on(sql`lower(${t.id})`)]);
export const events=sqliteTable('events',{
 id:text('id').primaryKey(),type:text('type',{enum:['first','interview','final','lesson']}).notNull(),student:text('student').references(()=>users.id),class:text('class').notNull().default(''),univ:text('univ').notNull().default(''),major:text('major').notNull().default(''),date:text('date').notNull(),time:text('time').notNull(),title:text('title').notNull().default(''),task:text('task').notNull().default('')
});
export const sessions=sqliteTable('sessions',{token_hash:text('token_hash').primaryKey(),user_id:text('user_id').notNull().references(()=>users.id),expires:integer('expires').notNull()});
export const attempts=sqliteTable('login_attempts',{key:text('key').primaryKey(),count:integer('count').notNull(),expires:integer('expires').notNull()});
