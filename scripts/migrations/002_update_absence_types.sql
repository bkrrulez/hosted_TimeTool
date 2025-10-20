-- Drop the existing constraint
ALTER TABLE public.absences DROP CONSTRAINT absences_type_check;

-- Add the new constraint with the additional types
ALTER TABLE public.absences ADD CONSTRAINT absences_type_check CHECK (type = ANY (ARRAY['General Absence'::text, 'Sick Leave'::text, 'In Office'::text, 'Home Office'::text]));
