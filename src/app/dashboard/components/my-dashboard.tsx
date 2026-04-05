
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
  
  if (!currentUser) return null;

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
    const today = new Date();
    const yearStart = startOfYear(today);
    const yearEnd = endOfYear(today);

    let daysWithActiveContract = 0;
    for (let d = yearStart; d <= yearEnd; d = addDays(d, 1)) {
        const isCovered = user.contracts.some(c => {
            const contractStart = parseISO(c.startDate);
            const contractEnd = c.endDate ? parseISO(c.endDate) : new Date('9999-12-31');
            return isWithinInterval(d, { start: contractStart, end: contractEnd });
        });
        if (isCovered) daysWithActiveContract++;
    }

    const daysInYear = differenceInCalendarDays(yearEnd, yearStart) + 1;
    return (annualLeaveAllowance / daysInYear) * daysWithActiveContract;
  }, [annualLeaveAllowance]);

  const userAllowance = getProratedAllowance(currentUser);

  const { totalHours, expectedHoursSoFar, overtime, takenVacationDays, takenSickDays, remainingDays } = React.useMemo(() => {
    const today = new Date();
    const currentYear = today.getFullYear();
    const periodStart = startOfMonth(today);
    const periodEnd = endOfMonth(today);

    const publicHolidaysInYear = publicHolidays.filter(h => getYear(parseISO(h.date)) === currentYear);
    const userHolidaysInYear = publicHolidaysInYear.concat(
      customHolidays.filter(h => {
        if (getYear(parseISO(h.date)) !== currentYear) return false;
        const applies = (h.appliesTo === 'all-members') || (h.appliesTo === 'all-teams' && !!currentUser.teamId) || (h.appliesTo === currentUser.teamId);
        return applies;
      })
    );

    let totalAssignedSoFar = 0;
    let totalLeaveSoFar = 0;

    for (let d = new Date(periodStart); d <= today; d = addDays(d, 1)) {
        const dayOfWeek = getDay(d);
        if (dayOfWeek === 0 || dayOfWeek === 6) continue;
        
        const isHoliday = userHolidaysInYear.some(h => isSameDay(parseISO(h.date), d));
        if (isHoliday) continue;
        
        const activeContractsOnDay = currentUser.contracts.filter(c => {
            const contractStart = parseISO(c.startDate);
            const contractEnd = c.endDate ? parseISO(c.endDate) : endOfYear(new Date(currentYear, 11, 31));
            return isWithinInterval(d, { start: contractStart, end: contractEnd });
        });

        if (activeContractsOnDay.length > 0) {
            const dailyHours = activeContractsOnDay.reduce((sum, c) => sum + c.weeklyHours, 0) / 5;
            totalAssignedSoFar += dailyHours;

            // Consumption model: check for approved leave
            const hasApprovedLeave = holidayRequests.some(req => 
                req.userId === currentUser.id && 
                req.status === 'Approved' &&
                (req.type === 'Vacation' || req.type === 'Sick Leave') &&
                isWithinInterval(d, { start: parseISO(req.startDate), end: parseISO(req.endDate) })
            );

            if (hasApprovedLeave) {
                totalLeaveSoFar += dailyHours;
            }
        }
    }
    
    const expectedHoursSoFar = parseFloat((totalAssignedSoFar - totalLeaveSoFar).toFixed(2));

    // Calculate Logged Hours for the month so far
    const userTimeEntries = timeEntries.filter(entry => {
        const entryDate = new Date(entry.date);
        return entry.userId === currentUser.id && isSameMonth(entryDate, today);
    });
    const totalHours = userTimeEntries.reduce((acc, entry) => acc + entry.duration, 0);
    const overtime = totalHours - expectedHoursSoFar;

    // Calculate Holiday Days Taken for balance card
    const takenVacationDays = holidayRequests
      .filter(req => req.userId === currentUser.id && req.status === 'Approved' && req.type === 'Vacation' && getYear(parseISO(req.startDate)) === currentYear)
      .reduce((acc, req) => acc + calculateDurationInWorkdays(new Date(req.startDate), new Date(req.endDate), req.userId), 0);

    const takenSickDays = holidayRequests
      .filter(req => req.userId === currentUser.id && req.status === 'Approved' && req.type === 'Sick Leave' && getYear(parseISO(req.startDate)) === currentYear)
      .reduce((acc, req) => acc + calculateDurationInWorkdays(new Date(req.startDate), new Date(req.endDate), req.userId), 0);

    const remainingDays = userAllowance - takenVacationDays;

    return { totalHours, expectedHoursSoFar, overtime, takenVacationDays, takenSickDays, remainingDays };
  }, [timeEntries, publicHolidays, customHolidays, holidayRequests, userAllowance, currentUser, annualLeaveAllowance, calculateDurationInWorkdays]);

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
    setIsDetailsDialogOpen(false);
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

  const currentYear = new Date().getFullYear();

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
                Out of {expectedHoursSoFar.toFixed(2)}h expected till date
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t('overtime')}</CardTitle>
              <BarChartHorizontal className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${overtime < 0 ? 'text-destructive' : 'text-green-600'}`}>
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
                      <CardTitle className="text-sm font-medium">{t('cardHolidaysTaken', { year: currentYear })}</CardTitle>
                      <Users className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent className="space-y-2">
                      <div>
                        <div className="text-2xl font-bold">{t('daysCount', { count: takenVacationDays })} {t('cardVacation')}</div>
                        <p className="text-xs text-muted-foreground">
                        {remainingDays.toFixed(2)} {t('cardRemaining')}
                        </p>
                      </div>
                      <div className="pt-2 border-t">
                        <div className="text-lg font-bold">{t('daysCount', { count: takenSickDays })} {t('cardSickLeave')}</div>
                      </div>
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
