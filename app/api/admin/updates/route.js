import { NextResponse } from "next/server";
import { isMissingTableError } from "../../../../lib/constants";
import { requireAdmin } from "../../../../lib/require-admin";
import { listUpdates, mapUpdate, normalizeBadges, normalizeTags } from "../../../../lib/updates";

export const dynamic = "force-dynamic";

function missingResponse() {
  return NextResponse.json(
    { error: "Updates table is missing. Run supabase/migrate-updates.sql in the Supabase SQL Editor." },
    { status: 503 }
  );
}

export async function GET(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  const result = await listUpdates(auth.supabase);
  if (result.missing) return missingResponse();
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 });
  return NextResponse.json({ updates: result.updates });
}

const UPDATE_COLUMNS = "id, title, description, badges, tags, created_at";

async function readUpdatePayload(auth, body) {
  const title = String(body.title || "").trim().slice(0, 120);
  const description = String(body.description || "").trim().slice(0, 4000);
  if (!title) return { error: NextResponse.json({ error: "Enter a title." }, { status: 400 }) };
  if (!description) return { error: NextResponse.json({ error: "Enter a description." }, { status: 400 }) };

  const { data: applications, error: appError } = await auth.supabase
    .from("applications")
    .select("id, name, application_variants (id, label, active)");
  if (appError) return { error: NextResponse.json({ error: appError.message }, { status: 500 }) };

  const tags = normalizeTags(body.tags, applications || []);
  if (tags.error) return { error: NextResponse.json({ error: tags.error }, { status: 400 }) };

  return {
    record: {
      title,
      description,
      badges: normalizeBadges(body.badges),
      tags: tags.tags,
    },
  };
}

export async function POST(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => ({}));
  const parsed = await readUpdatePayload(auth, body);
  if (parsed.error) return parsed.error;

  const { data, error } = await auth.supabase
    .from("updates")
    .insert(parsed.record)
    .select(UPDATE_COLUMNS)
    .single();

  if (error) {
    if (isMissingTableError(error)) return missingResponse();
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ update: mapUpdate(data) });
}

export async function PATCH(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => ({}));
  const id = String(body.id || "").trim();
  if (!id) return NextResponse.json({ error: "Update id is required." }, { status: 400 });

  const parsed = await readUpdatePayload(auth, body);
  if (parsed.error) return parsed.error;

  const { data, error } = await auth.supabase
    .from("updates")
    .update(parsed.record)
    .eq("id", id)
    .select(UPDATE_COLUMNS)
    .single();

  if (error) {
    if (isMissingTableError(error)) return missingResponse();
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (!data) return NextResponse.json({ error: "Update was not found." }, { status: 404 });

  return NextResponse.json({ update: mapUpdate(data) });
}

export async function DELETE(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => ({}));
  const id = String(body.id || "").trim();
  if (!id) return NextResponse.json({ error: "Update id is required." }, { status: 400 });

  const { error } = await auth.supabase.from("updates").delete().eq("id", id);
  if (error) {
    if (isMissingTableError(error)) return missingResponse();
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
