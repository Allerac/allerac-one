// Tickets are intentionally not a node type: they stay out of the knowledge graph.
export type KnowledgeNodeType = 'memory' | 'document' | 'note';
export type KnowledgeSourceType = 'conversation' | 'manual' | 'upload' | 'crawler' | 'note';
export type KnowledgeRelation =
  | 'same_domain' | 'same_source' | 'shared_topic'
  // Explicit, user-authored note relations.
  | 'links_to' | 'child_of';

export type KnowledgeEdgeProvenance = 'deterministic' | 'user';

export interface KnowledgeNode {
  id: string;
  sourceId: string;
  type: KnowledgeNodeType;
  sourceType: KnowledgeSourceType;
  label: string;
  summary: string | null;
  domainSlug: string | null;
  importance: number;
  status: string | null;
  topics: string[];
  canonicalUrl: string | null;
  chunkCount: number;
  hasEmbeddings: boolean;
  createdAt: string;
  updatedAt: string;
  metadata: Record<string, unknown>;
}

export interface KnowledgeEdge {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  relation: KnowledgeRelation;
  weight: number;
  provenance: KnowledgeEdgeProvenance;
  reason: string;
}

export interface KnowledgeGraph {
  nodes: KnowledgeNode[];
  edges: KnowledgeEdge[];
}
