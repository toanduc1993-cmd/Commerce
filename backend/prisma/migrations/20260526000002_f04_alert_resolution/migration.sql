-- F04 Alert Center — AlertResolution persist resolved-state cho reconciliation alerts.
-- Tạo manual qua psql (RULE CỨNG #6 — không dùng prisma migrate dev).

CREATE TABLE IF NOT EXISTS "alert_resolution" (
    "id" TEXT NOT NULL,
    "canonical_key" TEXT NOT NULL,
    "resolved_by" TEXT NOT NULL,
    "resolved_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "alert_resolution_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "alert_resolution_canonical_key_key"
  ON "alert_resolution"("canonical_key");
