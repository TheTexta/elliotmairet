"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { deletePhotographAction } from "../actions";
import { galleryReturnHref } from "./archive-state";

export async function removePhotographAndReturnAction(id: string, returnHref: string) {
  // The existing action retains authentication, reservations and tracked cleanup.
  const result = await deletePhotographAction(id);
  revalidatePath("/admin/photos/[id]/edit", "page");
  const destination = new URL(galleryReturnHref(returnHref), "https://admin.invalid");
  destination.searchParams.set("removed", result.message?.includes("pending") ? "pending" : "done");
  redirect(`${destination.pathname}${destination.search}`);
}
