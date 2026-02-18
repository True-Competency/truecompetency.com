import { getSupabaseServer } from '@/lib/supabaseServer'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const supabase = await getSupabaseServer()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { storagePath, fileName, mimeType, fileSize, stageId, questionId } = body

  if (!storagePath || !fileName || !mimeType || !fileSize) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Derive file type from MIME — determines how frontend renders it
  const fileType = mimeType.startsWith('video/') ? 'video' : 'image'

  // Persist the metadata record — the actual file is already in Storage at this point
  const { data, error } = await supabase
    .from('question_media')
    .insert({
      question_id: questionId ?? null,
      stage_id: stageId ?? null,
      uploaded_by: user.id,
      storage_path: storagePath,
      file_name: fileName,
      file_type: fileType,
      mime_type: mimeType,
      file_size: fileSize,
    })
    .select('id')
    .single()

  if (error) {
    console.error('[upload/confirm] DB insert error:', error)
    return NextResponse.json({ error: 'Failed to save file metadata' }, { status: 500 })
  }

  return NextResponse.json({ mediaId: data.id })
}