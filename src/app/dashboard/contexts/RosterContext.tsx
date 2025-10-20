
'use client';

import * as React from 'react';
import { type Absence } from "@/lib/types";
import { addAbsence as addAbsenceAction, getAbsences, deleteAbsencesInRange as deleteAbsencesInRangeAction } from '../actions';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

export type AbsenceType = 'General Absence' | 'Sick Leave' | 'Clear Absence/ Work';

interface RosterContextType {
  absences: Absence[];
  addAbsence: (absence: Omit<Absence, 'id'>, force?: boolean) => Promise<void>;
  deleteAbsencesInRange: (userId: string, startDate: string, endDate: string, quiet?: boolean) => Promise<void>;
  fetchRosterData: () => Promise<void>;
}

const RosterContext = React.createContext<RosterContextType | undefined>(undefined);

export function RosterProvider({ children }: { children: React.ReactNode }) {
  const [absences, setAbsences] = React.useState<Absence[]>([]);
  const { toast } = useToast();

  const fetchRosterData = React.useCallback(async () => {
      try {
        const fetchedAbsences = await getAbsences();
        setAbsences(fetchedAbsences);
      } catch (error) {
        console.error("Failed to fetch absences:", error);
      }
    }, []);

  React.useEffect(() => {
    fetchRosterData();
  }, [fetchRosterData]);

  const addAbsence = async (absence: Omit<Absence, 'id'>, force: boolean = false) => {
    // Before adding, clear any existing absences in the same range if forcing
    if (force) {
        await deleteAbsencesInRangeAction(absence.userId, absence.startDate, absence.endDate, true);
    }
    
    const newAbsence = await addAbsenceAction(absence);
    if (newAbsence) {
      await fetchRosterData();
      toast({ title: 'Absence Marked', description: 'The absence has been successfully recorded.' });
    } else {
        toast({ variant: 'destructive', title: 'Error', description: 'Could not mark absence.' });
    }
  };
  
  const deleteAbsencesInRange = async (userId: string, startDate: string, endDate: string, quiet: boolean = false) => {
    const deletedCount = await deleteAbsencesInRangeAction(userId, startDate, endDate);
    if (deletedCount > 0) {
        await fetchRosterData();
        if (!quiet) {
            toast({ title: 'Absence Cleared', description: `The absence record(s) in the selected range have been cleared.` });
        }
    } else {
        if (!quiet) {
            toast({ variant: 'default', title: 'No Absences Found', description: 'No absences were found in the selected range to clear.' });
        }
    }
  }

  return (
    <RosterContext.Provider value={{ absences, addAbsence, deleteAbsencesInRange, fetchRosterData }}>
      {children}
    </RosterContext.Provider>
  );
}

export const useRoster = () => {
  const context = React.useContext(RosterContext);
  if (!context) {
    throw new Error('useRoster must be used within a RosterProvider');
  }
  return context;
};
