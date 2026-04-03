
'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import * as XLSX from 'xlsx-js-style';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import type { User, TimeEntry, HolidayRequest } from '@/lib/types';
import { addDays, getDay, isSameMonth, startOfMonth, isWithinInterval, getYear, parseISO, isSameDay, min as minDate, max as maxDate, getMonth, endOfYear, startOfYear, endOfMonth, format, startOfDay, endOfDay } from 'date-fns';
import type { DayContentProps } from 'react-day-picker';
import { DayDetailsDialog } from './day-details-dialog';
import { useMembers } from '../../contexts/MembersContext';
import { useHolidays } from '../../contexts/HolidaysContext';
import { useAuth } from '../../contexts/AuthContext';
import { useTimeTracking } from '../../contexts/TimeTrackingContext';
import { LogTimeDialog, type LogTimeFormValues } from '../../components/log-time-dialog';
import { DeleteTimeEntryDialog } from './delete-time-entry-dialog';
import { useLanguage } from '../../contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import { FileUp } from 'lucide-react';
import { useTeams } from '../../contexts/TeamsContext';

const months = Array.from({ length: 12 }, (_, i) => ({
  value: i,
  label: new Date(0, i).toLocaleString('default', { month: 'long' }),
}));

interface ReportCalendarContextValue {
  selectedDate: Date;
  monthlyData: { 
    dailyTotals: Record<string, number>;
    dailyEntries: Record<string, TimeEntry[]>;
    dailyExpected: Record<string, number>;
    dailyHolidayNames: Record<string, string>;
    personalLeaveDays: { date: Date; type: "Vacation" | "Sick Leave" }[];
    publicHolidayDays: Date[];
    customHolidayDays: Date[];
  };
  onDayClick: (date: Date) => void;
  t: (key: any, options?: any) => string;
}

const ReportCalendarContext = React.createContext<ReportCalendarContextValue | null>(null);

const DayContent: React.FC<DayContentProps> = (props) => {
  const context = React.useContext(ReportCalendarContext);

  if (!context) {
    return <div className="p-1">{props.date.getDate()}</div>;
  }

  const { selectedDate, monthlyData, onDayClick, t } = context;
  const { date } = props;
  const dayOfMonth = date.getDate();

  if (!isSameMonth(date, selectedDate)) {
    return <div className="p-1">{dayOfMonth}</div>;
  }

  const hours = monthlyData.dailyTotals[dayOfMonth];
  const holidayName = monthlyData.dailyHolidayNames[dayOfMonth];
  const hasManualEntries = (monthlyData.dailyEntries[dayOfMonth] || []).length > 0;
  
  const isWeekend = getDay(date) === 0 || getDay(date) === 6;
  const personalLeave = monthlyData.personalLeaveDays.find(d => isSameDay(d.date, date));

  const wrapperProps = {
    className: "relative w-full h-full flex flex-col items-center justify-between text-center p-1",
    ...(hasManualEntries && {
        onClick: () => onDayClick(date),
        role: 'button' as const,
        className: "relative w-full h-full flex flex-col items-center justify-between text-center p-1 cursor-pointer hover:bg-accent/50 rounded-md"
    })
  };

  return (
    <div {...wrapperProps}>
        <div className="self-start">{dayOfMonth}</div>
        {hours !== undefined && hours > 0 ? (
            <span className="text-xs font-bold text-primary">{hours.toFixed(1)}h</span>
        ) : <span className="h-[15px]" />}
        {!isWeekend && (
            holidayName ? (
                <span className="text-[10px] font-semibold text-green-600 truncate px-1">
                    {holidayName}
                </span>
            ) : personalLeave ? (
                <span className={cn("text-[10px] font-semibold mt-auto", personalLeave.type === 'Sick Leave' ? 'text-orange-600' : 'text-yellow-700')}>
                    {personalLeave.type}
                </span>
            ) : <span className="h-[15px]" />
        )}
        {isWeekend && <span className="h-[15px]" />}
    </div>
  );
};


export function IndividualReport() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { t } = useLanguage();
    const { teams } = useTeams();
    const { teamMembers } = useMembers();
    const { currentUser } = useAuth();
    const { publicHolidays, customHolidays, holidayRequests, annualLeaveAllowance } = useHolidays();
    const { timeEntries, updateTimeEntry, deleteTimeEntry } = useTimeTracking();

    const [isDetailsDialogOpen, setIsDetailsDialogOpen] = React.useState(false);
    const [selectedDayEntries, setSelectedDayEntries] = React.useState<TimeEntry[]>([]);
    const [selectedDayForDialog, setSelectedDayForDialog] = React.useState<Date>(new Date());
    const [editingEntry, setEditingEntry] = React.useState<TimeEntry | null>(null);
    const [deletingEntry, setDeletingEntry] = React.useState<TimeEntry | null>(null);
    const [isExportDialogOpen, setIsExportDialogOpen] = React.useState(false);

    const viewableUsers = React.useMemo(() => {
        let members: User[];
        if (currentUser.role === 'Super Admin') {
            members = teamMembers;
        } else if (currentUser.role === 'Team Lead') {
            const team = teamMembers.filter(m => m.reportsTo === currentUser.id);
            members = [currentUser, ...team];
        } else {
            members = [currentUser];
        }
        return Array.from(new Map(members.map(item => [item.id, item])).values());
    }, [teamMembers, currentUser]);

    const targetUserId = searchParams.get('userId') || currentUser.id;
    
    const [selectedUser, setSelectedUser] = React.useState<User | undefined>(() => viewableUsers.find(u => u.id === targetUserId));
    const [selectedDate, setSelectedDate] = React.useState(new Date());

    React.useEffect(() => {
        const userFromParams = viewableUsers.find(u => u.id === targetUserId);
        const userToSelect = userFromParams || (viewableUsers.includes(currentUser) ? currentUser : viewableUsers[0]);
        setSelectedUser(userToSelect);
    }, [targetUserId, viewableUsers, currentUser]);

    const { availableYears, availableMonths, minContractDate, maxContractDate } = React.useMemo(() => {
        if (!selectedUser || !selectedUser.contracts || selectedUser.contracts.length === 0) {
            const currentYear = new Date().getFullYear();
            const yearsList = Array.from({ length: 5 }, (_, i) => currentYear - i);
            return { availableYears: yearsList, availableMonths: months, minContractDate: null, maxContractDate: null };
        }
    
        const allStartDates = selectedUser.contracts.map(c => parseISO(c.startDate));
        const allEndDates = selectedUser.contracts.map(c => c.endDate ? parseISO(c.endDate) : new Date());
    
        const minDateVal = minDate(allStartDates);
        const maxDateVal = maxDate(allEndDates);
        
        const overallStartYear = getYear(minDateVal);
        const overallEndYear = getYear(maxDateVal);
        
        const yearsList = [];
        for (let i = overallEndYear; i >= overallStartYear; i--) {
            yearsList.push(i);
        }
    
        const year = selectedDate.getFullYear();
    
        const contractsInYear = selectedUser.contracts.filter(c => {
            const contractStartYear = getYear(parseISO(c.startDate));
            const contractEndYear = c.endDate ? getYear(parseISO(c.endDate)) : year;
            return year >= contractStartYear && year <= contractEndYear;
        });

        if (contractsInYear.length === 0) {
             return { availableYears: yearsList, availableMonths: [], minContractDate: minDateVal, maxContractDate: maxDateVal };
        }

        const startMonthsInYear = contractsInYear.map(c => 
            getYear(parseISO(c.startDate)) === year ? getMonth(parseISO(c.startDate)) : 0
        );
        const endMonthsInYear = contractsInYear.map(c => 
            c.endDate && getYear(parseISO(c.endDate)) === year ? getMonth(parseISO(c.endDate)) : 11
        );

        const startMonthForYear = Math.min(...startMonthsInYear);
        const endMonthForYear = Math.max(...endMonthsInYear);

        const monthsList = months.filter(m => m.value >= startMonthForYear && m.value <= endMonthForYear);
    
        return { availableYears: yearsList, availableMonths: monthsList, minContractDate: minDateVal, maxContractDate: maxDateVal };
    }, [selectedUser, selectedDate]);


  const monthlyData = React.useMemo(() => {
    if (!selectedUser) return { dailyTotals: {}, personalLeaveDays: [], publicHolidayDays: [], customHolidayDays: [], dailyEntries: {}, dailyExpected: {}, dailyHolidayNames: {}, totalLogged: 0, totalExpected: 0, totalAssigned: 0, totalLeave: 0 };

    const dailyTotals: Record<string, number> = {};
    const dailyEntries: Record<string, TimeEntry[]> = {};
    const dailyExpected: Record<string, number> = {};
    const dailyHolidayNames: Record<string, string> = {};

    const selectedYear = selectedDate.getFullYear();
    const yearEnd = endOfYear(selectedDate);
    const publicHolidaysInYear = publicHolidays.filter(h => getYear(parseISO(h.date)) === selectedYear);

    const standardWorkDaysInYear = 261;
    const dailyLeaveCredit = annualLeaveAllowance / standardWorkDaysInYear;
    
    const userHolidaysInYear = publicHolidaysInYear
        .concat(customHolidays.filter(h => {
            if (getYear(parseISO(h.date)) !== selectedYear) return false;
            const applies = (h.appliesTo === 'all-members') || (h.appliesTo === 'all-teams' && !!selectedUser.teamId) || (h.appliesTo === selectedUser.teamId);
            return applies;
        }));
    
    const monthStart = startOfMonth(selectedDate);
    const monthEnd = endOfMonth(selectedDate);

    let totalAssigned = 0;
    let totalExpected = 0;
    let totalLeave = 0;

    for (let d = new Date(monthStart); d <= monthEnd; d = addDays(d, 1)) {
        const dayOfMonth = d.getDate();
        const dayOfWeek = getDay(d);

        if (dayOfWeek === 0 || dayOfWeek === 6) continue;

        const isHoliday = userHolidaysInYear.some(h => isSameDay(parseISO(h.date), d));
        if (isHoliday) {
            const holiday = userHolidaysInYear.find(h => isSameDay(parseISO(h.date), d));
            if (holiday) dailyHolidayNames[dayOfMonth] = holiday.name;
            continue;
        }

        const isVacationDay = holidayRequests.some(req => req.userId === selectedUser.id && req.status === 'Approved' && req.type === 'Vacation' && isWithinInterval(d, { start: parseISO(req.startDate), end: parseISO(req.endDate) }));
        if (isVacationDay) continue;

        const activeContractsOnDay = selectedUser.contracts.filter(c => {
            const contractStart = parseISO(c.startDate);
            const contractEnd = c.endDate ? parseISO(c.endDate) : yearEnd;
            return isWithinInterval(d, { start: contractStart, end: contractEnd });
        });
        
        if (activeContractsOnDay.length > 0) {
            const dailyContractHours = activeContractsOnDay.reduce((sum, c) => sum + c.weeklyHours, 0) / 5;
            const leaveHoursForDay = dailyLeaveCredit * dailyContractHours;
            const expected = dailyContractHours - leaveHoursForDay;
            
            dailyExpected[dayOfMonth] = expected;
            totalAssigned += dailyContractHours;
            totalLeave += leaveHoursForDay;
            totalExpected += expected;
        }
    }

    const userTimeEntries = timeEntries.filter(entry => {
        const entryDate = parseISO(entry.date);
        return entry.userId === selectedUser.id &&
               isSameMonth(entryDate, selectedDate);
    });

    let totalLogged = 0;
    userTimeEntries.forEach(entry => {
        const day = parseISO(entry.date).getDate();
        if (!dailyTotals[day]) dailyTotals[day] = 0;
        if (!dailyEntries[day]) dailyEntries[day] = [];
        dailyTotals[day] += entry.duration;
        dailyEntries[day].push(entry);
        totalLogged += entry.duration;
    });
    
    const personalLeaveDays = holidayRequests.filter(req => 
        req.userId === selectedUser.id && req.status === 'Approved'
    ).flatMap(req => {
        const start = parseISO(req.startDate);
        const end = parseISO(req.endDate);
        const dates: { date: Date; type: "Vacation" | "Sick Leave" }[] = [];
        for (let dt = start; dt <= end; dt = addDays(dt, 1)) {
            if (isSameMonth(dt, selectedDate)) {
                dates.push({ date: new Date(dt), type: req.type });
            }
        }
        return dates;
    });
    
    const publicHolidayDays = publicHolidaysInYear.map(h => parseISO(h.date));
    const customHolidayDays = userHolidaysInYear.filter(h => !publicHolidaysInYear.includes(h)).map(h => parseISO(h.date));

    return { dailyTotals, personalLeaveDays, publicHolidayDays, customHolidayDays, dailyEntries, dailyExpected, dailyHolidayNames, totalLogged, totalExpected, totalAssigned, totalLeave };
  }, [selectedUser, selectedDate, publicHolidays, customHolidays, holidayRequests, timeEntries, annualLeaveAllowance]);
    
    const canEditEntries = React.useMemo(() => {
        if (!selectedUser) return false;
        if (currentUser.role === 'Super Admin') return true;
        if (currentUser.id === selectedUser.id) return true;
        if (currentUser.role === 'Team Lead' && selectedUser.reportsTo === currentUser.id) return true;
        return false;
    }, [currentUser, selectedUser]);
    
    const getTeamName = (teamId?: string) => {
        if (!teamId) return 'N/A';
        return teams.find(t => t.id === teamId)?.name || 'N/A';
    };

    const handleExport = (periodStart: Date, periodEnd: Date) => {
        if (!selectedUser) return;
        
        const title = `Report for ${format(periodStart, 'PP')} - ${format(periodEnd, 'PP')}`;
        const numberFormat = { z: '0.00' };
        const titleStyle = { font: { bold: true, sz: 14 } };
        const headerStyle = { font: { bold: true }, fill: { fgColor: { rgb: "E0E0E0" } }, border: { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } } };
        const userRowStyle = { fill: { fgColor: { rgb: "DDEBF7" } }, border: { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } } };
        const dataRowStyle = { border: { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } }, alignment: { wrapText: true } };
        
        // --- CALCULATION LOGIC (Segmented for Accuracy) ---
        const monthSegments: { start: Date; end: Date; year: number }[] = [];
        let current = new Date(periodStart);
        while (current <= periodEnd) {
            const segStart = maxDate([current, startOfMonth(current)]);
            const segEnd = minDate([periodEnd, endOfMonth(current)]);
            monthSegments.push({ start: segStart, end: segEnd, year: getYear(current) });
            current = startOfMonth(addDays(endOfMonth(current), 1));
        }

        const yearStats: Record<number, { dailyLeaveCredit: number; phInYear: any[] }> = {};
        const uniqueYears = Array.from(new Set(monthSegments.map(s => s.year)));
        uniqueYears.forEach(year => {
            const yStart = startOfYear(new Date(year, 0, 1));
            const yEnd = endOfYear(new Date(year, 0, 1));
            const phInYear = publicHolidays.filter(h => getYear(parseISO(h.date)) === year);
            let standardWorkDays = 0;
            for (let d = new Date(yStart); d <= yEnd; d = addDays(d, 1)) {
                if (getDay(d) === 0 || getDay(d) === 6) continue;
                if (phInYear.some(h => isSameDay(parseISO(h.date), d))) continue;
                standardWorkDays++;
            }
            yearStats[year] = { dailyLeaveCredit: standardWorkDays > 0 ? annualLeaveAllowance / standardWorkDays : 0, phInYear };
        });

        let totalAssigned = 0;
        let totalLeave = 0;

        monthSegments.forEach(seg => {
            const stats = yearStats[seg.year];
            const holidays = stats.phInYear.concat(customHolidays.filter(h => {
                if (getYear(parseISO(h.date)) !== seg.year) return false;
                const applies = (h.appliesTo === 'all-members') || (h.appliesTo === 'all-teams' && !!selectedUser.teamId) || (h.appliesTo === selectedUser.teamId);
                return applies;
            }));

            let assignedInSeg = 0;
            let workingDaysInSeg = 0;

            for (let d = new Date(seg.start); d <= seg.end; d = addDays(d, 1)) {
                if (getDay(d) === 0 || getDay(d) === 6) continue;
                if (holidays.some(h => isSameDay(parseISO(h.date), d))) continue;
                if (holidayRequests.some(req => req.userId === selectedUser.id && req.status === 'Approved' && req.type === 'Vacation' && isWithinInterval(d, { start: parseISO(req.startDate), end: parseISO(req.endDate) }))) continue;

                const activeContracts = selectedUser.contracts.filter(c => {
                    const cStart = parseISO(c.startDate);
                    const cEnd = c.endDate ? parseISO(c.endDate) : endOfYear(new Date(seg.year, 0, 1));
                    return isWithinInterval(d, { start: cStart, end: cEnd });
                });

                if (activeContracts.length > 0) {
                    workingDaysInSeg++;
                    assignedInSeg += activeContracts.reduce((sum, c) => sum + c.weeklyHours, 0) / 5;
                }
            }
            totalAssigned += assignedInSeg;
            totalLeave += workingDaysInSeg * stats.dailyLeaveCredit * (workingDaysInSeg > 0 ? assignedInSeg / workingDaysInSeg : 0);
        });

        const round = (num: number) => parseFloat(num.toFixed(2));
        const assignedHours = round(totalAssigned);
        const leaveHours = round(totalLeave);
        const expectedHours = round(assignedHours - leaveHours);
        
        const userEntriesForRange = timeEntries.filter(entry => 
            entry.userId === selectedUser.id && 
            isWithinInterval(parseISO(entry.date), { start: periodStart, end: periodEnd })
        ).sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        
        const loggedHours = round(userEntriesForRange.reduce((acc, e) => acc + e.duration, 0));
        const remainingHours = round(expectedHours - loggedHours);

        const aoa: any[][] = [];
        aoa.push([{v: title, s: titleStyle }]);
        aoa.push([]);

        const summaryHeaders = [t('member'), t('role'), t('team'), t('assignedHours'), t('leaveHours'), t('expected'), t('logged'), t('remaining')];
        const summaryData = [
            selectedUser.name,
            selectedUser.role,
            getTeamName(selectedUser.teamId),
            { v: assignedHours, t: 'n', s: {...userRowStyle, ...numberFormat}},
            { v: leaveHours, t: 'n', s: {...userRowStyle, ...numberFormat}},
            { v: expectedHours, t: 'n', s: {...userRowStyle, ...numberFormat}},
            { v: loggedHours, t: 'n', s: {...userRowStyle, ...numberFormat}},
            { v: remainingHours, t: 'n', s: {...userRowStyle, ...numberFormat, font: { color: { rgb: remainingHours < 0 ? "008000" : "000000" } }}}
        ];

        aoa.push(summaryHeaders.map(h => ({v: h, s: headerStyle})));
        aoa.push(summaryData.map((cell, i) => i < 3 ? {v: cell, s: userRowStyle} : cell));
        aoa.push([]);

        const timeEntryHeaders = [t('date'), t('project'), t('task'), '', '', '', t('loggedHours'), '', 'Remarks'];
        aoa.push(timeEntryHeaders.map(h => ({v: h, s: headerStyle})));

        userEntriesForRange.forEach(entry => {
            const [project, ...taskParts] = entry.task.split(' - ');
            const task = taskParts.join(' - ');
            aoa.push([
                {v: format(parseISO(entry.date), 'dd/MM/yyyy'), s: dataRowStyle },
                {v: project, s: dataRowStyle },
                {v: task, s: dataRowStyle },
                {v: '', s: dataRowStyle },
                {v: '', s: dataRowStyle },
                {v: '', s: dataRowStyle },
                {v: round(entry.duration), t: 'n', s: {...dataRowStyle, ...numberFormat} },
                {v: '', s: dataRowStyle },
                {v: entry.remarks || '', s: dataRowStyle}
            ]);
        });
        
        const worksheet = XLSX.utils.aoa_to_sheet(aoa);
        const colWidths = summaryHeaders.map((h, i) => ({
            wch: Math.max(h.length, ...aoa.map(row => row[i]?.v?.toString().length || 0)) + 2
        }));
        colWidths[8] = { wch: 40 };
        worksheet['!cols'] = colWidths;

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Individual Report");
        XLSX.writeFile(workbook, `individual_report_${selectedUser.name.replace(/\s+/g, '_')}_${format(periodStart, 'yyyyMMdd')}_${format(periodEnd, 'yyyyMMdd')}.xlsx`);
    };

    const handleUserChange = (userId: string) => {
        const currentTab = searchParams.get('tab') || 'individual-report';
        router.push(`/dashboard/reports?tab=${currentTab}&userId=${userId}`);
    };
    
    const handleMonthChange = (month: string) => {
        setSelectedDate(new Date(selectedDate.getFullYear(), parseInt(month), 1));
    }
    
    const handleYearChange = (year: string) => {
        if (!selectedUser) return;
        const newYear = parseInt(year);
        let newMonth = selectedDate.getMonth();
        
        if (minContractDate && newYear === getYear(minContractDate) && newMonth < getMonth(minContractDate)) {
            newMonth = getMonth(minContractDate);
        }

        if (maxContractDate && newYear === getYear(maxContractDate) && newMonth > getMonth(maxContractDate)) {
            newMonth = getMonth(maxContractDate);
        }

        setSelectedDate(new Date(newYear, newMonth, 1));
    }
    
    const handleDayClick = React.useCallback((date: Date) => {
        const day = date.getDate();
        const entries = monthlyData.dailyEntries[day] || [];
        
        if (entries.length > 0) {
            setSelectedDayEntries(entries);
            setSelectedDayForDialog(date);
            setIsDetailsDialogOpen(true);
        }
    }, [monthlyData.dailyEntries]);

    const handleSaveEntry = async (data: LogTimeFormValues, entryId?: string) => {
        if (!entryId || !selectedUser) return { success: false };
        return updateTimeEntry(entryId, data, selectedUser.id, teamMembers);
    };

    const handleDeleteConfirm = async () => {
        if (!deletingEntry) return;
        await deleteTimeEntry(deletingEntry.id);
        setDeletingEntry(null);
        setIsDetailsDialogOpen(false);
    };


    const calendarContextValue = React.useMemo<ReportCalendarContextValue>(() => ({
        selectedDate,
        monthlyData,
        onDayClick: handleDayClick,
        t,
    }), [selectedDate, monthlyData, handleDayClick, t]);

  if (!selectedUser) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('noUserSelectedTitle')}</CardTitle>
          <CardDescription>
            {viewableUsers.length > 1 ? t('noUserSelectedDescMulti') : t('noUserSelectedDescSingle')}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="flex items-center gap-4">
                <Avatar className="w-12 h-12">
                <AvatarImage src={selectedUser.avatar} alt={selectedUser.name} data-ai-hint="person avatar"/>
                <AvatarFallback>{selectedUser.name.split(' ').map(n => n[0]).join('')}</AvatarFallback>
                </Avatar>
                <div>
                  <h2 className="text-xl font-bold font-headline">{t('userCalendar', {name: selectedUser.name})}</h2>
                  <p className="text-muted-foreground">{t('userCalendarDesc')}</p>
                </div>
            </div>
            <div className="flex gap-2 w-full md:w-auto">
                <Button variant="outline" onClick={() => setIsExportDialogOpen(true)}>
                    <FileUp className="mr-2 h-4 w-4" /> {t('export')}
                </Button>
                <Select onValueChange={handleUserChange} value={selectedUser.id} disabled={viewableUsers.length <= 1}>
                    <SelectTrigger className="w-full md:w-[180px]">
                        <SelectValue placeholder={t('selectUserPlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                        {viewableUsers.map(user => (
                            <SelectItem key={user.id} value={user.id}>{user.name}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
        </CardHeader>
        <CardContent className="space-y-4">
            <div className="flex justify-end gap-2">
                <Select
                    value={String(selectedDate.getMonth())}
                    onValueChange={handleMonthChange}
                >
                    <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder={t('selectMonthPlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                        {availableMonths.map(month => (
                            <SelectItem key={month.value} value={String(month.value)}>
                                {month.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Select
                    value={String(selectedDate.getFullYear())}
                    onValueChange={handleYearChange}
                >
                    <SelectTrigger className="w-[120px]">
                        <SelectValue placeholder={t('selectYearPlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                        {availableYears.map(year => (
                            <SelectItem key={year} value={String(year)}>
                                {year}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
            <ReportCalendarContext.Provider value={calendarContextValue}>
              <Calendar
                  month={selectedDate}
                  onMonthChange={setSelectedDate}
                  weekStartsOn={1}
                  fromDate={minContractDate || undefined}
                  toDate={maxContractDate || undefined}
                  modifiers={{ 
                      saturday: (date) => getDay(date) === 6,
                      sunday: (date) => getDay(date) === 0,
                      holiday: monthlyData.publicHolidayDays,
                      customHoliday: monthlyData.customHolidayDays,
                      personalLeave: monthlyData.personalLeaveDays.map(d => d.date),
                      logged: Object.keys(monthlyData.dailyTotals).filter(d => monthlyData.dailyTotals[parseInt(d)] > 0).map(day => {
                          return new Date(selectedDate.getFullYear(), selectedDate.getMonth(), parseInt(day))
                      })
                  }}
                  modifiersClassNames={{
                  saturday: 'text-muted-foreground/50',
                  sunday: 'text-muted-foreground/50',
                  holiday: 'bg-green-200 dark:bg-green-800 rounded-md',
                  customHoliday: 'bg-orange-200 dark:bg-orange-800 rounded-md',
                  personalLeave: 'bg-yellow-200 dark:bg-yellow-800 rounded-md',
                  logged: 'border border-primary rounded-md'
                  }}
                  components={{
                  DayContent,
                  }}
                  className="p-0"
                  classNames={{
                      row: "flex w-full mt-0",
                      cell: "flex-1 text-center text-sm p-0 relative [&:has([aria-selected].day-range-end)]:rounded-r-md [&:has([aria-selected].day-outside)]:bg-accent/50 [&:has([aria-selected])]:bg-accent first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20",
                      head_row: "flex",
                      head_cell: "text-muted-foreground rounded-md w-full font-normal text-[0.8rem]",
                      day: "h-20 w-full text-base p-0",
                      months: "w-full",
                      month: "w-full space-y-4",
                      caption_label: "text-lg font-bold"
                  }}
              />
            </ReportCalendarContext.Provider>
        </CardContent>
      </Card>
      <DayDetailsDialog 
        isOpen={isDetailsDialogOpen}
        onOpenChange={setIsDetailsDialogOpen}
        date={selectedDayForDialog}
        entries={selectedDayEntries}
        canEdit={canEditEntries}
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
          onSave={(data, entryId) => handleSaveEntry(data as Omit<LogTimeFormValues, 'userId'>, entryId)}
          entryToEdit={editingEntry}
          userId={selectedUser.id}
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
      
      <ExportIndividualReportDialog
        isOpen={isExportDialogOpen}
        onOpenChange={setIsExportDialogOpen}
        onExport={handleExport}
        availableYears={availableYears}
        selectedUser={selectedUser}
      />
    </div>
  );
}

interface ExportIndividualReportDialogProps {
    isOpen: boolean;
    onOpenChange: (isOpen: boolean) => void;
    onExport: (start: Date, end: Date) => void;
    availableYears: number[];
    selectedUser: User;
}

function ExportIndividualReportDialog({ isOpen, onOpenChange, onExport, availableYears, selectedUser }: ExportIndividualReportDialogProps) {
    const { t } = useLanguage();
    const [mode, setMode] = React.useState<'monthly' | 'custom'>('monthly');
    const [selectedMonth, setSelectedMonth] = React.useState(new Date().getMonth());
    const [selectedYear, setSelectedYear] = React.useState(new Date().getFullYear());
    const [fromDate, setFromDate] = React.useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
    const [toDate, setToDate] = React.useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));

    const handleExportClick = () => {
        let start: Date;
        let end: Date;

        if (mode === 'monthly') {
            start = startOfMonth(new Date(selectedYear, selectedMonth));
            end = endOfMonth(new Date(selectedYear, selectedMonth));
        } else {
            start = startOfDay(parseISO(fromDate));
            end = endOfDay(parseISO(toDate));
        }

        onExport(start, end);
        onOpenChange(false);
    }

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Export Individual Report</DialogTitle>
                    <DialogDescription>
                        Export a detailed report for {selectedUser.name}.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-6 py-4">
                    <RadioGroup value={mode} onValueChange={(v) => setMode(v as any)} className="flex items-center gap-4">
                        <div className="flex items-center space-x-2">
                            <RadioGroupItem value="monthly" id="m-monthly" />
                            <Label htmlFor="m-monthly">Monthly</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                            <RadioGroupItem value="custom" id="m-custom" />
                            <Label htmlFor="m-custom">Custom</Label>
                        </div>
                    </RadioGroup>

                    {mode === 'monthly' ? (
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Month</Label>
                                <Select value={String(selectedMonth)} onValueChange={v => setSelectedMonth(Number(v))}>
                                    <SelectTrigger><SelectValue/></SelectTrigger>
                                    <SelectContent>
                                        {months.map(m => <SelectItem key={m.value} value={String(m.value)}>{m.label}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label>Year</Label>
                                <Select value={String(selectedYear)} onValueChange={v => setSelectedYear(Number(v))}>
                                    <SelectTrigger><SelectValue/></SelectTrigger>
                                    <SelectContent>
                                        {availableYears.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>From Date</Label>
                                <Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} />
                            </div>
                            <div className="space-y-2">
                                <Label>To Date</Label>
                                <Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} />
                            </div>
                        </div>
                    )}
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={handleExportClick}>Export Report</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
