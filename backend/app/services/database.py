from supabase import create_client, Client
from app.config import settings

# Global Supabase client
supabase: Client = create_client(
    settings.supabase_url,
    settings.supabase_service_key  # Using service key in backend for full access
)


def get_supabase() -> Client:
    """Returns Supabase client instance."""
    return supabase
