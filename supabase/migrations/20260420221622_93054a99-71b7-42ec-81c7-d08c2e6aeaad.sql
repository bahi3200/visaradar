
-- Allow admins to manage packages (INSERT/UPDATE/DELETE)
CREATE POLICY "Admins can insert packages"
ON public.packages
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update packages"
ON public.packages
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete packages"
ON public.packages
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));
