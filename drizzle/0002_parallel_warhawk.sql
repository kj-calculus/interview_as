CREATE TABLE `resource_files` (
	`id` text PRIMARY KEY NOT NULL,
	`post_id` text NOT NULL,
	`name` text NOT NULL,
	`size` integer NOT NULL,
	FOREIGN KEY (`post_id`) REFERENCES `resource_posts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `resource_posts` (
	`id` text PRIMARY KEY NOT NULL,
	`author_id` text NOT NULL,
	`author_name` text NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `events` ADD `lesson_kind` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `events` ADD `teacher_name` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `events` ADD `target_ids` text DEFAULT 'null' NOT NULL;