import { getSupabaseServer } from '@/lib/supabaseServer'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ fileId: string }> }  // params is now a Promise in Next.js 15+
) {
  const { fileId } = await params  // must be awaited
  
  const supabase = await getSupabaseServer()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: media, error: mediaError } = await supabase
    .from('question_media')
    .select('storage_path')
    .eq('id', fileId)  // using awaited fileId directly
    .single()

  if (mediaError || !media) {
    return NextResponse.json({ error: 'Media not found' }, { status: 404 })
  }

  const { data, error } = await supabase.storage
    .from('question-media')
    .createSignedUrl(media.storage_path, 3600)

  if (error) {
    console.error('[media/fileId] Signed URL error:', error)
    return NextResponse.json({ error: 'Failed to generate download URL' }, { status: 500 })
  }

  return NextResponse.json({ url: data.signedUrl })
}