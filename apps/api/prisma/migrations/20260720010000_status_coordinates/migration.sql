ALTER TABLE "current_statuses"
ADD COLUMN "location_address" VARCHAR(300),
ADD COLUMN "latitude" DECIMAL(9, 6),
ADD COLUMN "longitude" DECIMAL(9, 6);

ALTER TABLE "current_statuses"
ADD CONSTRAINT "current_statuses_location_coordinate_pair"
CHECK (("latitude" IS NULL) = ("longitude" IS NULL));
