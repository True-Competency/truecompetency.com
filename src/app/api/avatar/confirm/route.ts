import { getSupabaseServer } from '@/lib/supabaseServer'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const supabase = await getSupabaseServer()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { storagePath } = await req.json()

  if (!storagePath) {
    return NextResponse.json({ error: 'Missing storagePath' }, { status: 400 })
  }

  const { data: existingProfile, error: profileErr } = await supabase
    .from('profiles')
    .select('avatar_path')
    .eq('id', user.id)
    .maybeSingle<{ avatar_path: string | null }>()

  if (profileErr) {
    console.error('[avatar/confirm] Profile load error:', profileErr)
    return NextResponse.json({ error: 'Failed to load current avatar' }, { status: 500 })
  }

  const previousAvatarPath = existingProfile?.avatar_path ?? null

  const { error } = await supabase
    .from('profiles')
    .update({ avatar_path: storagePath })
    .eq('id', user.id)

  if (error) {
    console.error('[avatar/confirm] DB update error:', error)
    return NextResponse.json({ error: 'Failed to update avatar' }, { status: 500 })
  }

  if (previousAvatarPath && previousAvatarPath !== storagePath) {
    const { error: removeErr } = await supabase.storage
      .from('profile-pictures')
      .remove([previousAvatarPath])

    if (removeErr) {
      console.warn('[avatar/confirm] Failed to remove previous avatar:', removeErr)
    }
  }

  return NextResponse.json({ success: true })
}
