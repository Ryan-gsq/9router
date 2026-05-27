import { NextResponse } from "next/server";
import { createProviderConnection } from "@/models";

/**
 * POST /api/oauth/codex/import-credentials
 * Batch import normalized Codex credential items from sub2api or cpa token.json.
 *
 * Body: { items: Array<{
 *   name?, email?, accessToken, refreshToken?, expiresAt?, expiresIn?,
 *   priority?, providerSpecificData?: { chatgptAccountId?, chatgptPlanType? }
 * }> } | Array<...>
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const items = Array.isArray(body)
      ? body
      : Array.isArray(body?.items)
        ? body.items
        : null;

    if (!items || items.length === 0) {
      return NextResponse.json(
        { error: "No items to import" },
        { status: 400 }
      );
    }

    const results = [];
    const errors = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      try {
        if (!item || typeof item !== "object") {
          throw new Error("Item is not an object");
        }
        if (!item.accessToken || typeof item.accessToken !== "string") {
          throw new Error("Missing accessToken");
        }

        const conn = await createProviderConnection({
          provider: "codex",
          authType: "oauth",
          accessToken: item.accessToken,
          refreshToken: item.refreshToken || null,
          expiresAt: item.expiresAt || null,
          expiresIn: item.expiresIn,
          email: item.email || null,
          name: item.name || null,
          priority: typeof item.priority === "number" ? item.priority : undefined,
          providerSpecificData:
            item.providerSpecificData && Object.keys(item.providerSpecificData).length
              ? item.providerSpecificData
              : undefined,
          testStatus: "active",
        });

        results.push({
          id: conn.id,
          email: conn.email,
          name: conn.name,
        });
      } catch (err) {
        errors.push({
          index: i,
          name: item?.name || item?.email || `#${i}`,
          error: err.message,
        });
      }
    }

    return NextResponse.json({
      success: errors.length === 0,
      imported: results.length,
      total: items.length,
      results,
      errors,
    });
  } catch (error) {
    console.log("Codex import-credentials error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
