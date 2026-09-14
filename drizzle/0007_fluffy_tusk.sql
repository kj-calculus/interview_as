CREATE TABLE `assignment_files` (
	`id` text PRIMARY KEY NOT NULL,
	`assignment_id` text NOT NULL,
	`name` text NOT NULL,
	`size` integer NOT NULL,
	FOREIGN KEY (`assignment_id`) REFERENCES `assignments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `assignment_submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`student` text NOT NULL,
	`content` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `assignments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`student`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`class` text NOT NULL,
	`target_ids` text NOT NULL,
	`author_id` text NOT NULL,
	`author_name` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `submission_attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`submission_id` text NOT NULL,
	`name` text NOT NULL,
	`size` integer NOT NULL,
	FOREIGN KEY (`submission_id`) REFERENCES `assignment_submissions`(`id`) ON UPDATE no action ON DELETE cascade
);

--> statement-breakpoint
INSERT INTO assignments(id,title,content,class,target_ids,author_id,author_name,created_at) SELECT id,title,task,class,target_ids,teacher_id,teacher_name,strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM events WHERE type='lesson' AND (trim(task)<>'' OR id IN(SELECT event_id FROM submissions));
--> statement-breakpoint
INSERT INTO assignment_submissions SELECT * FROM submissions;
--> statement-breakpoint
INSERT INTO submission_attachments SELECT * FROM submission_files;
