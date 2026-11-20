"use server";
import { revalidatePath } from "next/cache";
import { recordAction, type ActionResult } from "@/lib/actions";
import type { ActionType } from "@/lib/gamification";

const ALLOWED: ActionType[] = ["read", "emailed", "called", "commented", "signed", "attended", "shared"];

export async function logAction(type: ActionType, itemId: string | null, officialId: string | null = null): Promise<ActionResult> {
  if (!ALLOWED.includes(type)) throw new Error("Unknown action");
  const res = await recordAction({ type, itemId, officialId });
  if (!res.duplicate && type !== "read") revalidatePath("/feed");
  return res;
}
