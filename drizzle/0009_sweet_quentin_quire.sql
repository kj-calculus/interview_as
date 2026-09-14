CREATE TABLE `upload_batches` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`path` text NOT NULL,
	`method` text NOT NULL,
	`parts` integer NOT NULL,
	`received` integer NOT NULL,
	`expires` integer NOT NULL
);
