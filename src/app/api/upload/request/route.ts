import { getSupabaseServer } from '@/lib/supabaseServer'
import { NextRequest, NextResponse } from 'next/server'

// Allowed MIME types for question media uploads
const ALLOWED_MIME_TYPES = [
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'video/mp4', 'video/webm',
]
const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB

export async function POST(req: NextRequest) {
  const supabase = await getSupabaseServer()

  // Verify session
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Verify the user is a committee member — enforced server-side, never trust client
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'committee') {
    return NextResponse.json({ error: 'Forbidden: committee only' }, { status: 403 })
  }

  const body = await req.json()
  const { fileName, mimeType, fileSize, stageId, questionId } = body

  // Validate required fields
  if (!fileName || !mimeType || !fileSize) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Validate MIME type server-side — client declaration is never trusted alone
  if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
    return NextResponse.json({ error: 'File type not allowed' }, { status: 400 })
  }

  // Validate file size
  if (fileSize > MAX_FILE_SIZE) {
    return NextResponse.json({ error: 'File exceeds 50MB limit' }, { status: 400 })
  }

  // Exactly one parent must be provided — a file belongs to a question OR a stage, never both
  if ((!stageId && !questionId) || (stageId && questionId)) {
    return NextResponse.json({ error: 'Provide either stageId or questionId, not both' }, { status: 400 })
  }

  // Scoped storage path — parent ID as folder prevents cross-contamination
  const parentId = stageId ?? questionId
  const fileExt = fileName.split('.').pop()
  const fileId = crypto.randomUUID()
  const storagePath = `questions/${parentId}/${fileId}.${fileExt}`

  // Generate signed upload URL — client uploads directly to Supabase, never through this server
  // 60 seconds is enough time to initiate the upload
  const { data, error } = await supabase.storage
    .from('question-media')
    .createSignedUploadUrl(storagePath)

  if (error) {
    console.error('[upload/request] Signed URL error:', error)
    return NextResponse.json({ error: 'Failed to generate upload URL' }, { status: 500 })
  }

  return NextResponse.json({ signedUrl: data.signedUrl, storagePath, fileId })
}