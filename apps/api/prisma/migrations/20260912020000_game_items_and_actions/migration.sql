CREATE TABLE "GameItem" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "itemKey" TEXT NOT NULL,
    "name" TEXT,
    "imageUrl" TEXT NOT NULL,
    "correctAnswer" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GameItem_gameId_itemKey_key"
ON "GameItem"("gameId", "itemKey");

CREATE INDEX "GameItem_gameId_idx"
ON "GameItem"("gameId");

CREATE INDEX "GameItem_gameId_active_idx"
ON "GameItem"("gameId", "active");

ALTER TABLE "GameItem"
ADD CONSTRAINT "GameItem_gameId_fkey"
FOREIGN KEY ("gameId")
REFERENCES "Game"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;


CREATE TABLE "GameAction" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "itemKey" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "correct" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameAction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GameAction_sessionId_sequence_key"
ON "GameAction"("sessionId", "sequence");

CREATE INDEX "GameAction_sessionId_idx"
ON "GameAction"("sessionId");

CREATE INDEX "GameAction_sessionId_createdAt_idx"
ON "GameAction"("sessionId", "createdAt");

ALTER TABLE "GameAction"
ADD CONSTRAINT "GameAction_sessionId_fkey"
FOREIGN KEY ("sessionId")
REFERENCES "GameSession"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;