UPDATE conversation_summaries
SET domain_slug = 'write'
WHERE domain_slug = 'content';

UPDATE documents
SET domain_slug = 'write'
WHERE domain_slug = 'content';
