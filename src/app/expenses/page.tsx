import { requireAdmin } from '@/app/lib/domain-access';
import { listExpenses } from '@/app/actions/expenses';
import ExpensesClient from './ExpensesClient';

export default async function ExpensesPage() {
  await requireAdmin();
  const expenses = await listExpenses();

  return <ExpensesClient initialExpenses={expenses} />;
}
