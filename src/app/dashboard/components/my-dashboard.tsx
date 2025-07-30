
'use client';

import * as React from 'react';
import { Clock, Users, BarChartHorizontal, CalendarHeart } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { TimeEntry, User } from "@/lib/types";
import { MonthlyHoursChart } from "./monthly-chart";
import { format, isSameDay, differenceInCalendarDays, addDays, startOfYear, endOfYear, max, min, getDay, getDaysInMonth, startOfMonth, parseISO, isSameMonth, endOfMonth, isWithinInterval, getYear } from "date-fns";
import { useTimeTracking } from "@/app/dashboard/contexts/TimeTrackingContext";
import { useHolidays } from "../contexts/HolidaysContext";
import { useMembers } from '../contexts/MembersContext';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { cn } from '@/lib/utils';
import { useLanguage } from '../contexts/LanguageContext';
import { Skeleton } from '@/components/ui/skeleton';
import { LogTimeDialog, LogTimeFormValues } from './log-time-dialog';
import { DeleteTimeEntryDialog } from '../reports/components/delete-time-entry-dialog';
import { DayDetailsDialog } from '../reports/components/day-details-dialog';

export function MyDashboard() {
  const { t } = useLanguage();
  const { timeEntries, updateTimeEntry, deleteTimeEntry } = useTimeTracking();
  const { publicHolidays, customHolidays, holidayRequests, annualLeaveAllowance } = useHolidays();
  const { teamMembers } = useMembers();
  const { currentUser } = useAuth();
  const { isHolidaysNavVisible, isLoading: isSettingsLoading } = useSettings();

  const [editingEntry, setEditingEntry] = React.useState<TimeEntry | null>(null);
  const [deletingEntry, setDeletingEntry] = React.useState<TimeEntry | null>(null);
  const [isDetailsDialogOpen, setIsDetailsDialogOpen] = React.useState(false);
  const [selectedDayEntries, setSelectedDayEntries] = React.useState<TimeEntry[]>([]);
  const [selectedDayForDialog, setSelectedDayForDialog] = React.useState<Date>(new Date());
  
  if (!currentUser) return null; // Should not happen if AuthProvider works correctly

  const calculateDurationInWorkdays = React.useCallback((startDate: Date, endDate: Date, userId: string): number => {
    let workdays = 0;
    const user = teamMembers.find(u => u.id === userId);
    if (!user) return 0;

    for (let dt = new Date(startDate); dt <= new Date(endDate); dt = addDays(dt, 1)) {
        const dayOfWeek = dt.getDay();
        if (dayOfWeek === 0 || dayOfWeek === 6) continue;

        const isPublic = publicHolidays.some(h => isSameDay(new Date(h.date), dt));
        if (isPublic) continue;

        const isCustom = customHolidays.some(h => {
            const applies = (h.appliesTo === 'all-members') ||
                            (h.appliesTo === 'all-teams' && !!user.teamId) ||
                            (h.appliesTo === user.teamId);
            return applies && isSameDay(new Date(h.date), dt);
        });
        if (isCustom) continue;
        
        workdays++;
    }
    return workdays;
  }, [publicHolidays, customHolidays, teamMembers]);

  const getProratedAllowance = React.useCallback((user: User) => {
    const parseDateStringAsLocal = (dateString: string): Date => {
        const [year, month, day] = dateString.split('-').map(Number);
        return new Date(year, month - 1, day);
    };

    const { startDate, endDate } = user.contract;
    const today = new Date();
    const yearStart = startOfYear(today);
    const yearEnd = endOfYear(today);
    
    // Use the user's primary contract to determine the prorata basis,
    // assuming it represents their main employment span.
    const contractStart = parseDateStringAsLocal(startDate);
    const contractEnd = endDate ? parseDateStringAsLocal(endDate) : yearEnd;

    const effectiveStartDate = max([yearStart, contractStart]);
    const effectiveEndDate = min([yearEnd, contractEnd]);

    if (effectiveStartDate > effectiveEndDate) {
        return 0;
    }

    const daysInYear = differenceInCalendarDays(yearEnd, yearStart) + 1;
    const contractDurationInYear = differenceInCalendarDays(effectiveEndDate, effectiveStartDate) + 1;
    
    const prorated = (annualLeaveAllowance / daysInYear) * contractDurationInYear;
    
    return prorated;
  }, [annualLeaveAllowance]);

  const userAllowance = getProratedAllowance(currentUser);

  const { totalHours, expectedHoursSoFar, overtime, takenDays, remainingDays } = React.useMemo(() => {
    const today = new Date();
    const currentYear = today.getFullYear();
    const periodStart = startOfMonth(today);
    const periodEnd = endOfMonth(today);

    // --- Start: Accurate Calculation Logic from Reports ---
    const publicHolidaysInYear = publicHolidays.filter(h => getYear(parseISO(h.date)) === currentYear);
    
    // Determine a standard number of workdays in the year for proration
    const yearStart = startOfYear(new Date(currentYear, 0, 1));
    const yearEnd = endOfYear(new Date(currentYear, 11, 31));
    let standardWorkingDaysInYear = 0;
    for (let d = new Date(yearStart); d <= yearEnd; d = addDays(d,1)) {
        const dayOfWeek = getDay(d);
        if (dayOfWeek === 0 || dayOfWeek === 6) continue;
        const isPublicHoliday = publicHolidaysInYear.some(h => isSameDay(parseISO(h.date), d));
        if (isPublicHoliday) continue;
        standardWorkingDaysInYear++;
    }

    const dailyLeaveCredit = standardWorkingDaysInYear > 0 ? annualLeaveAllowance / standardWorkingDaysInYear : 0;
    
    // Now, calculate for the specific user and period
    const userHolidaysInYear = publicHolidaysInYear.concat(
      customHolidays.filter(h => {
        if (getYear(parseISO(h.date)) !== currentYear) return false;
        const applies = (h.appliesTo === 'all-members') || (h.appliesTo === 'all-teams' && !!currentUser.teamId) || (h.appliesTo === currentUser.teamId);
        return applies;
      })
    );

    let assignedHoursInPeriod = 0;
    let workingDaysInPeriod = 0;

    for (let d = new Date(periodStart); d <= periodEnd; d = addDays(d, 1)) {
        const dayOfWeek = getDay(d);
        if (dayOfWeek === 0 || dayOfWeek === 6) continue;
        
        const isHoliday = userHolidaysInYear.some(h => isSameDay(parseISO(h.date), d));
        if (isHoliday) continue;
        
        const activeContractsOnDay = currentUser.contracts.filter(c => {
            const contractStart = parseISO(c.startDate);
            const contractEnd = c.endDate ? parseISO(c.endDate) : yearEnd;
            return isWithinInterval(d, { start: contractStart, end: contractEnd });
        });

        if (activeContractsOnDay.length > 0) {
            workingDaysInPeriod++;
            const dailyHours = activeContractsOnDay.reduce((sum, c) => sum + c.weeklyHours, 0) / 5;
            assignedHoursInPeriod += dailyHours;
        }
    }
    const assignedHours = parseFloat(assignedHoursInPeriod.toFixed(2));
    
    const avgDailyHoursInPeriod = workingDaysInPeriod > 0 ? assignedHours / workingDaysInPeriod : 0;
    const leaveDaysInPeriod = workingDaysInPeriod * dailyLeaveCredit;
    const leaveHours = parseFloat((leaveDaysInPeriod * avgDailyHoursInPeriod).toFixed(2));
    
    const expectedHours = parseFloat((assignedHours - leaveHours).toFixed(2));

    // Calculate Logged Hours for the month so far
    const userTimeEntries = timeEntries.filter(entry => {
        const entryDate = new Date(entry.date);
        return entry.userId === currentUser.id && isSameMonth(entryDate, today);
    });
    const totalHours = userTimeEntries.reduce((acc, entry) => acc + entry.duration, 0);

    // Calculate Overtime so far
    let workDaysSoFar = 0;
    let assignedHoursSoFar = 0;
    for (let d = new Date(periodStart); d <= today; d = addDays(d, 1)) {
        const dayOfWeek = getDay(d);
        if (dayOfWeek === 0 || dayOfWeek === 6) continue;
        const isHoliday = userHolidaysInYear.some(h => isSameDay(parseISO(h.date), d));
        if (!isHoliday) {
            workDaysSoFar++;
             const activeContractsOnDay = currentUser.contracts.filter(c => {
                const contractStart = parseISO(c.startDate);
                const contractEnd = c.endDate ? parseISO(c.endDate) : yearEnd;
                return isWithinInterval(d, { start: contractStart, end: contractEnd });
            });
            if (activeContractsOnDay.length > 0) {
                const dailyHours = activeContractsOnDay.reduce((sum, c) => sum + c.weeklyHours, 0) / 5;
                assignedHoursSoFar += dailyHours;
            }
        }
    }
    
    const avgDailyHoursSoFar = workDaysSoFar > 0 ? assignedHoursSoFar / workDaysSoFar : 0;
    const leaveDaysSoFar = workDaysSoFar * dailyLeaveCredit;
    const leaveHoursSoFar = leaveDaysSoFar * avgDailyHoursSoFar;
    const expectedHoursSoFar = parseFloat((assignedHoursSoFar - leaveHoursSoFar).toFixed(2));
    const overtime = totalHours - expectedHoursSoFar;

    // Calculate Holiday Days Taken
    const takenDays = holidayRequests
      .filter(req => req.userId === currentUser.id && req.status === 'Approved')
      .reduce((acc, req) => acc + calculateDurationInWorkdays(new Date(req.startDate), new Date(req.endDate), req.userId), 0);

    const remainingDays = userAllowance - takenDays;

    return { totalHours, expectedHoursSoFar, overtime, takenDays, remainingDays };
  }, [timeEntries, publicHolidays, customHolidays, holidayRequests, userAllowance, currentUser, getProratedAllowance, annualLeaveAllowance, calculateDurationInWorkdays]);

  const upcomingHolidays = React.useMemo(() => {
    const today = new Date();
    today.setHours(0,0,0,0);
    return publicHolidays
      .map(h => ({...h, dateObj: parseISO(h.date)}))
      .filter(h => h.dateObj >= today)
      .sort((a,b) => a.dateObj.getTime() - b.dateObj.getTime())
      .slice(0,3);
  }, [publicHolidays]);

  const handleSaveEntry = async (data: LogTimeFormValues, entryId?: string) => {
    if (!entryId) return { success: false };
    return updateTimeEntry(entryId, data, currentUser.id, teamMembers);
  };

  const handleDeleteConfirm = async () => {
    if (!deletingEntry) return;
    await deleteTimeEntry(deletingEntry.id);
    setDeletingEntry(null);
    setIsDetailsDialogOpen(false); // Also close day details dialog
  };

  const handleRowDoubleClick = (entry: TimeEntry) => {
    const entryDate = new Date(entry.date);
    const entriesForDay = timeEntries.filter(e =>
      e.userId === currentUser.id && isSameDay(new Date(e.date), entryDate)
    );
    setSelectedDayEntries(entriesForDay);
    setSelectedDayForDialog(entryDate);
    setIsDetailsDialogOpen(true);
  };

  return (
    <>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
          <div>
            <h1 className="text-3xl font-bold font-headline">{t('welcome', { name: currentUser.name })}</h1>
            <p className="text-muted-foreground">{t('welcomeSubtitle')}</p>
          </div>
        </div>

        <div className={cn("grid gap-4 md:grid-cols-2", isHolidaysNavVisible ? "lg:grid-cols-4" : "lg:grid-cols-3")}>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t('hoursThisMonth')}</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalHours.toFixed(2)}h</div>
              <p className="text-xs text-muted-foreground">
                {t('outOfExpected', { hours: expectedHoursSoFar.toFixed(2) })} Till Date
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t('overtime')}</CardTitle>
              <BarChartHorizontal className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${overtime < 0 ? 'text-destructive' : ''}`}>
                {overtime >= 0 ? '+' : ''}{overtime.toFixed(2)}h
              </div>
              <p className="text-xs text-muted-foreground">
                {t('basedOnContract', { hours: currentUser.contract.weeklyHours })}
              </p>
            </CardContent>
          </Card>
          <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm font-medium">
                  {t('upcomingPublicHolidays')}
                  </CardTitle>
                  <CalendarHeart className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                  <div className="space-y-2">
                  {upcomingHolidays.length > 0 ? (
                      upcomingHolidays.map(holiday => (
                      <div key={holiday.id} className="flex justify-between items-center text-xs">
                          <p className="font-medium">{holiday.name}</p>
                          <p className="text-muted-foreground">{format(holiday.dateObj, 'PP')}</p>
                      </div>
                      ))
                  ) : (
                      <p className="text-sm text-muted-foreground text-center py-2">
                      {t('noUpcomingPublicHolidays')}
                      </p>
                  )}
                  </div>
              </CardContent>
          </Card>
          {isSettingsLoading ? (
              <Skeleton className="h-full w-full" />
          ) : isHolidaysNavVisible ? (
              <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">{t('holidaysTaken')}</CardTitle>
                      <Users className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                      <div className="text-2xl font-bold">{t('daysCount', { count: takenDays })}</div>
                      <p className="text-xs text-muted-foreground">
                      {t('daysRemaining', { count: remainingDays.toFixed(2) })}
                      </p>
                  </CardContent>
              </Card>
          ) : null}
        </div>

        <div className="grid gap-6 lg:grid-cols-5">
          <div className="lg:col-span-3">
              <MonthlyHoursChart />
          </div>
          <div className="lg:col-span-2 flex">
              <Card className="flex-grow flex flex-col">
                <CardHeader>
                    <CardTitle>{t('recentTimeEntries')}</CardTitle>
                </CardHeader>
                <CardContent className="flex-grow">
                    <Table>
                      <TableHeader>
                          <TableRow>
                          <TableHead>{t('date')}</TableHead>
                          <TableHead>{t('task')}</TableHead>
                          <TableHead className="text-right">{t('duration')}</TableHead>
                          </TableRow>
                      </TableHeader>
                      <TableBody>
                          {timeEntries.filter(e => e.userId === currentUser.id).slice(0, 5).map(entry => (
                          <TableRow key={entry.id} onDoubleClick={() => handleRowDoubleClick(entry)} className="cursor-pointer">
                              <TableCell>{format(new Date(entry.date), 'PP')}</TableCell>
                              <TableCell className="font-medium truncate max-w-[120px]">{entry.task}</TableCell>
                              <TableCell className="text-right">{entry.duration.toFixed(2)}h</TableCell>
                          </TableRow>
                          ))}
                          {timeEntries.filter(e => e.userId === currentUser.id).length === 0 && (
                              <TableRow>
                                  <TableCell colSpan={3} className="h-24 text-center">{t('noRecentEntries')}</TableCell>
                              </TableRow>
                          )}
                      </TableBody>
                    </Table>
                </CardContent>
              </Card>
          </div>
        </div>
      </div>
      
       <DayDetailsDialog 
        isOpen={isDetailsDialogOpen}
        onOpenChange={setIsDetailsDialogOpen}
        date={selectedDayForDialog}
        entries={selectedDayEntries}
        canEdit={true}
        onEdit={(entry) => {
            setIsDetailsDialogOpen(false);
            setEditingEntry(entry);
        }}
        onDelete={(entry) => setDeletingEntry(entry)}
      />

      {editingEntry && (
        <LogTimeDialog
          isOpen={!!editingEntry}
          onOpenChange={() => setEditingEntry(null)}
          onSave={handleSaveEntry}
          entryToEdit={editingEntry}
          userId={currentUser.id}
        />
      )}
      
      {deletingEntry && (
        <DeleteTimeEntryDialog
            isOpen={!!deletingEntry}
            onOpenChange={() => setDeletingEntry(null)}
            onConfirm={handleDeleteConfirm}
            entry={deletingEntry}
        />
      )}
    </>
  )
}
