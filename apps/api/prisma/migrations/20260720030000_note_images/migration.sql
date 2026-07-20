ALTER TABLE "notes"
ADD COLUMN "image_data" BYTEA,
ADD COLUMN "image_mime_type" VARCHAR(32),
ADD COLUMN "image_size_bytes" INTEGER;

ALTER TABLE "notes"
ADD CONSTRAINT "notes_image_fields_check"
CHECK (
  (
    "image_data" IS NULL
    AND "image_mime_type" IS NULL
    AND "image_size_bytes" IS NULL
  )
  OR (
    "image_data" IS NOT NULL
    AND "image_mime_type" IS NOT NULL
    AND "image_size_bytes" BETWEEN 1 AND 1500000
    AND octet_length("image_data") = "image_size_bytes"
  )
);
