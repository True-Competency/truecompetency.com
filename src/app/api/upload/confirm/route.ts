import { getSupabaseServer } from '@/lib/supabaseServer'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  req: NextRequest,
  { params }: { params: { fileId: string } }
) {
  const supabase = await getSupabaseServer()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Look up the media record — RLS on question_media ensures user can only
  // fetch records they are allowed to see
  const { data: media, error: mediaError } = await supabase
    .from('question_media')
    .select('storage_path')
    .eq('id', params.fileId)
    .single()

  if (mediaError || !media) {
    return NextResponse.json({ error: 'Media not found' }, { status: 404 })
  }

  // Short-lived signed URL — private content should never have permanent public links
  const { data, error } = await supabase.storage
    .from('question-media')
    .createSignedUrl(media.storage_path, 3600) // 1 hour

  if (error) {
    console.error('[media/fileId] Signed URL error:', error)
    return NextResponse.json({ error: 'Failed to generate download URL' }, { status: 500 })
  }

  return NextResponse.json({ url: data.signedUrl })
}