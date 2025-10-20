-- First, remove the existing constraint from the 'absences' table.
ALTER TABLE absences DROP CONSTRAINT IF EXISTS absences_type_check;

-- Then, add a new constraint that includes the 'In Office' and 'Home Office' types.
ALTER TABLE absences ADD CONSTRAINT absences_type_check 
CHECK (type = ANY (ARRAY['General Absence'::text, 'Sick Leave'::text, 'In Office'::text, 'Home Office'::text]));
