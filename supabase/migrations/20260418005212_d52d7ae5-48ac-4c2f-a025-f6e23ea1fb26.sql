
INSERT INTO public.packages (name_ar, name_en, duration_months, price, max_countries, is_golden, is_active, sort_order, service_type, features_ar) VALUES
('باقة 3 أشهر', '3 Months', 3, 1500, 1, false, true, 1, 'both', ARRAY['تنبيه فوري عبر تليغرام','مراقبة 24/7','دولة واحدة']),
('باقة 6 أشهر', '6 Months', 6, 2800, 1, false, true, 2, 'both', ARRAY['تنبيه فوري عبر تليغرام','مراقبة 24/7','دولة واحدة','وفّر 8%']),
('باقة 12 شهر', '12 Months', 12, 5000, 1, false, true, 3, 'both', ARRAY['تنبيه فوري عبر تليغرام','مراقبة 24/7','دولة واحدة','وفّر 17%']),
('الباقة الذهبية', 'Golden', 12, 9000, 3, true, true, 4, 'both', ARRAY['تنبيه فوري عبر تليغرام','مراقبة 24/7','حتى 3 دول','أولوية الدعم','جميع المزايا']);
