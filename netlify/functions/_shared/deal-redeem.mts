// How a customer redeems a deal. Shared by the public Black Friday form,
// admin approval, and the owner dashboard so they all check the same way.

export type Redeem = { redeemMethod: 'show' | 'call' | 'link' | 'code'; redeemValue?: string; redeemNote?: string };

export function cleanRedeem(input: any): Redeem | { error: string } {
  const method = ['show', 'call', 'link', 'code'].includes(input?.redeemMethod) ? input.redeemMethod : 'show';
  let value = String(input?.redeemValue ?? '').trim().slice(0, 300);
  const note = String(input?.redeemNote ?? '').replace(/[<>]/g, '').trim().slice(0, 200);
  if (method === 'call') {
    const digits = value.replace(/\D/g, '');
    if (digits.length < 10) return { error: 'Enter the phone number customers should call to redeem.' };
    const d = digits.slice(-10);
    value = `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  }
  if (method === 'link') {
    if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
    try { const u = new URL(value); if (!u.hostname.includes('.')) throw 0; value = u.toString(); } catch { return { error: 'Enter the web address where customers redeem the deal.' }; }
  }
  if (method === 'code') {
    value = value.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 30);
    if (value.length < 2) return { error: 'Enter the promo code customers should use.' };
  }
  if (method === 'show') value = '';
  return { redeemMethod: method, ...(value ? { redeemValue: value } : {}), ...(note ? { redeemNote: note } : {}) };
}
