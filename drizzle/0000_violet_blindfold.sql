CREATE TABLE `eye_exclusion_audit` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` text NOT NULL,
	`excluded` integer NOT NULL,
	`reason` text NOT NULL,
	`created` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `eye_exclusions` (
	`session_id` text PRIMARY KEY NOT NULL,
	`excluded` integer NOT NULL,
	`reason` text NOT NULL,
	`updated` text NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `records` (
	`session_id` text NOT NULL,
	`kind` text NOT NULL,
	`record_key` text NOT NULL,
	`data` text NOT NULL,
	`created` text NOT NULL,
	PRIMARY KEY(`session_id`, `kind`, `record_key`),
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`token` text NOT NULL,
	`mode` text NOT NULL,
	`exposure` integer NOT NULL,
	`created` text NOT NULL,
	`completed` integer DEFAULT 0 NOT NULL
);
