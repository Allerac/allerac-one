from typing import List, Dict, Optional
from app.services.database import get_supabase
from app.services.llm_service import llm_service


class MemoryService:
    """Service for managing conversation memories."""
    
    def __init__(self):
        self.supabase = get_supabase()
    
    async def create_memory(
        self,
        conversation_id: str,
        user_id: str,
        content: str,
        emotion: Optional[str] = None
    ) -> Dict:
        """Creates a new memory."""
        # Generate content embedding
        embedding = await llm_service.generate_embedding(content)
        
        # Inserir no Supabase
        result = self.supabase.table("conversation_summaries").insert({
            "conversation_id": conversation_id,
            "user_id": user_id,
            "summary": content,
            "emotion": emotion,
            "embedding": embedding
        }).execute()
        
        return result.data[0]
    
    async def search_memories(
        self,
        user_id: str,
        query: str,
        limit: int = 5
    ) -> List[Dict]:
        """Busca memórias semanticamente."""
        # Gerar embedding da query
        query_embedding = await llm_service.generate_embedding(query)
        
        # Buscar memórias similares usando pgvector
        # TODO: Implementar RPC call para match_conversation_summaries
        result = self.supabase.rpc(
            "match_conversation_summaries",
            {
                "query_embedding": query_embedding,
                "match_threshold": 0.7,
                "match_count": limit,
                "filter_user_id": user_id
            }
        ).execute()
        
        return result.data
    
    async def get_conversation_memories(
        self,
        conversation_id: str
    ) -> List[Dict]:
        """Gets all memories from a conversation."""
        result = self.supabase.table("conversation_summaries")\
            .select("*")\
            .eq("conversation_id", conversation_id)\
            .order("created_at", desc=True)\
            .execute()
        
        return result.data
    
    async def delete_memory(self, memory_id: str) -> None:
        """Deletes a memory."""
        self.supabase.table("conversation_summaries")\
            .delete()\
            .eq("id", memory_id)\
            .execute()


# Global service instance
memory_service = MemoryService()
