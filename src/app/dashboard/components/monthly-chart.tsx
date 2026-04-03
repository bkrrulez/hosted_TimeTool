
"use client";

import * as React from "react";
import { Bar, BarChart as RechartsBarChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltipContent } from "@/components/ui/chart";
import { useTimeTracking } from "../contexts/TimeTrackingContext";
import { useAuth } from "../contexts/AuthContext";
import { useHolidays } from "../contexts/HolidaysContext";
import { getDate, getDaysInMonth, isSameDay, isSameMonth, parseISO, isWithinInterval } from "date-fns";
import type { TimeEntry } from "@/lib/types";
import { DayDetailsDialog } from "../reports/components/day-details-dialog";
import { LogTimeDialog, type LogTimeFormValues } from "./log-time-dialog";
import { DeleteTimeEntryDialog } from "../reports/components/delete-time-entry-dialog";
import { useMembers } from "../contexts/MembersContext";
import { useLanguage } from "../contexts/LanguageContext";


const chartConfig = {
  hours: {
    label: "Work Hours",
    color: "hsl(var(--primary))",
  },
  vacation: {
    label: "Vacation",
    color: "#fbbf24", // Yellow-400
  },
  sickLeave: {
    label: "Sick Leave",
    color: "#f97316", // Orange-500
  },
};

export function MonthlyHoursChart() {
  const { timeEntries, updateTimeEntry, deleteTimeEntry } = useTimeTracking();
  const { holidayRequests } = useHolidays();
  const { currentUser } = useAuth();
  const { teamMembers } = useMembers();
  const { t } = useLanguage();

  const [isDetailsDialogOpen, setIsDetailsDialogOpen] = React.useState(false);
  const [selectedDayEntries, setSelectedDayEntries] = React.useState<TimeEntry[]>([]);
  const [selectedDayForDialog, setSelectedDayForDialog] = React.useState<Date>(new Date());
  const [editingEntry, setEditingEntry] = React.useState<TimeEntry | null>(null);
  const [deletingEntry, setDeletingEntry] = React.useState<TimeEntry | null>(null);

  const chartData = React.useMemo(() => {
    if (!currentUser) return [];

    const today = new Date();
    const daysInMonth = getDaysInMonth(today);
    const dailyHours = currentUser.contract.weeklyHours / 5;

    const dailyStats = Array.from({ length: daysInMonth }, (_, i) => ({
        date: (i + 1).toString(),
        hours: 0,
        vacation: 0,
        sickLeave: 0,
    }));

    // Add Work Hours
    const userTimeEntries = timeEntries.filter(entry => {
        const entryDate = new Date(entry.date);
        return entry.userId === currentUser.id && isSameMonth(entryDate, today);
    });

    userTimeEntries.forEach(entry => {
        const dayOfMonth = getDate(new Date(entry.date));
        if (dailyStats[dayOfMonth - 1]) {
          dailyStats[dayOfMonth - 1].hours += entry.duration;
        }
    });

    // Add Vacation and Sick Leave
    const userLeaves = holidayRequests.filter(req => 
        req.userId === currentUser.id && 
        req.status === 'Approved' &&
        (isSameMonth(parseISO(req.startDate), today) || isSameMonth(parseISO(req.endDate), today))
    );

    userLeaves.forEach(req => {
        const start = parseISO(req.startDate);
        const end = parseISO(req.endDate);
        for (let d = new Date(start); d <= end; d = addDays(d, 1)) {
            if (isSameMonth(d, today)) {
                const day = d.getDate();
                if (dailyStats[day - 1]) {
                    if (req.type === 'Vacation') {
                        dailyStats[day - 1].vacation = dailyHours;
                    } else if (req.type === 'Sick Leave') {
                        dailyStats[day - 1].sickLeave = dailyHours;
                    }
                }
            }
        }
    });
    
    return dailyStats.map(d => ({
        ...d, 
        hours: parseFloat(d.hours.toFixed(2)),
        vacation: parseFloat(d.vacation.toFixed(2)),
        sickLeave: parseFloat(d.sickLeave.toFixed(2)),
    }));

  }, [timeEntries, holidayRequests, currentUser]);

  const handleBarDoubleClick = (data: any) => {
    if (!data || !data.activeLabel || !currentUser) return;

    const dayOfMonth = parseInt(data.activeLabel, 10);
    if (isNaN(dayOfMonth)) return;

    const today = new Date();
    const clickedDate = new Date(today.getFullYear(), today.getMonth(), dayOfMonth);

    const entriesForDay = timeEntries.filter(entry => 
        entry.userId === currentUser.id && 
        isSameDay(new Date(entry.date), clickedDate)
    );

    if (entriesForDay.length > 0) {
        setSelectedDayEntries(entriesForDay);
        setSelectedDayForDialog(clickedDate);
        setIsDetailsDialogOpen(true);
    }
  };

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

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{t('monthlyHours')}</CardTitle>
          <CardDescription>{t('monthlyHoursDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfig} className="h-[280px] w-full">
            <RechartsBarChart
              data={chartData}
              margin={{ top: 5, right: 20, left: -10, bottom: 5 }}
              accessibilityLayer
              onDoubleClick={handleBarDoubleClick}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
              />
              <YAxis
                unit="h"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
              />
              <Tooltip
                cursor={{ className: 'fill-muted' }}
                content={<ChartTooltipContent indicator="dot" />}
              />
              <Bar dataKey="hours" stackId="a" fill="var(--color-hours)" radius={[0, 0, 0, 0]} />
              <Bar dataKey="vacation" stackId="a" fill="var(--color-vacation)" radius={[0, 0, 0, 0]} />
              <Bar dataKey="sickLeave" stackId="a" fill="var(--color-sickLeave)" radius={[4, 4, 0, 0]} />
            </RechartsBarChart>
          </ChartContainer>
        </CardContent>
      </Card>

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
  );
}
