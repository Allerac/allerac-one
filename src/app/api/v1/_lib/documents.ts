export function documentDto(row: any) {
  return {
    id: row.id,
    filename: row.filename,
    fileType: row.file_type,
    fileSize: row.file_size,
    domainSlug: row.domain_slug ?? null,
    status: row.status,
    errorMessage: row.error_message ?? null,
    uploadedAt: row.uploaded_at,
  };
}
