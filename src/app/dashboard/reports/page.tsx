
'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import * as XLSX from 'xlsx-js-style';
import { FileUp, Minus, Plus, Calendar as CalendarIcon, ArrowUpDown } from 'lucide-react';
import { addDays, endOfDay, startOfDay, startOfYear, endOfYear, startOfMonth, endOfMonth, isWithinInterval, getDaysInMonth, differenceInCalendarDays, max, min, getDay, getMonth, getYear, getDate, startOfWeek, endOfWeek, isLeapYear, parseISO, isSameDay, parse, isValid, format } from 'date-fns';
import type { DateRange } from 'react-day-picker';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { IndividualReport } from './components/individual-report';
import { useMembers } from '../contexts/MembersContext';
import { useHolidays } from '../contexts/HolidaysContext';
import { useAuth } from '../contexts/AuthContext';
import { useTimeTracking } from '../contexts/TimeTrackingContext';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useProjects } from '../contexts/ProjectsContext';
import { useTasks } from '../contexts/TasksContext';
import { type User, type TimeEntry, type Contract, type Team } from '@/lib/types';
import { useLanguage } from '../contexts/LanguageContext';
import { DetailedReport } from './components/detailed-report';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Check, ChevronsUpDown } from 'lucide-react';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { cn } from '@/lib/utils';
import { useTeams } from '../contexts/TeamsContext';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { ProjectReport } from './components/project-report';


const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);
const months = Array.from({ length: 12 }, (_, i) => ({
  value: i,
  label: new Date(0, i).toLocaleString('default', { month: 'long' }),
}));

const getWeeksForMonth = (year: number, month: number) => {
    const weeks = [];
    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);

    let current = startOfWeek(firstDayOfMonth, { weekStartsOn: 1 });

    while (current <= lastDayOfMonth) {
        const weekStart = max([current, firstDayOfMonth]);
        const weekEnd = min([endOfWeek(current, { weekStartsOn: 1 }), lastDayOfMonth]);
        
        weeks.push({ start: weekStart, end: weekEnd });
        
        current = addDays(current, 7);
    }
    return weeks;
};

type ProjectReportItem = {
    key: string;
    member: User;
    projectName: string;
    loggedHours: number;
};

type TaskReportItem = {
    key: string;
    member: User;
    taskName: string;
    loggedHours: number;
};

export type DetailedReportData = {
    user: User;
    assignedHours: number;
    leaveHours: number;
    expectedHours: number;
    loggedHours: number;
    remainingHours: number;
    projects: {
        name: string;
        loggedHours: number;
        tasks: {
            name: string;
            loggedHours: number;
        }[];
    }[];
}

interface MultiSelectProps {
    options: { id: string; name: string }[];
    selected: string[];
    onChange: (selected: string[]) => void;
    placeholder: string;
    className?: string;
}

const MultiSelect = ({ options, selected, onChange, placeholder, className }: MultiSelectProps) => {
    const [open, setOpen] = React.useState(false);

    const handleSelect = (value: string) => {
        let newSelected: string[];

        if (value === 'all-teams') {
            newSelected = ['all-teams'];
        } else {
            const currentSelected = selected.filter(item => item !== 'all-teams');
            if (currentSelected.includes(value)) {
                newSelected = currentSelected.filter(item => item !== value);
            } else {
                newSelected = [...currentSelected, value];
            }
        }
        onChange(newSelected);
    };

    const getDisplayValue = () => {
        if (selected.includes('all-teams')) return 'All Teams';
        if (selected.length === 0) return placeholder;
        if (selected.length <= 2) {
             return selected.map(id => options.find(opt => opt.id === id)?.name || id).join(', ');
        }
        return `${selected.length} teams selected`;
    }

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className={cn("w-full md:w-[200px] justify-between", className)}
                >
                    <span className="truncate">{getDisplayValue()}</span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent 
                className="w-[--radix-popover-trigger-width] p-0"
                onWheel={(e) => e.stopPropagation()}
            >
                <Command>
                    <CommandInput placeholder="Search teams..." />
                    <CommandList>
                        <CommandEmpty>No results found.</CommandEmpty>
                        <CommandGroup>
                             <CommandItem onSelect={() => handleSelect('all-teams')}>
                                <Check className={cn("mr-2 h-4 w-4", selected.includes('all-teams') ? "opacity-100" : "opacity-0")} />
                                All Teams
                            </CommandItem>
                            {options.map(option => (
                                <CommandItem
                                    key={option.id}
                                    value={option.name}
                                    onSelect={() => handleSelect(option.id)}
                                >
                                    <Check
                                        className={cn(
                                            "mr-2 h-4 w-4",
                                            selected.includes(option.id) && !selected.includes('all-teams') ? "opacity-100" : "opacity-0"
                                        )}
                                    />
                                    {option.name}
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
};


type SortableColumn = 'member' | 'role' | 'team' | 'assignedHours' | 'leaveHours' | 'expectedHours' | 'loggedHours' | 'remainingHours' | 'inOfficePercentage';


export default function ReportsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { teamMembers } = useMembers();
  const { currentUser } = useAuth();
  const { publicHolidays, customHolidays, holidayRequests, annualLeaveAllowance } = useHolidays();
  const { timeEntries } = useTimeTracking();
  const { t } = useLanguage();
  const { teams } = useTeams();
  const { projects } = useProjects();
  const tab = searchParams.get('tab') || 'team-report';

  const [periodType, setPeriodType] = React.useState<'custom' | 'weekly' | 'monthly' | 'yearly'>('monthly');
  const [reportView, setReportView] = React.useState<'consolidated' | 'project' | 'task' | 'detailed'>('consolidated');
  const [selectedYear, setSelectedYear] = React.useState<number>(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = React.useState<number>(new Date().getMonth());
  const [selectedWeekIndex, setSelectedWeekIndex] = React.useState<number>(0);
  const [selectedTeams, setSelectedTeams] = React.useState<string[]>(['all-teams']);
  const [selectedStatus, setSelectedStatus] = React.useState<string>('Active');
  const [customDateRange, setCustomDateRange] = React.useState<DateRange | undefined>({
      from: startOfMonth(new Date()),
      to: endOfMonth(new Date()),
  });

  const [fromInputValue, setFromInputValue] = React.useState(customDateRange?.from ? format(customDateRange.from, 'dd/MM/yyyy') : '');
  const [toInputValue, setToInputValue] = React.useState(customDateRange?.to ? format(customDateRange.to, 'dd/MM/yyyy') : '');
  const [isFromPickerOpen, setIsFromPickerOpen] = React.useState(false);
  const [isToPickerOpen, setIsToPickerOpen] = React.useState(false);

  const [sortColumn, setSortColumn] = React.useState<SortableColumn>('member');
  const [sortDirection, setSortDirection] = React.useState<'asc' | 'desc'>('asc');


  const weeksInMonth = React.useMemo(() => getWeeksForMonth(selectedYear, selectedMonth), [selectedYear, selectedMonth]);
  
  React.useEffect(() => {
    const today = new Date();
    if(getYear(today) === selectedYear && getMonth(today) === selectedMonth) {
      const currentWeekIndex = weeksInMonth.findIndex(w => isWithinInterval(today, {start: w.start, end: w.end}));
      setSelectedWeekIndex(currentWeekIndex >= 0 ? currentWeekIndex : 0);
    } else {
      setSelectedWeekIndex(0);
    }
  }, [selectedYear, selectedMonth, weeksInMonth]);

  const { periodStart, periodEnd } = React.useMemo(() => {
    let start: Date;
    let end: Date;
    
    if (periodType === 'custom') {
        start = customDateRange?.from ? startOfDay(customDateRange.from) : startOfDay(new Date());
        end = customDateRange?.to ? endOfDay(customDateRange.to) : endOfDay(new Date());
    } else if (periodType === 'weekly') {
      const week = weeksInMonth[selectedWeekIndex];
      start = week ? startOfDay(week.start) : startOfMonth(new Date(selectedYear, selectedMonth));
      end = week ? endOfDay(week.end) : endOfMonth(new Date(selectedYear, selectedMonth));
    } else if (periodType === 'monthly') {
      start = startOfMonth(new Date(selectedYear, selectedMonth));
      end = endOfMonth(new Date(selectedYear, selectedMonth));
    } else { // yearly
      start = startOfYear(new Date(selectedYear, 0, 1));
      end = endOfYear(new Date(selectedYear, 11, 31));
    }
    return { periodStart: start, periodEnd: end };
  }, [periodType, customDateRange, selectedYear, selectedMonth, selectedWeekIndex, weeksInMonth]);

  const getTeamName = React.useCallback((teamId?: string) => {
      if (!teamId) return 'N/A';
      const team = teams.find(t => t.id === teamId);
      return team?.name ?? 'N/A';
  }, [teams]);

  const reports = React.useMemo(() => {
    const baseVisibleMembers = teamMembers.filter(member => {
      if (currentUser.role === 'Super Admin' || currentUser.role === 'Team Lead') return true;
      return member.id === currentUser.id;
    });

    const visibleMembers = baseVisibleMembers.filter(member => {
        // Team filter
        let teamMatches = false;
        if (selectedTeams.includes('all-teams')) {
            teamMatches = true;
        } else if (selectedTeams.includes('no-team') && !member.teamId) {
            teamMatches = true;
        } else if (member.teamId && selectedTeams.includes(member.teamId)) {
            teamMatches = true;
        }
        
        if (!teamMatches) return false;

        // Status filter
        if (selectedStatus === 'all-status') return true;
        
        const today = startOfDay(new Date());
        const contracts = member.contracts || [];
        if (contracts.length === 0) return selectedStatus === 'Expired';

        const hasActiveOrUpcoming = contracts.some(c => {
            const end = c.endDate ? parseISO(c.endDate) : new Date('9999-12-31');
            return today.getTime() <= end.getTime();
        });

        const memberStatus = hasActiveOrUpcoming ? 'Active' : 'Expired';
        return memberStatus === selectedStatus;
    });
    
    const visibleMemberIds = visibleMembers.map(m => m.id);
    const filteredTimeEntries = timeEntries.filter(entry => {
      const entryDate = parseISO(entry.date);
      return visibleMemberIds.includes(entry.userId) && isWithinInterval(entryDate, { start: periodStart, end: periodEnd });
    });
    
    const projectAgg: Record<string, ProjectReportItem> = {};
    const taskAgg: Record<string, TaskReportItem> = {};
    const detailedAgg: Record<string, DetailedReportData> = {};

    visibleMembers.forEach(member => {
        detailedAgg[member.id] = {
            user: member, assignedHours: 0, leaveHours: 0, expectedHours: 0, loggedHours: 0, remainingHours: 0,
            projects: []
        };
    });

    // Calculations for all views - Raw Logged Hours
    filteredTimeEntries.forEach(entry => {
        const [projectName, ...taskParts] = entry.task.split(' - ');
        const taskName = taskParts.join(' - ') || 'Unspecified';
        const member = teamMembers.find(m => m.id === entry.userId);

        if (!member) return;

        // Project Level
        const projectKey = `${entry.userId}__${projectName}`;
        if (!projectAgg[projectKey]) projectAgg[projectKey] = { key: projectKey, member, projectName, loggedHours: 0 };
        projectAgg[projectKey].loggedHours += entry.duration;

        // Task Level
        const taskKey = `${entry.userId}__${taskName}`;
        if (!taskAgg[taskKey]) taskAgg[taskKey] = { key: taskKey, member, taskName, loggedHours: 0 };
        taskAgg[taskKey].loggedHours += entry.duration;

        // Detailed Level
        if (detailedAgg[entry.userId]) {
            let project = detailedAgg[entry.userId].projects.find(p => p.name === projectName);
            if (!project) {
                project = { name: projectName, loggedHours: 0, tasks: [] };
                detailedAgg[entry.userId].projects.push(project);
            }
            project.loggedHours += entry.duration;

            let task = project.tasks.find(t => t.name === taskName);
            if (!task) {
                task = { name: taskName, loggedHours: 0 };
                project.tasks.push(task);
            }
            task.loggedHours += entry.duration;
        }
    });

    // Breakdown range into monthly segments for accurate year-specific calculations
    const monthSegments: { start: Date; end: Date; year: number }[] = [];
    let current = new Date(periodStart);
    while (current <= periodEnd) {
        const segStart = max([current, startOfMonth(current)]);
        const segEnd = min([periodEnd, endOfMonth(current)]);
        monthSegments.push({ start: segStart, end: segEnd, year: getYear(current) });
        current = startOfMonth(addDays(endOfMonth(current), 1));
    }

    // Pre-calculate stats per encountered year
    const uniqueYears = Array.from(new Set(monthSegments.map(s => s.year)));
    const yearStats: Record<number, { publicHolidays: any[] }> = {};
    uniqueYears.forEach(year => {
        const phInYear = publicHolidays.filter(h => getYear(parseISO(h.date)) === year);
        yearStats[year] = { 
            publicHolidays: phInYear 
        };
    });

    const consolidatedData = visibleMembers.map(member => {
        let totalAssigned = 0;
        let totalLeave = 0;

        for (let d = new Date(periodStart); d <= periodEnd; d = addDays(d, 1)) {
            const dayOfWeek = getDay(d);
            if (dayOfWeek === 0 || dayOfWeek === 6) continue;
            
            const stats = yearStats[getYear(d)];
            const userHolidaysInYear = stats ? stats.publicHolidays.concat(
                customHolidays.filter(h => {
                    if (getYear(parseISO(h.date)) !== getYear(d)) return false;
                    const applies = (h.appliesTo === 'all-members') || (h.appliesTo === 'all-teams' && !!member.teamId) || (h.appliesTo === member.teamId);
                    return applies;
                })
            ) : [];

            const isHoliday = userHolidaysInYear.some(h => isSameDay(parseISO(h.date), d));
            if (isHoliday) continue; 

            const activeContractsOnDay = member.contracts.filter(c => {
                const contractStart = parseISO(c.startDate);
                const contractEnd = c.endDate ? parseISO(c.endDate) : endOfYear(d);
                return isWithinInterval(d, { start: contractStart, end: contractEnd });
            });

            if (activeContractsOnDay.length > 0) {
                const dailyHours = activeContractsOnDay.reduce((sum, c) => sum + c.weeklyHours, 0) / 5;
                totalAssigned += dailyHours;

                // Consumption model: check for approved leave
                const approvedLeaveRequest = holidayRequests.find(req => 
                    req.userId === member.id && 
                    req.status === 'Approved' &&
                    (req.type === 'Vacation' || req.type === 'Sick Leave') &&
                    isWithinInterval(d, { start: parseISO(req.startDate), end: parseISO(req.endDate) })
                );

                if (approvedLeaveRequest) {
                    totalLeave += dailyHours;
                    
                    // Inject virtual "Leave" project into aggregators for Project/Task/Detailed views
                    const leaveType = approvedLeaveRequest.type;

                    // 1. Add to detailedAgg
                    if (detailedAgg[member.id]) {
                        let leaveProject = detailedAgg[member.id].projects.find(p => p.name === 'Leave');
                        if (!leaveProject) {
                            leaveProject = { name: 'Leave', loggedHours: 0, tasks: [] };
                            detailedAgg[member.id].projects.push(leaveProject);
                        }
                        leaveProject.loggedHours += dailyHours;

                        let leaveTask = leaveProject.tasks.find(t => t.name === leaveType);
                        if (!leaveTask) {
                            leaveTask = { name: leaveType, loggedHours: 0 };
                            leaveProject.tasks.push(leaveTask);
                        }
                        leaveTask.loggedHours += dailyHours;
                    }

                    // 2. Add to projectAgg
                    const projectKey = `${member.id}__Leave`;
                    if (!projectAgg[projectKey]) projectAgg[projectKey] = { key: projectKey, member, projectName: 'Leave', loggedHours: 0 };
                    projectAgg[projectKey].loggedHours += dailyHours;

                    // 3. Add to taskAgg
                    const taskKey = `${member.id}__${leaveType}`;
                    if (!taskAgg[taskKey]) taskAgg[taskKey] = { key: taskKey, member, taskName: leaveType, loggedHours: 0 };
                    taskAgg[taskKey].loggedHours += dailyHours;
                }
            }
        }

        const assignedHours = parseFloat(totalAssigned.toFixed(2));
        const leaveHours = parseFloat(totalLeave.toFixed(2));
        const expectedHours = parseFloat((assignedHours - leaveHours).toFixed(2));
        
        const memberTimeEntries = filteredTimeEntries.filter(e => e.userId === member.id);
        const loggedHours = parseFloat(memberTimeEntries.reduce((acc, e) => acc + e.duration, 0).toFixed(2));
        const inOfficeHours = memberTimeEntries.filter(e => e.placeOfWork === 'In Office').reduce((acc, e) => acc + e.duration, 0);
        const inOfficePercentage = loggedHours > 0 ? (inOfficeHours / loggedHours) * 100 : 0;
        const remainingHours = parseFloat((expectedHours - loggedHours).toFixed(2));
        
        if (detailedAgg[member.id]) {
            detailedAgg[member.id] = { ...detailedAgg[member.id], assignedHours, leaveHours, expectedHours, loggedHours, remainingHours };
        }

        return { ...member, assignedHours, leaveHours, expectedHours, loggedHours, remainingHours, inOfficePercentage };
    });

    const projectReport = Object.values(projectAgg).map(item => ({ ...item, loggedHours: parseFloat(item.loggedHours.toFixed(2))})).sort((a, b) => a.member.name.localeCompare(b.member.name));
    const taskReport = Object.values(taskAgg).map(item => ({...item, loggedHours: parseFloat(item.loggedHours.toFixed(2))})).sort((a,b) => a.member.name.localeCompare(b.member.name));
    
    const detailedReport = Object.values(detailedAgg).map(userReport => ({
        ...userReport,
        projects: userReport.projects.map(p => ({
            ...p,
            loggedHours: parseFloat(p.loggedHours.toFixed(2)),
            tasks: p.tasks.map(t => ({
                ...t,
                loggedHours: parseFloat(t.loggedHours.toFixed(2))
            }))
        }))
    })).sort((a,b) => a.user.name.localeCompare(b.user.name));

    return { consolidatedData, projectReport, taskReport, detailedReport };
  }, [teamMembers, currentUser, selectedTeams, selectedStatus, timeEntries, periodStart, periodEnd, selectedYear, publicHolidays, customHolidays, holidayRequests, annualLeaveAllowance]);
  
  const sortedConsolidatedData = React.useMemo(() => {
    return [...reports.consolidatedData].sort((a, b) => {
        let comparison = 0;
        switch (sortColumn) {
            case 'member':
                comparison = a.name.localeCompare(b.name);
                break;
            case 'role':
                comparison = a.role.localeCompare(b.role);
                break;
            case 'team':
                comparison = (getTeamName(a.teamId) || '').localeCompare(getTeamName(b.teamId) || '');
                break;
            case 'assignedHours':
                comparison = a.assignedHours - b.assignedHours;
                break;
            case 'leaveHours':
                comparison = a.leaveHours - b.leaveHours;
                break;
            case 'expectedHours':
                comparison = a.expectedHours - b.expectedHours;
                break;
            case 'loggedHours':
                comparison = a.loggedHours - b.loggedHours;
                break;
            case 'remainingHours':
                comparison = a.remainingHours - b.remainingHours;
                break;
            case 'inOfficePercentage':
                comparison = a.inOfficePercentage - b.inOfficePercentage;
                break;
        }
        return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [reports.consolidatedData, sortColumn, sortDirection, getTeamName]);

  const onTabChange = (value: string) => {
    router.push(`/dashboard/reports?tab=${value}`);
  };

  const getReportTitle = () => {
    if (periodType === 'custom') {
        if (customDateRange?.from && customDateRange?.to) {
            return `Report for ${format(customDateRange.from, 'PP')} - ${format(customDateRange.to, 'PP')}`;
        }
        return 'Report for Custom Dates';
    }
    if (periodType === 'yearly') return t('reportForYear', { year: selectedYear });
    if (periodType === 'monthly') return t('reportForMonth', { month: months.find(m => m.value === selectedMonth)?.label, year: selectedYear });
    if (periodType === 'weekly' && weeksInMonth[selectedWeekIndex]) {
        const week = weeksInMonth[selectedWeekIndex];
        return t('reportForWeek', { week: selectedWeekIndex + 1, start: getDate(week.start), end: getDate(week.end), month: months[selectedMonth].label, year: selectedYear });
    }
    return t('reports');
  };

  const handleExport = () => {
      const numberFormat = { z: '0.00' };

      if (reportView === 'detailed') {
          const borderStyle = { style: "thin", color: { rgb: "000000" } };
          const headerStyle = { font: { bold: true }, fill: { fgColor: { rgb: "E0E0E0" } }, border: { top: borderStyle, bottom: borderStyle, left: borderStyle, right: borderStyle } };
          const userStyle = { font: { bold: true }, fill: { fgColor: { rgb: "BDD7EE" } }, border: { top: borderStyle, bottom: borderStyle, left: borderStyle, right: borderStyle } }; 
          const projectStyle = { fill: { fgColor: { rgb: "FFE699" } }, border: { top: borderStyle, bottom: borderStyle, left: borderStyle, right: borderStyle } };
          const taskStyle = { font: { italic: true }, border: { top: borderStyle, bottom: borderStyle, left: borderStyle, right: borderStyle } };
          
          const dataForExport: any[][] = [];
          const title = getReportTitle();
          dataForExport.push([{ v: title }]);
          dataForExport.push([]);
          
          const headers = [t('member'), t('role'), t('team'), t('assignedHours'), t('leaveHours'), t('expected'), t('logged'), t('remaining')];
          dataForExport.push(headers.map(h => ({ v: h, s: headerStyle })));

          reports.detailedReport.forEach(userRow => {
              const userRowData = [
                  { v: userRow.user.name, s: userStyle }, 
                  { v: userRow.user.role, s: userStyle },
                  { v: getTeamName(userRow.user.teamId), s: userStyle },
                  { v: userRow.assignedHours, t: 'n', s: {...userStyle, ...numberFormat} }, 
                  { v: userRow.leaveHours, t: 'n', s: {...userStyle, ...numberFormat} },
                  { v: userRow.expectedHours, t: 'n', s: {...userStyle, ...numberFormat} }, 
                  { v: userRow.loggedHours, t: 'n', s: {...userStyle, ...numberFormat} },
                  { v: userRow.remainingHours, t: 'n', s: { ...userStyle, ...numberFormat, font: { ...userStyle.font, color: { rgb: userRow.remainingHours < 0 ? "008000" : "000000" } } } }
              ];
              dataForExport.push(userRowData);
              
              userRow.projects.forEach(projectRow => {
                  const projectRowData = [
                      { v: `    Project- ${projectRow.name}`, s: projectStyle }, { v: '', s: projectStyle }, { v: '', s: projectStyle }, { v: '', s: projectStyle }, { v: '', s: projectStyle }, { v: '', s: projectStyle },
                      { v: projectRow.loggedHours, t: 'n', s: { ...projectStyle, ...numberFormat } }, { v: '', s: projectStyle }
                  ];
                  dataForExport.push(projectRowData);
                
                  projectRow.tasks.forEach(taskRow => {
                      const taskRowData = [
                          { v: `        Task- ${taskRow.name}`, s: taskStyle }, { v: '', s: taskStyle }, { v: '', s: taskStyle }, { v: '', s: taskStyle }, { v: '', s: taskStyle }, { v: '', s: taskStyle },
                          { v: taskRow.loggedHours, t: 'n', s: { ...taskStyle, ...numberFormat } }, { v: '', s: taskStyle }
                      ];
                      dataForExport.push(taskRowData);
                  });
              });
          });
          
          const worksheet = XLSX.utils.aoa_to_sheet(dataForExport);
          
          const colWidths = headers.map((header, i) => {
              let maxWidth = header.length;
              dataForExport.slice(2).forEach(row => {
                  const cellValue = row[i]?.v ? String(row[i].v) : '';
                  if (cellValue.length > maxWidth) {
                      maxWidth = cellValue.length;
                  }
              });
              return { wch: maxWidth + 2 };
          });
          worksheet['!cols'] = colWidths;
          
          const workbook = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(workbook, worksheet, "Detailed Report");
          XLSX.writeFile(workbook, `detailed_report_${new Date().toISOString().split('T')[0]}.xlsx`);

      } else {
          const titleStyle = { font: { bold: true } };
          const headerStyle = { font: { bold: true }, fill: { fgColor: { rgb: "BDD7EE" } }, border: { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } } };
          const userRowStyle = { border: { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } } };
          const numberCellStyle = { ...userRowStyle, z: numberFormat.z, alignment: { horizontal: 'right' } };
          const percentageCellStyle = { ...userRowStyle, alignment: { horizontal: 'right' } };
          
          const createStyledSheet = (title: string, headers: string[], data: any[][]) => {
              const worksheetData = [
                  [{ v: title, s: titleStyle }],
                  [],
                  headers.map(h => ({ v: h, s: headerStyle })),
                  ...data.map(row => row.map((cell, index) => {
                      const isNumber = typeof cell === 'number';
                      const isPercentageColumn = headers[index] === 'In Office %';
                      if (isPercentageColumn) {
                          return { v: `${cell.toFixed(2)} %`, s: percentageCellStyle, t: 's' };
                      }
                      return {
                          v: cell,
                          s: isNumber ? numberCellStyle : userRowStyle,
                          t: isNumber ? 'n' : 's'
                      };
                  }))
              ];

              const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
              
              const columnWidths = headers.map((header, i) => {
                  let maxWidth = header.length;
                  data.forEach(row => {
                      const cellValue = row[i] ? String(row[i]) : '';
                      if (cellValue.length > maxWidth) {
                          maxWidth = cellValue.length;
                      }
                  });
                  return { wch: maxWidth + 2 };
              });

              worksheet['!cols'] = columnWidths;
              return worksheet;
          };
          
          const wb = XLSX.utils.book_new();

          const consolidatedHeaders = [t('member'), t('role'), t('team'), t('assignedHours'), t('leaveHours'), t('expected'), t('logged'), t('remaining'), 'In Office %'];
          const consolidatedReportData = sortedConsolidatedData.map(m => [m.name, m.role, getTeamName(m.teamId), m.assignedHours, m.leaveHours, m.expectedHours, m.loggedHours, m.remainingHours, m.inOfficePercentage]);
          const consolidatedSheet = createStyledSheet(getReportTitle(), consolidatedHeaders, consolidatedReportData);
          XLSX.utils.book_append_sheet(wb, consolidatedSheet, t('totalTime'));

          const projectHeaders = [t('member'), t('role'), t('team'), t('project'), t('loggedHours')];
          const projectReportData = reports.projectReport.map(item => [item.member.name, item.member.role, getTeamName(item.member.teamId), item.projectName, item.loggedHours]);
          const projectSheet = createStyledSheet(t('projectLevelReport'), projectHeaders, projectReportData);
          XLSX.utils.book_append_sheet(wb, projectSheet, t('projectLevelReport'));
          
          const taskHeaders = [t('member'), t('role'), t('team'), t('task'), t('loggedHours')];
          const taskReportData = reports.taskReport.map(item => [item.member.name, item.member.role, getTeamName(item.member.teamId), item.taskName, item.loggedHours]);
          const taskSheet = createStyledSheet(t('taskLevelReport'), taskHeaders, taskReportData);
          XLSX.utils.book_append_sheet(wb, taskSheet, t('taskLevelReport'));

          XLSX.writeFile(wb, `team_report_${new Date().toISOString().split('T')[0]}.xlsx`);
      }
  };

  const teamOptions = React.useMemo(() => [
      { id: 'no-team', name: 'No Team' },
      ...teams
  ], [teams]);
  
  const handleSort = (column: SortableColumn) => {
    setSortDirection(prevDirection => (sortColumn === column && prevDirection === 'asc' ? 'desc' : 'asc'));
    setSortColumn(column);
  };
  
  const renderSortArrow = (column: SortableColumn) => {
    if (sortColumn !== column) {
      return <ArrowUpDown className="ml-2 h-4 w-4 text-muted-foreground/50" />;
    }
    return sortDirection === 'asc' ? <ArrowUpDown className="ml-2 h-4 w-4" /> : <ArrowUpDown className="ml-2 h-4 w-4" />;
  };

  const renderSharedControls = () => (
    <>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 justify-between">
            <RadioGroup value={periodType} onValueChange={(v) => setPeriodType(v as any)} className="flex items-center">
                <div className="flex items-center space-x-2"><RadioGroupItem value="custom" id="custom" /><Label htmlFor="custom">Custom</Label></div>
                <div className="flex items-center space-x-2"><RadioGroupItem value="weekly" id="weekly" /><Label htmlFor="weekly">{t('weekly')}</Label></div>
                <div className="flex items-center space-x-2"><RadioGroupItem value="monthly" id="monthly" /><Label htmlFor="monthly">{t('monthly')}</Label></div>
                <div className="flex items-center space-x-2"><RadioGroupItem value="yearly" id="yearly" /><Label htmlFor="yearly">{t('yearly')}</Label></div>
            </RadioGroup>
            <div className="flex items-center gap-2">
                    {periodType === 'custom' && (
                    <div className="flex items-center gap-2">
                            <div className="relative">
                            <Input
                                id="from"
                                placeholder="DD/MM/YYYY"
                                value={fromInputValue}
                                onChange={(e) => {
                                    const value = e.target.value;
                                    setFromInputValue(value);
                                    const parsedDate = parse(value, 'dd/MM/yyyy', new Date());
                                    if (isValid(parsedDate) && getYear(parsedDate) > 1000) {
                                        setCustomDateRange(prev => ({...prev, from: parsedDate}))
                                    }
                                }}
                                onBlur={() => setFromInputValue(customDateRange?.from ? format(customDateRange.from, 'dd/MM/yyyy') : '')}
                                className="w-[150px] pr-10"
                            />
                            <Popover open={isFromPickerOpen} onOpenChange={setIsFromPickerOpen}>
                                <PopoverTrigger asChild>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="absolute inset-y-0 right-0 h-full px-3 text-muted-foreground hover:bg-transparent"
                                    >
                                        <CalendarIcon className="h-4 w-4" />
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                    <Calendar
                                        initialFocus
                                        mode="single"
                                        selected={customDateRange?.from}
                                        onSelect={(date) => {
                                            setCustomDateRange(prev => ({...prev, from: date}));
                                            setFromInputValue(date ? format(date, 'dd/MM/yyyy') : '');
                                            setIsFromPickerOpen(false);
                                        }}
                                            captionLayout="dropdown-buttons"
                                        fromYear={new Date().getFullYear() - 10}
                                        toYear={new Date().getFullYear() + 10}
                                    />
                                </PopoverContent>
                            </Popover>
                        </div>
                        <div className="relative">
                                <Input
                                id="to"
                                placeholder="DD/MM/YYYY"
                                value={toInputValue}
                                onChange={(e) => {
                                    const value = e.target.value;
                                    setToInputValue(value);
                                    const parsedDate = parse(value, 'dd/MM/yyyy', new Date());
                                    if (isValid(parsedDate) && getYear(parsedDate) > 1000) {
                                        setCustomDateRange(prev => ({...prev, to: parsedDate}))
                                    }
                                }}
                                onBlur={() => setToInputValue(customDateRange?.to ? format(customDateRange.to, 'dd/MM/yyyy') : '')}
                                className="w-[150px] pr-10"
                            />
                            <Popover open={isToPickerOpen} onOpenChange={setIsToPickerOpen}>
                                <PopoverTrigger asChild>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="absolute inset-y-0 right-0 h-full px-3 text-muted-foreground hover:bg-transparent"
                                    >
                                        <CalendarIcon className="h-4 w-4" />
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                    <Calendar
                                        initialFocus
                                        mode="single"
                                        selected={customDateRange?.to}
                                        onSelect={(date) => {
                                            setCustomDateRange(prev => ({...prev, to: date}));
                                            setToInputValue(date ? format(date, 'dd/MM/yyyy') : '');
                                            setIsToPickerOpen(false);
                                        }}
                                        disabled={{ before: customDateRange?.from }}
                                            captionLayout="dropdown-buttons"
                                        fromYear={new Date().getFullYear() - 10}
                                        toYear={new Date().getFullYear() + 10}
                                    />
                                </PopoverContent>
                            </Popover>
                        </div>
                    </div>
                    )}
                    {periodType === 'weekly' && (
                    <Select value={String(selectedWeekIndex)} onValueChange={(v) => setSelectedWeekIndex(Number(v))}>
                        <SelectTrigger className="w-full sm:w-[130px]">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {weeksInMonth.map((week, index) => (
                                <SelectItem key={index} value={String(index)}>
                                    W{index + 1} ({getDate(week.start)}-{getDate(week.end)})
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    )}
                { (periodType === 'monthly' || periodType === 'weekly') && (
                    <Select value={String(selectedMonth)} onValueChange={(value) => setSelectedMonth(Number(value))}>
                        <SelectTrigger className="w-[130px]"><SelectValue placeholder="Select month" /></SelectTrigger>
                        <SelectContent>{months.map(month => (<SelectItem key={month.value} value={String(month.value)}>{month.label}</SelectItem>))}</SelectContent>
                    </Select>
                )}
                { (periodType !== 'custom') && (
                    <Select value={String(selectedYear)} onValueChange={(value) => setSelectedYear(Number(value))}>
                        <SelectTrigger className="w-[100px]"><SelectValue placeholder="Select year" /></SelectTrigger>
                        <SelectContent>{years.map(year => (<SelectItem key={year} value={String(year)}>{year}</SelectItem>))}</SelectContent>
                    </Select>
                )}
            </div>
        </div>
        <div className="flex items-center justify-between mt-4 pt-4 border-t">
        {tab === 'team-report' && (
            <RadioGroup value={reportView} onValueChange={(v) => setReportView(v as any)} className="flex flex-wrap items-center gap-4">
                <div className="flex items-center space-x-2"><RadioGroupItem value="consolidated" id="r-consolidated" /><Label htmlFor="r-consolidated">{t('consolidated')}</Label></div>
                <div className="flex items-center space-x-2"><RadioGroupItem value="project" id="r-project" /><Label htmlFor="r-project">{t('projectLevel')}</Label></div>
                <div className="flex items-center space-x-2"><RadioGroupItem value="task" id="r-task" /><Label htmlFor="r-task">{t('taskLevel')}</Label></div>
                <div className="flex items-center space-x-2"><RadioGroupItem value="detailed" id="r-detailed" /><Label htmlFor="r-detailed">{t('detailed')}</Label></div>
            </RadioGroup>
        )}
        <div className={cn("flex items-center gap-2", tab !== 'team-report' && "w-full justify-end")}>
            {tab === 'team-report' && (
                <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                    <SelectTrigger className="w-[150px]">
                        <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all-status">All Status</SelectItem>
                        <SelectItem value="Active">Active</SelectItem>
                        <SelectItem value="Expired">Expired</SelectItem>
                    </SelectContent>
                </Select>
            )}
            {currentUser.role === 'Super Admin' && tab === 'team-report' && (
                <MultiSelect 
                    options={teamOptions}
                    selected={selectedTeams}
                    onChange={setSelectedTeams}
                    placeholder="Filter by team..."
                />
            )}
            <Button variant="outline" onClick={handleExport}>
                <FileUp className="mr-2 h-4 w-4" /> {t('export')}
            </Button>
            </div>
        </div>
    </>
  )

  const availableTabs = [
      { value: 'team-report', label: t('teamReport')},
      { value: 'individual-report', label: t('individualReport')},
      { value: 'project-report', label: t('projectReport'), roles: ['Super Admin'] },
  ].filter(t => !t.roles || t.roles.includes(currentUser.role));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
        <div>
          <h1 className="text-3xl font-bold font-headline">{t('reports')}</h1>
          <p className="text-muted-foreground">{t('reportsSubtitle')}</p>
        </div>
      </div>
      <Tabs value={tab} onValueChange={onTabChange}>
            <TabsList className={cn("grid w-full", `grid-cols-${availableTabs.length}`, "md:w-[600px]")}>
                {availableTabs.map(t => <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>)}
            </TabsList>
            <TabsContent value="team-report" className="mt-4">
              <Card>
                <CardHeader>
                    <div className="space-y-1.5">
                        <CardTitle>{t('teamHoursSummary')}</CardTitle>
                        <CardDescription>{getReportTitle()}</CardDescription>
                    </div>
                    <div className="pt-4">
                      {renderSharedControls()}
                    </div>
                </CardHeader>
                <CardContent>
                  {reportView === 'consolidated' && (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className={currentUser.role === 'Super Admin' ? 'cursor-pointer' : ''} onClick={() => currentUser.role === 'Super Admin' && handleSort('member')}>
                            <div className="flex items-center">{t('member')}{currentUser.role === 'Super Admin' && renderSortArrow('member')}</div>
                          </TableHead>
                          <TableHead className={cn("hidden md:table-cell", currentUser.role === 'Super Admin' ? 'cursor-pointer' : '')} onClick={() => currentUser.role === 'Super Admin' && handleSort('role')}>
                             <div className="flex items-center">{t('role')}{currentUser.role === 'Super Admin' && renderSortArrow('role')}</div>
                          </TableHead>
                          <TableHead className={cn("hidden md:table-cell", currentUser.role === 'Super Admin' ? 'cursor-pointer' : '')} onClick={() => currentUser.role === 'Super Admin' && handleSort('team')}>
                            <div className="flex items-center">{t('team')}{currentUser.role === 'Super Admin' && renderSortArrow('team')}</div>
                          </TableHead>
                          <TableHead className={cn("text-right", currentUser.role === 'Super Admin' ? 'cursor-pointer' : '')} onClick={() => currentUser.role === 'Super Admin' && handleSort('assignedHours')}>
                            <div className="flex items-center justify-end">{t('assignedHours')}{currentUser.role === 'Super Admin' && renderSortArrow('assignedHours')}</div>
                          </TableHead>
                           <TableHead className={cn("text-right", currentUser.role === 'Super Admin' ? 'cursor-pointer' : '')} onClick={() => currentUser.role === 'Super Admin' && handleSort('leaveHours')}>
                            <div className="flex items-center justify-end">{t('leaveHours')}{currentUser.role === 'Super Admin' && renderSortArrow('leaveHours')}</div>
                          </TableHead>
                          <TableHead className={cn("text-right", currentUser.role === 'Super Admin' ? 'cursor-pointer' : '')} onClick={() => currentUser.role === 'Super Admin' && handleSort('expectedHours')}>
                            <div className="flex items-center justify-end">{t('expected')}{currentUser.role === 'Super Admin' && renderSortArrow('expectedHours')}</div>
                          </TableHead>
                          <TableHead className={cn("text-right", currentUser.role === 'Super Admin' ? 'cursor-pointer' : '')} onClick={() => currentUser.role === 'Super Admin' && handleSort('loggedHours')}>
                            <div className="flex items-center justify-end">{t('logged')}{currentUser.role === 'Super Admin' && renderSortArrow('loggedHours')}</div>
                          </TableHead>
                          <TableHead className={cn("text-right", currentUser.role === 'Super Admin' ? 'cursor-pointer' : '')} onClick={() => currentUser.role === 'Super Admin' && handleSort('remainingHours')}>
                            <div className="flex items-center justify-end">{t('remaining')}{currentUser.role === 'Super Admin' && renderSortArrow('remainingHours')}</div>
                          </TableHead>
                           <TableHead className={cn("text-right", currentUser.role === 'Super Admin' ? 'cursor-pointer' : '')} onClick={() => currentUser.role === 'Super Admin' && handleSort('inOfficePercentage')}>
                            <div className="flex items-center justify-end">In Office %{currentUser.role === 'Super Admin' && renderSortArrow('inOfficePercentage')}</div>
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sortedConsolidatedData.map(member => (
                          <TableRow key={member.id}>
                            <TableCell>
                              <div className="flex items-center gap-3">
                                <Avatar className="w-10 h-10"><AvatarImage src={member.avatar} alt={member.name} data-ai-hint="person avatar"/><AvatarFallback>{member.name.split(' ').map(n => n[0]).join('')}</AvatarFallback></Avatar>
                                <div><Link href={`/dashboard/reports?tab=individual-report&userId=${member.id}`} className="font-medium hover:underline">{member.name}</Link><p className="text-sm text-muted-foreground hidden sm:table-cell">{member.email}</p></div>
                              </div>
                            </TableCell>
                            <TableCell className="hidden md:table-cell"><Badge variant={member.role === 'Team Lead' || member.role === 'Super Admin' ? "default" : "secondary"}>{member.role}</Badge></TableCell>
                            <TableCell className="hidden md:table-cell">{getTeamName(member.teamId)}</TableCell>
                            <TableCell className="text-right font-mono">{member.assignedHours.toFixed(2)}h</TableCell>
                            <TableCell className="text-right font-mono">{member.leaveHours.toFixed(2)}h</TableCell>
                            <TableCell className="text-right font-mono">{member.expectedHours.toFixed(2)}h</TableCell>
                            <TableCell className="text-right font-mono">{member.loggedHours.toFixed(2)}h</TableCell>
                            <TableCell className={cn("text-right font-mono", member.remainingHours < 0 && "text-green-600")}>{member.remainingHours.toFixed(2)}h</TableCell>
                            <TableCell className="text-right font-mono">{member.inOfficePercentage.toFixed(2)}%</TableCell>
                          </TableRow>
                        ))}
                        {reports.consolidatedData.length === 0 && (<TableRow><TableCell colSpan={8} className="text-center h-24">{t('noTeamMembers')}</TableCell></TableRow>)}
                      </TableBody>
                    </Table>
                  )}
                  {reportView === 'project' && (
                    <Table>
                      <TableHeader><TableRow><TableHead>{t('member')}</TableHead><TableHead className="hidden md:table-cell">{t('role')}</TableHead><TableHead className="hidden md:table-cell">{t('team')}</TableHead><TableHead>{t('project')}</TableHead><TableHead className="text-right">{t('loggedHours')}</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {reports.projectReport.map(item => (
                          <TableRow key={item.key}>
                            <TableCell>
                              <div className="flex items-center gap-3">
                                <Avatar className="w-10 h-10"><AvatarImage src={item.member.avatar} alt={item.member.name} data-ai-hint="person avatar"/><AvatarFallback>{item.member.name.split(' ').map(n => n[0]).join('')}</AvatarFallback></Avatar>
                                <div><Link href={`/dashboard/reports?tab=individual-report&userId=${item.member.id}`} className="font-medium hover:underline">{item.member.name}</Link><p className="text-sm text-muted-foreground hidden sm:table-cell">{item.member.email}</p></div>
                              </div>
                            </TableCell>
                            <TableCell className="hidden md:table-cell"><Badge variant={item.member.role === 'Team Lead' || item.member.role === 'Super Admin' ? "default" : "secondary"}>{item.member.role}</Badge></TableCell>
                            <TableCell className="hidden md:table-cell">{getTeamName(item.member.teamId)}</TableCell>
                            <TableCell className="font-medium">{item.projectName}</TableCell>
                            <TableCell className="text-right font-mono">{item.loggedHours.toFixed(2)}h</TableCell>
                          </TableRow>
                        ))}
                        {reports.projectReport.length === 0 && (<TableRow><TableCell colSpan={5} className="text-center h-24">{t('noProjectHours')}</TableCell></TableRow>)}
                      </TableBody>
                    </Table>
                  )}
                   {reportView === 'task' && (
                    <Table>
                      <TableHeader><TableRow><TableHead>{t('member')}</TableHead><TableHead className="hidden md:table-cell">{t('role')}</TableHead><TableHead className="hidden md:table-cell">{t('team')}</TableHead><TableHead>{t('task')}</TableHead><TableHead className="text-right">{t('loggedHours')}</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {reports.taskReport.map(item => (
                          <TableRow key={item.key}>
                            <TableCell>
                              <div className="flex items-center gap-3">
                                <Avatar className="w-10 h-10"><AvatarImage src={item.member.avatar} alt={item.member.name} data-ai-hint="person avatar"/><AvatarFallback>{item.member.name.split(' ').map(n => n[0]).join('')}</AvatarFallback></Avatar>
                                <div><Link href={`/dashboard/reports?tab=individual-report&userId=${item.member.id}`} className="font-medium hover:underline">{item.member.name}</Link><p className="text-sm text-muted-foreground hidden sm:table-cell">{item.member.email}</p></div>
                              </div>
                            </TableCell>
                            <TableCell className="hidden md:table-cell"><Badge variant={item.member.role === 'Team Lead' || item.member.role === 'Super Admin' ? "default" : "secondary"}>{item.member.role}</Badge></TableCell>
                            <TableCell className="hidden md:table-cell">{getTeamName(item.member.teamId)}</TableCell>
                            <TableCell className="font-medium">{item.taskName}</TableCell>
                            <TableCell className="text-right font-mono">{item.loggedHours.toFixed(2)}h</TableCell>
                          </TableRow>
                        ))}
                        {reports.taskReport.length === 0 && (<TableRow><TableCell colSpan={5} className="text-center h-24">{t('noTaskHours')}</TableCell></TableRow>)}
                      </TableBody>
                    </Table>
                  )}
                  {reportView === 'detailed' && (
                      <DetailedReport data={reports.detailedReport} />
                  )}
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="project-report" className="mt-4">
              <Card>
                 <CardHeader>
                    <div className="space-y-1.5">
                        <CardTitle>{t('projectReport')}</CardTitle>
                        <CardDescription>{getReportTitle()}</CardDescription>
                    </div>
                    <div className="pt-4">
                      {renderSharedControls()}
                    </div>
                </CardHeader>
                <CardContent>
                    <ProjectReport 
                      projects={projects}
                      timeEntries={timeEntries}
                      periodType={periodType}
                      selectedYear={selectedYear}
                      selectedMonth={selectedMonth}
                      selectedWeekIndex={selectedWeekIndex}
                      weeksInMonth={weeksInMonth}
                      customDateRange={customDateRange}
                    />
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="individual-report" className="mt-4">
                <IndividualReport />
            </TabsContent>
        </Tabs>
    </div>
  );
}
