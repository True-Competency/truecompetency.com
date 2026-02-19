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

  // Users can only update their own avatar — .eq('id', user.id) enforces this
  const { error } = await supabase
    .from('profiles')
    .update({ avatar_path: storagePath })
    .eq('id', user.id)

  if (error) {
    console.error('[avatar/confirm] DB update error:', error)
    return NextResponse.json({ error: 'Failed to update avatar' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}