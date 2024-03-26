// app/api/database/logging/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createSyncLog, getAllSyncLogs, getSyncLogById, updateSyncLog } from "./utils";

export async function GET(req: NextRequest) {
  try {
    const { id } = Object.fromEntries(req.nextUrl.searchParams.entries());
    if (id) {
      const res = await getSyncLogById(parseInt(id, 10));
      return NextResponse.json(res);
    } else {
      const res = await getAllSyncLogs();
      return NextResponse.json(res);
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message, raw: e });
  }
}

export async function POST(req: NextRequest) {
  const { status, detailedRecords, sourceEmail, sourceHost, destinationHost } = await req.json();
  try {
    const res = await createSyncLog(status, detailedRecords, sourceEmail, sourceHost, destinationHost);
    return NextResponse.json(res);
  } catch (e: any) {
    return NextResponse.json({ error: e.message, raw: e });
  }
}

export async function PATCH(req: NextRequest) {
  const { id, status, detailedRecords } = await req.json();
  try {
    const res = await updateSyncLog(id, status, detailedRecords);
    return NextResponse.json(res);
  } catch (e: any) {
    return NextResponse.json({ error: e.message, raw: e });
  }
}

// Add DELETE endpoint if needed