
'use client';

import * as React from 'react';
import type { TimeEntry, User } from "@/lib/types";
import { format, isWithinInterval, parseISO } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import type { LogTimeFormValues } from '../components/log-time-dialog';
import { useSystemLog } from './SystemLogContext';
import { useAuth } from './AuthContext';
import { getTimeEntries, logTime as logTimeAction, updateTimeEntry as updateTimeEntryAction, deleteTimeEntry as deleteTimeEntryAction, deleteAbsencesInRange } from '../actions';
import { useRoster } from './RosterContext';

interface TimeTrackingContextType {
  timeEntries: TimeEntry[];
  logTime: (data: LogTimeFormValues, userId: string, allUsers: User[]) => Promise<{ success: boolean }>;
  updateTimeEntry: (entryId: string, data: Omit<LogTimeFormValues, 'userId'>, userId: string, allUsers: User[]) => Promise<{ success: boolean }>;
  deleteTimeEntry: (entryId: string) => Promise<{ success: boolean }>;
  isLoading: boolean;
}

export const TimeTrackingContext = React.createContext<TimeTrackingContextType | undefined>(undefined);

export function TimeTrackingProvider({ children }: { children: React.ReactNode }) {
  const [timeEntries, setTimeEntries] = React.useState<TimeEntry[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const { toast } = useToast();
  const { logAction } = useSystemLog();
  const { currentUser } = useAuth();
  const { absences, fetchRosterData } = useRoster();
  
  const fetchEntries = React.useCallback(async () => {
    setIsLoading(true);
    try {
        const entries = await getTimeEntries();
        setTimeEntries(entries);
    } catch (error) {
        console.error("Failed to fetch time entries", error);
    } finally {
        setIsLoading(false);
    }
  }, []);
  
  React.useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  const logTime = async (data: LogTimeFormValues, userId: string, allUsers: User[]): Promise<{ success: boolean }> => {
    try {
      const start = new Date(`1970-01-01T${data.startTime}`);
      const end = new Date(`1970-01-01T${data.endTime}`);
      const duration = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
      const dateStr = format(data.date, 'yyyy-MM-dd');

      if (duration < 0) {
        toast({
          variant: 'destructive',
          title: 'Invalid Time',
          description: 'End time cannot be earlier than start time.',
        });
        return { success: false };
      }

      // Automatically clear any absence on the day work is being logged
      await deleteAbsencesInRange(userId, dateStr, dateStr, true);
      await fetchRosterData();

      const targetUser = allUsers.find(u => u.id === userId);
      if (targetUser && targetUser.contracts.length > 0) {
        const selectedDate = data.date;
        const isDateInContract = targetUser.contracts.some(contract => {
            const contractStart = parseISO(contract.startDate);
            const contractEnd = contract.endDate ? parseISO(contract.endDate) : new Date('9999-12-31');
            return isWithinInterval(selectedDate, { start: contractStart, end: contractEnd });
        });

        if (!isDateInContract) {
            toast({
                variant: 'destructive',
                title: 'Date Out of Range',
                description: "Selected date is not within the range of user's contract. Please check again.",
            });
            return { success: false };
        }
      }

      const newEntryData = {
        userId: userId,
        date: dateStr,
        startTime: data.startTime,
        endTime: data.endTime,
        projectId: data.project,
        taskId: data.task,
        placeOfWork: data.placeOfWork,
        remarks: data.remarks,
      };

      const newEntry = await logTimeAction(newEntryData);

      if (newEntry) {
        setTimeEntries(prev => [newEntry, ...prev].sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
        toast({
            title: "Time Logged Successfully",
            description: `Logged ${newEntry.duration.toFixed(2)} hours for ${format(new Date(newEntry.date), 'PPP')}.`
        });
        const logMessage = currentUser.id === userId 
            ? `User '${currentUser.name}' logged ${newEntry.duration.toFixed(2)} hours.`
            : `User '${currentUser.name}' logged ${newEntry.duration.toFixed(2)} hours on behalf of '${targetUser?.name || 'Unknown User'}'.`;
        await logAction(logMessage);
        return { success: true };
      }
      return { success: false };
    } catch (error) {
      console.error("Failed to log time:", error);
      toast({
        variant: 'destructive',
        title: "Error",
        description: "Failed to log time.",
      });
      return { success: false };
    }
  };

  const updateTimeEntry = async (entryId: string, data: Omit<LogTimeFormValues, 'userId'>, userId: string, allUsers: User[]): Promise<{ success: boolean }> => {
    try {
      const updatedEntryData = {
        userId: userId,
        date: format(data.date, 'yyyy-MM-dd'),
        startTime: data.startTime,
        endTime: data.endTime,
        projectId: data.project,
        taskId: data.task,
        placeOfWork: data.placeOfWork,
        remarks: data.remarks,
      };
      
      const updatedEntry = await updateTimeEntryAction(entryId, updatedEntryData);
      
      if (updatedEntry) {
        setTimeEntries(prev => prev.map(e => e.id === entryId ? updatedEntry : e));
        toast({
            title: "Time Entry Updated",
            description: `Entry for ${format(new Date(updatedEntry.date), 'PPP')} has been updated.`
        });
        const targetUser = allUsers.find(u => u.id === userId);
        await logAction(`User '${currentUser.name}' updated a time entry for '${targetUser?.name || userId}'.`);
        return { success: true };
      }
      return { success: false };
    } catch (error) {
      console.error("Failed to update time entry:", error);
      toast({
        variant: 'destructive',
        title: "Error",
        description: "Failed to update time entry.",
      });
      return { success: false };
    }
  };

  const deleteTimeEntry = async (entryId: string): Promise<{ success: boolean }> => {
    try {
        await deleteTimeEntryAction(entryId);
        setTimeEntries(prev => prev.filter(e => e.id !== entryId));
        toast({
            title: "Time Entry Deleted",
            description: "The time entry has been successfully deleted."
        });
        await logAction(`User '${currentUser.name}' deleted time entry ${entryId}.`);
        return { success: true };
    } catch (error) {
        console.error("Failed to delete time entry:", error);
        toast({
            variant: 'destructive',
            title: "Error",
            description: "Failed to delete time entry.",
        });
        return { success: false };
    }
  };
  
  return (
    <TimeTrackingContext.Provider value={{ timeEntries, logTime, updateTimeEntry, deleteTimeEntry, isLoading }}>
        {children}
    </TimeTrackingContext.Provider>
  )
}

export const useTimeTracking = () => {
  const context = React.useContext(TimeTrackingContext);
  if (!context) {
    throw new Error("useTimeTracking must be used within a TimeTrackingProvider");
  }
  return context;
};
