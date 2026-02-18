import { getSupabaseServer } from '@/lib/supabaseServer'
import { NextRequest, NextResponse } from 'next/server'

const ALLOWED_AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_AVATAR_SIZE = 5 * 1024 * 1024 // 5MB

export async function POST(req: NextRequest) {
  const supabase = await getSupabaseServer()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { mimeType, fileSize } = await req.json()

  if (!ALLOWED_AVATAR_TYPES.includes(mimeType)) {
    return NextResponse.json({ error: 'Only JPEG, PNG, WebP allowed' }, { status: 400 })
  }

  if (fileSize > MAX_AVATAR_SIZE) {
    return NextResponse.json({ error: 'Max avatar size is 5MB' }, { status: 400 })
  }

  // Path scoped to user's own folder — bucket RLS also enforces this as second layer
  const ext = mimeType.split('/')[1]
  const storagePath = `${user.id}/avatar.${ext}`

  const { data, error } = await supabase.storage
    .from('profile-pictures')
    .createSignedUploadUrl(storagePath)

  if (error) {
    console.error('[avatar/request] Signed URL error:', error)
    return NextResponse.json({ error: 'Failed to generate upload URL' }, { status: 500 })
  }

  return NextResponse.json({ signedUrl: data.signedUrl, storagePath })
}