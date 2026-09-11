CREATE TABLE `login_attempts` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`student` text,
	`class` text DEFAULT '' NOT NULL,
	`univ` text DEFAULT '' NOT NULL,
	`major` text DEFAULT '' NOT NULL,
	`date` text NOT NULL,
	`time` text NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`task` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`student`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`number` text DEFAULT '' NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`class` text DEFAULT '' NOT NULL,
	`password_hash` text NOT NULL,
	`must_change` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `student_number` ON `users` (`number`) WHERE "users"."role"='학생';--> statement-breakpoint
CREATE UNIQUE INDEX `user_id_case` ON `users` (lower("id"));