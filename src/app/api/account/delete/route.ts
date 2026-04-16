// src/app/api/account/delete/route.ts
import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function DELETE() {
  try {
    const supabase = await getSupabaseServer();

    // Verify session
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Step 1 — Delete all user data via DB function (runs as authenticated user,
    // function verifies auth.uid() matches p_user_id internally)
    const { error: fnError } = await supabase.rpc("delete_user_account", {
      p_user_id: user.id,
    });

    if (fnError) {
      console.error("[account/delete] DB cleanup error:", fnError);
      return NextResponse.json(
        { error: "Failed to delete account data." },
        { status: 500 },
      );
    }

    // Step 2 — Delete the auth user via admin client (service role required)
    const admin = getSupabaseAdmin();
    const { error: adminError } = await admin.auth.admin.deleteUser(user.id);

    if (adminError) {
      console.error("[account/delete] Auth user deletion error:", adminError);
      // Data is already deleted at this point — log for manual cleanup
      return NextResponse.json(
        {
          error:
            "Account data removed but auth user deletion failed. Contact support.",
        },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[account/delete] Unexpected error:", error);
    return NextResponse.json(
      { error: "Failed to delete account." },
      { status: 500 },
    );
  }
}
