import { requireAdmin } from '@/app/lib/domain-access';
import { listExpenses } from '@/app/actions/expenses';
import { listTaxFilings } from '@/app/actions/taxFilings';
import ExpensesClient from './ExpensesClient';

export default async function ExpensesPage() {
  await requireAdmin();
  const [expenses, taxFilings] = await Promise.all([listExpenses(), listTaxFilings()]);

  return <ExpensesClient initialExpenses={expenses} initialTaxFilings={taxFilings} />;
}
