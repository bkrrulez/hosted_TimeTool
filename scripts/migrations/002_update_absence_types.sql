-- First, remove the old constraint
ALTER TABLE public.absences DROP CONSTRAINT absences_type_check;

-- Then, add the new constraint with the updated values
ALTER TABLE public.absences ADD CONSTRAINT absences_type_check 
CHECK (type = ANY (ARRAY['General Absence'::text, 'Sick Leave'::text, 'In Office'::text, 'Home Office'::text]));
