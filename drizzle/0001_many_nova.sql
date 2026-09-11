CREATE TABLE `applications` (
	`student` text PRIMARY KEY NOT NULL,
	`rows` text NOT NULL,
	FOREIGN KEY (`student`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
