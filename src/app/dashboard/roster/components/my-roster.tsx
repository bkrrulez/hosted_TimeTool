
'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { useAuth } from '../../contexts/AuthContext';
import { useTimeTracking } from '../../contexts/TimeTrackingContext';
import { useHolidays } from '../../contexts/HolidaysContext';
import { useRoster, AbsenceType } from '../../contexts/RosterContext';
import { getDay, getYear, min, max, format, DayProps, isSameDay, addDays } from 'date-fns';
import { MarkAbsenceDialog } from './mark-absence-dialog';
import type { Absence } from '@/lib/types';
import { toast } from '@/hooks/use-toast';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';


const months = Array.from({ length: 12 }, (_, i) => ({
  value: i,
  label: new Date(0, i).toLocaleString('default', { month: 'long' }),
}));

export function MyRoster() {
    const { currentUser } = useAuth();
    const { timeEntries } = useTimeTracking();
    const { publicHolidays, customHolidays } = useHolidays();
    const { absences, addAbsence, deleteAbsencesInRange } = useRoster();

    const [selectedDate, setSelectedDate] = React.useState(new Date());
    const [isAbsenceDialogOpen, setIsAbsenceDialogOpen] = React.useState(false);
    const [editingAbsence, setEditingAbsence] = React.useState<Absence | null>(null);
    const [overwriteConfirmation, setOverwriteConfirmation] = React.useState<{ show: boolean, message: string, onConfirm: () => void }>({ show: false, message: '', onConfirm: () => {} });


    const { availableYears, minContractDate, maxContractDate } = React.useMemo(() => {
        if (!currentUser || !currentUser.contracts || currentUser.contracts.length === 0) {
            const currentYear = new Date().getFullYear();
            return { availableYears: [currentYear], minContractDate: null, maxContractDate: null };
        }
        const startDates = currentUser.contracts.map(c => new Date(c.startDate));
        const endDates = currentUser.contracts.map(c => c.endDate ? new Date(c.endDate) : new Date());

        const minDate = min(startDates);
        const maxDate = max(endDates);
        
        const startYear = getYear(minDate);
        const endYear = getYear(maxDate);

        const years = [];
        for (let i = endYear; i >= startYear; i--) {
            years.push(i);
        }
        return { availableYears: years, minContractDate: minDate, maxContractDate: maxDate };
    }, [currentUser]);

    const handleMonthChange = (month: string) => {
        setSelectedDate(new Date(selectedDate.getFullYear(), parseInt(month), 1));
    };

    const handleYearChange = (year: string) => {
        setSelectedDate(new Date(parseInt(year), selectedDate.getMonth(), 1));
    };
    
    const handlePrevMonth = () => {
        setSelectedDate(prevDate => new Date(prevDate.getFullYear(), prevDate.getMonth() - 1, 1));
    };

    const handleNextMonth = () => {
        setSelectedDate(prevDate => new Date(prevDate.getFullYear(), prevDate.getMonth() + 1, 1));
    };

    const handleAbsenceSave = async (from: Date, to: Date, type: AbsenceType, userId: string) => {
        const startDateStr = format(from, 'yyyy-MM-dd');
        const endDateStr = format(to, 'yyyy-MM-dd');
        
        if (type === 'Clear Absence/ Work') {
            await deleteAbsencesInRange(userId, startDateStr, endDateStr, false);
            setIsAbsenceDialogOpen(false);
            setEditingAbsence(null);
            return;
        }

        const absenceChunks: { from: Date, to: Date }[] = [];
        let currentChunkStart: Date | null = null;
        const allHolidays = [...publicHolidays, ...customHolidays];

        for (let dt = new Date(from); dt <= to; dt = addDays(dt, 1)) {
            const dayOfWeek = getDay(dt);
            const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
            const isHoliday = allHolidays.some(h => isSameDay(new Date(h.date), dt));
            const isWorkingDay = !isWeekend && !isHoliday;

            if (isWorkingDay) {
                if (currentChunkStart === null) {
                    currentChunkStart = dt;
                }
            } else {
                if (currentChunkStart !== null) {
                    absenceChunks.push({ from: currentChunkStart, to: addDays(dt, -1) });
                    currentChunkStart = null;
                }
            }
        }
        if (currentChunkStart !== null) {
            absenceChunks.push({ from: currentChunkStart, to: to });
        }
        
        if (absenceChunks.length === 0) {
            toast({
                variant: 'destructive',
                title: 'No Working Days',
                description: 'The selected date range contains no working days to mark as an absence.'
            });
            return;
        }

        const saveAction = async (force: boolean = false) => {
            for (const chunk of absenceChunks) {
                const chunkStartStr = format(chunk.from, 'yyyy-MM-dd');
                const chunkEndStr = format(chunk.to, 'yyyy-MM-dd');

                const workDaysInPeriod = timeEntries.some(entry => {
                    if (entry.userId === userId) {
                        const entryDayStr = entry.date.split('T')[0];
                        return entryDayStr >= chunkStartStr && entryDayStr <= chunkEndStr;
                    }
                    return false;
                });

                if (workDaysInPeriod) {
                    toast({
                        variant: 'destructive',
                        title: 'Logged Work Conflict',
                        description: `Range ${chunkStartStr} to ${chunkEndStr} contains logged work and cannot be marked as an absence.`
                    });
                    continue; // Skip this chunk but try to save others
                }
                
                await addAbsence({ userId, startDate: chunkStartStr, endDate: chunkEndStr, type }, force);
            }
            setIsAbsenceDialogOpen(false);
            setEditingAbsence(null);
        };

        const overlappingAbsences = absences.filter(a => {
            if (a.userId !== userId) return false;
            const existingStart = a.startDate.split('T')[0];
            const existingEnd = a.endDate.split('T')[0];
            return (startDateStr <= existingEnd && endDateStr >= existingStart);
        });

        if (overlappingAbsences.length > 0) {
            const overlappingTypes = Array.from(new Set(overlappingAbsences.map(a => a.type)));
            setOverwriteConfirmation({
                show: true,
                message: `This range overlaps with existing absences (${overlappingTypes.join(', ')}). Do you want to overwrite?`,
                onConfirm: () => {
                    saveAction(true);
                    setOverwriteConfirmation({ show: false, message: '', onConfirm: () => {} });
                }
            });
        } else {
            saveAction();
        }
    };
    
    const handleDayDoubleClick = (date: Date) => {
        const dayStr = format(date, 'yyyy-MM-dd');
        const absenceOnDate = absences.find(a =>
            a.userId === currentUser.id &&
            dayStr >= a.startDate.split('T')[0] && dayStr <= a.endDate.split('T')[0]
        );

        if (absenceOnDate) {
            setEditingAbsence(absenceOnDate);
            setIsAbsenceDialogOpen(true);
        }
    };
    
    const RosterCalendar = ({ userId }: { userId: string }) => {
        const isDateInAbsence = (day: string, absence: Absence) => {
            const startStr = absence.startDate.split('T')[0];
            const endStr = absence.endDate.split('T')[0];
            return day >= startStr && day <= endStr;
        };

        const modifiers = React.useMemo(() => ({
            workDay: (date: Date) => timeEntries.some(entry => 
                entry.userId === userId &&
                entry.date.split('T')[0] === format(date, 'yyyy-MM-dd')
            ),
            generalAbsence: (date: Date) => absences.some(absence => 
                absence.userId === userId &&
                absence.type === 'General Absence' &&
                isDateInAbsence(format(date, 'yyyy-MM-dd'), absence)
            ),
            sickLeave: (date: Date) => absences.some(absence => 
                absence.userId === userId &&
                absence.type === 'Sick Leave' &&
                isDateInAbsence(format(date, 'yyyy-MM-dd'), absence)
            ),
            publicHoliday: (date: Date) => publicHolidays.some(ph => 
                ph.date.split('T')[0] === format(date, 'yyyy-MM-dd')
            ),
        }), [userId, timeEntries, absences, publicHolidays]);
    
        function Day(props: DayProps) {
            const dayStr = format(props.date, 'yyyy-MM-dd');
            let className = "w-full h-full p-0 m-0 flex items-center justify-center";
            let tooltip = '';
    
            if (modifiers.publicHoliday(props.date)) {
                className = cn(className, "bg-orange-100 dark:bg-orange-900/50");
                tooltip = publicHolidays.find(ph => ph.date.split('T')[0] === dayStr)?.name || 'Public Holiday';
            } else if ([0,6].includes(getDay(props.date))) {
                className = cn(className, "bg-orange-100 dark:bg-orange-900/50");
                tooltip = getDay(props.date) === 0 ? 'Sunday' : 'Saturday';
            }
    
            if (modifiers.sickLeave(props.date)) {
                className = cn(className, "bg-red-300 dark:bg-red-800");
                tooltip = 'Sick Leave';
            } else if (modifiers.generalAbsence(props.date)) {
                className = cn(className, "bg-yellow-200 dark:bg-yellow-800");
                tooltip = 'General Absence';
            } else if (modifiers.workDay(props.date)) {
                className = cn(className, "bg-sky-200 dark:bg-sky-800");
                tooltip = 'Work Logged';
            }
    
            const content = <button type="button" className={className}>{format(props.date, 'd')}</button>;
            if (tooltip) {
                return (
                    <TooltipProvider delayDuration={0}>
                        <Tooltip>
                            <TooltipTrigger asChild>{content}</TooltipTrigger>
                            <TooltipContent><p>{tooltip}</p></TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                );
            }
    
            return content;
        }

        return (
            <div className="p-4">
                <div className="border rounded-lg p-3">
                    <div className="flex justify-between items-center mb-4 px-2">
                        <Button variant="outline" size="icon" onClick={handlePrevMonth} className="z-10 bg-background hover:bg-muted">
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <h3 className="text-center font-bold text-xl">
                            {format(selectedDate, 'MMMM yyyy')}
                        </h3>
                        <Button variant="outline" size="icon" onClick={handleNextMonth} className="z-10 bg-background hover:bg-muted">
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>
                    <Calendar
                        month={selectedDate}
                        onDayDoubleClick={(date) => handleDayDoubleClick(date)}
                        formatters={{ formatWeekdayName: (day) => format(day, 'EEE') }}
                        weekStartsOn={1}
                        fromDate={minContractDate || undefined}
                        toDate={maxContractDate || undefined}
                        components={{ Day }}
                        modifiersClassNames={{
                            today: 'bg-muted'
                        }}
                        classNames={{
                            row: "flex w-full mt-0",
                            cell: "flex-1 text-center text-sm p-0 m-0 border h-[50px]",
                            head_row: "flex",
                            head_cell: "text-muted-foreground rounded-md w-full font-bold text-xs p-2 border",
                            day: "h-full w-full p-1 hover:bg-muted",
                            months: "w-full",
                            month: "w-full space-y-0",
                            caption: "hidden"
                        }}
                    />
                </div>
            </div>
        );
    }
    
    const yearsList = React.useMemo(() => {
        const currentYear = new Date().getFullYear();
        return availableYears.length > 0 ? availableYears : [currentYear];
    }, [availableYears]);

    return (
        <>
            <Card>
                <CardHeader>
                    <div className="flex justify-between items-center">
                        <div>
                            <CardTitle>My Roster</CardTitle>
                            <CardDescription>A monthly overview of your logged time and absences.</CardDescription>
                        </div>
                        <div className="flex gap-2 items-center">
                            <Button onClick={() => { setEditingAbsence(null); setIsAbsenceDialogOpen(true); }}>Update My Roster</Button>
                            <Select value={String(selectedDate.getMonth())} onValueChange={handleMonthChange}>
                                <SelectTrigger className="w-[180px]">
                                    <SelectValue placeholder="Select month" />
                                </SelectTrigger>
                                <SelectContent>
                                    {months.map(month => (
                                        <SelectItem key={month.value} value={String(month.value)}>{month.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Select value={String(selectedDate.getFullYear())} onValueChange={handleYearChange}>
                                <SelectTrigger className="w-[120px]">
                                    <SelectValue placeholder="Select year" />
                                </SelectTrigger>
                                <SelectContent>
                                    {yearsList.map(year => (
                                        <SelectItem key={year} value={String(year)}>{year}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                <RosterCalendar userId={currentUser.id} />
                </CardContent>
            </Card>
            <MarkAbsenceDialog
                isOpen={isAbsenceDialogOpen}
                onOpenChange={setIsAbsenceDialogOpen}
                onSave={handleAbsenceSave}
                userId={currentUser.id}
                absence={editingAbsence}
            />
             <AlertDialog open={overwriteConfirmation.show} onOpenChange={(open) => !open && setOverwriteConfirmation({ show: false, message: '', onConfirm: () => {} })}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Absence Overlap</AlertDialogTitle>
                        <AlertDialogDescription>
                            {overwriteConfirmation.message}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setOverwriteConfirmation({ show: false, message: '', onConfirm: () => {} })}>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={overwriteConfirmation.onConfirm}>Yes, Overwrite</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
