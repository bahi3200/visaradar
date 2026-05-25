# Security CI Gate

يقوم workflow `security-scan.yml` بفحص كل Pull Request ويمنع الدمج عند وجود أي Finding جديد متعلق بـ **RLS** أو **Realtime**.

## ما يتم فحصه تلقائيًا

1. **جداول جديدة بدون RLS** — أي `CREATE TABLE public.*` غير مصحوب بـ `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` يُرفض.
2. **سياسات متساهلة** — أي `USING (true)` أو `WITH CHECK (true)` يُرفض ما لم تحتوي الميجريشن على تعليق:
   ```sql
   -- security: public-ok
   ```
3. **تغييرات Realtime publication** — أي `ALTER PUBLICATION supabase_realtime ADD TABLE` يجب أن يحمل تعليق:
   ```sql
   -- realtime: reviewed
   ```
4. **تعديل schemas محجوزة** (`auth`, `storage`, `realtime`, `vault`, `supabase_functions`) يُرفض إلا في الحالة المعتمدة:
   - سياسات `realtime.messages` المعتمدة على `has_role(auth.uid(), 'admin')`.
5. **Supabase Linter** — يتم تشغيل `supabase db lint` ورفض أي finding يحوي كلمات `rls` / `policy` / `realtime`.

## الإعداد المطلوب لمرة واحدة

أضف هذه الأسرار في **GitHub → Settings → Secrets and variables → Actions**:

| Secret | القيمة |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | توكن شخصي من https://supabase.com/dashboard/account/tokens |
| `SUPABASE_PROJECT_REF` | `frhrvkzkihxaopnsznrj` |

ثم في **GitHub → Settings → Branches → Branch protection rule** لـ `main`:
- ✅ Require status checks to pass
- اختر check: **`Security gate`**
- ✅ Require branches to be up to date before merging

بهذا يُمنع الدمج تلقائيًا عند ظهور أي Finding جديد.