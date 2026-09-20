-- AlterEnum
ALTER TYPE "booking_channel" ADD VALUE 'KIOSK';

-- CreateTable
CREATE TABLE "kiosk_devices" (
    "id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "paired_by_id" UUID,
    "last_seen_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kiosk_devices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "kiosk_devices_token_hash_key" ON "kiosk_devices"("token_hash");

-- AddForeignKey
ALTER TABLE "kiosk_devices" ADD CONSTRAINT "kiosk_devices_paired_by_id_fkey" FOREIGN KEY ("paired_by_id") REFERENCES "staff_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Supabase exposes the public schema through its Data API: no table is readable without RLS.
ALTER TABLE public.kiosk_devices ENABLE ROW LEVEL SECURITY;
