CREATE TABLE "waitlist_signups" (
  "id" uuid PRIMARY KEY NOT NULL,
  "email" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  CONSTRAINT "waitlist_signups_email_unique" UNIQUE("email")
);
