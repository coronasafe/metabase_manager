-- CreateTable
CREATE TABLE "SyncLog" (
    "id" SERIAL NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL,
    "detailedRecords" JSONB NOT NULL,
    "sourceEmail" TEXT NOT NULL,
    "sourceHost" TEXT NOT NULL,
    "destinationHost" TEXT NOT NULL,

    CONSTRAINT "SyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SyncLog_id_key" ON "SyncLog"("id");

-- CreateIndex
CREATE UNIQUE INDEX "SyncLog_timestamp_sourceHost_destinationHost_key" ON "SyncLog"("timestamp", "sourceHost", "destinationHost");
