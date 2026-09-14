import {sqliteTable,text,integer,uniqueIndex} from 'drizzle-orm/sqlite-core';
import {sql} from 'drizzle-orm';
export const users=sqliteTable('users',{
 id:text('id').primaryKey(),number:text('number').notNull().default(''),name:text('name').notNull(),role:text('role',{enum:['관리자','교사','학생']}).notNull(),class:text('class').notNull().default(''),password_hash:text('password_hash').notNull(),must_change:integer('must_change').notNull().default(0)
},t=>[uniqueIndex('student_number').on(t.number).where(sql`${t.role}='학생'`),uniqueIndex('user_id_case').on(sql`lower(${t.id})`)]);
export const events=sqliteTable('events',{
 id:text('id').primaryKey(),type:text('type',{enum:['first','interview','final','lesson']}).notNull(),student:text('student').references(()=>users.id),class:text('class').notNull().default(''),univ:text('univ').notNull().default(''),major:text('major').notNull().default(''),date:text('date').notNull(),time:text('time').notNull(),title:text('title').notNull().default(''),task:text('task').notNull().default(''),lesson_kind:text('lesson_kind').notNull().default(''),teacher_name:text('teacher_name').notNull().default(''),target_ids:text('target_ids').notNull().default('null'),teacher_id:text('teacher_id').notNull().default(''),result:text('result').notNull().default('')
});
export const sessions=sqliteTable('sessions',{token_hash:text('token_hash').primaryKey(),user_id:text('user_id').notNull().references(()=>users.id),expires:integer('expires').notNull()});
export const attempts=sqliteTable('login_attempts',{key:text('key').primaryKey(),count:integer('count').notNull(),expires:integer('expires').notNull()});

export const applications=sqliteTable('applications',{student:text('student').primaryKey().references(()=>users.id,{onDelete:'cascade'}),rows:text('rows').notNull()});

export const resourcePosts=sqliteTable('resource_posts',{id:text('id').primaryKey(),author_id:text('author_id').notNull(),author_name:text('author_name').notNull(),title:text('title').notNull(),content:text('content').notNull(),created_at:text('created_at').notNull(),target_ids:text('target_ids').notNull().default('null')});
export const resourceFiles=sqliteTable('resource_files',{id:text('id').primaryKey(),post_id:text('post_id').notNull().references(()=>resourcePosts.id,{onDelete:'cascade'}),name:text('name').notNull(),size:integer('size').notNull()});

export const availability=sqliteTable('availability',{student:text('student').primaryKey().references(()=>users.id,{onDelete:'cascade'}),days:text('days').notNull(),note:text('note').notNull(),min_exam:integer('min_exam').notNull().default(0)});

export const importantEvents=sqliteTable('important_events',{id:text('id').primaryKey(),title:text('title').notNull(),date:text('date').notNull(),description:text('description').notNull(),author_id:text('author_id').notNull().references(()=>users.id,{onDelete:'cascade'})});
export const lessonProgress=sqliteTable('lesson_progress',{id:text('id').primaryKey(),event_id:text('event_id').notNull().references(()=>events.id,{onDelete:'cascade'}),student:text('student').notNull().references(()=>users.id,{onDelete:'cascade'}),completed_at:text('completed_at').notNull(),marked_by:text('marked_by').notNull()});

export const submissions=sqliteTable('submissions',{id:text('id').primaryKey(),event_id:text('event_id').notNull().references(()=>events.id,{onDelete:'cascade'}),student:text('student').notNull().references(()=>users.id,{onDelete:'cascade'}),content:text('content').notNull(),created_at:text('created_at').notNull()});
export const submissionFiles=sqliteTable('submission_files',{id:text('id').primaryKey(),submission_id:text('submission_id').notNull().references(()=>submissions.id,{onDelete:'cascade'}),name:text('name').notNull(),size:integer('size').notNull()});

export const assignments=sqliteTable('assignments',{id:text('id').primaryKey(),title:text('title').notNull(),content:text('content').notNull(),class:text('class').notNull(),target_ids:text('target_ids').notNull(),author_id:text('author_id').notNull(),author_name:text('author_name').notNull(),created_at:text('created_at').notNull()});
export const assignmentFiles=sqliteTable('assignment_files',{id:text('id').primaryKey(),assignment_id:text('assignment_id').notNull().references(()=>assignments.id,{onDelete:'cascade'}),name:text('name').notNull(),size:integer('size').notNull()});
export const assignmentSubmissions=sqliteTable('assignment_submissions',{id:text('id').primaryKey(),event_id:text('event_id').notNull().references(()=>assignments.id,{onDelete:'cascade'}),student:text('student').notNull().references(()=>users.id,{onDelete:'cascade'}),content:text('content').notNull(),created_at:text('created_at').notNull()});
export const submissionAttachments=sqliteTable('submission_attachments',{id:text('id').primaryKey(),submission_id:text('submission_id').notNull().references(()=>assignmentSubmissions.id,{onDelete:'cascade'}),name:text('name').notNull(),size:integer('size').notNull()});
