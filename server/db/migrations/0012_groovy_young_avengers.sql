ALTER TABLE "machines" ADD COLUMN "tuya_ip" text;--> statement-breakpoint
ALTER TABLE "machines" ADD COLUMN "tuya_device_id" text;--> statement-breakpoint
ALTER TABLE "machines" ADD COLUMN "tuya_local_key" text;--> statement-breakpoint
ALTER TABLE "machines" ADD COLUMN "tuya_version" text DEFAULT '3.4' NOT NULL;--> statement-breakpoint
ALTER TABLE "machines" ADD COLUMN "tuya_last_power_watt" real;--> statement-breakpoint
ALTER TABLE "machines" ADD COLUMN "tuya_last_voltage" real;--> statement-breakpoint
ALTER TABLE "machines" ADD COLUMN "tuya_last_current_ma" integer;--> statement-breakpoint
ALTER TABLE "machines" ADD COLUMN "tuya_last_on" boolean;--> statement-breakpoint
ALTER TABLE "machines" ADD COLUMN "tuya_last_read_at" timestamp;--> statement-breakpoint
ALTER TABLE "machines" ADD COLUMN "tuya_last_error" text;