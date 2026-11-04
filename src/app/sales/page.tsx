import { permanentRedirect } from 'next/navigation';

// The public website chatbot domain was renamed from 'sales' to 'alleracweb'.
// Keep old links working.
export default function LegacySalesPage(): never {
  permanentRedirect('/alleracweb');
}
