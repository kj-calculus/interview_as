CREATE TABLE `availability` (
	`student` text PRIMARY KEY NOT NULL,
	`days` text NOT NULL,
	`note` text NOT NULL,
	FOREIGN KEY (`student`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `resource_posts` ADD `target_ids` text DEFAULT 'null' NOT NULL;