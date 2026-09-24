-- A late payment.captured / order.paid webhook for an order that has already
-- been refunded must not add the coins again.
do $$
declare
  def text := pg_get_functiondef('public.fulfill_payment_order(text,text)'::regprocedure);
  new_def text;
begin
  new_def := replace(def, 'if v_order.status = ''paid'' then', 'if v_order.status in (''paid'', ''refunded'') then');
  if new_def = def then raise exception 'status check not found'; end if;
  execute new_def;
end $$;
