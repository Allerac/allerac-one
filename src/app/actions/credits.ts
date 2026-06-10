'use server';

import { requireCurrentUser } from '@/app/lib/auth-session';
import { CreditService, type CreditBalance } from '@/app/services/credits/credit.service';

const creditService = new CreditService();

export async function getMyCreditBalance(): Promise<CreditBalance> {
  const user = await requireCurrentUser();
  return creditService.getBalance(user.id);
}
