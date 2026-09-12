ALTER TABLE "GameSession"
ADD COLUMN "submitAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "suspicious" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "suspiciousReason" TEXT,
ADD COLUMN "suspiciousAt" TIMESTAMP(3);

CREATE INDEX "GameSession_suspicious_idx"
ON "GameSession"("suspicious");
