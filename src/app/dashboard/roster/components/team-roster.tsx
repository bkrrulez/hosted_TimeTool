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
import { useMembers } from '../../contexts/MembersContext';
import { useTeams } from '../../contexts/TeamsContext';
import { getDay, format, DayProps, isSameDay, addDays } from 'date-fns';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { MarkAbsenceDialog } from './mark-absence-dialog';
import { User, Absence } from '@/lib/types';
import { toast } from '@/hooks/use-toast';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';


const months = Array.from({ length: 12 }, (_, i) => ({
  value: i,
  label: new Date(0, i).toLocaleString('default', { month: 'long' }),
}));
const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);

type SortableColumn = 'name' | 'email' | 'team';

export function TeamRoster() {
    const { currentUser } = useAuth();
    const { teamMembers } = useMembers();
    const { timeEntries } = useTimeTracking();
    const { publicHolidays, customHolidays } = useHolidays();
    const { absences, addAbsence, deleteAbsencesInRange } = useRoster();
    const { teams } = useTeams();

    const [selectedDate, setSelectedDate] = React.useState(new Date());
    const [selectedTeam, setSelectedTeam] = React.useState('all');
    const [expandedUser, setExpandedUser] = React.useState<string | null>(null);
    const [sortColumn, setSortColumn] = React.useState<SortableColumn>('name');
    const [sortDirection, setSortDirection] = React.useState<'asc' | 'desc'>('asc');
    const [isAbsenceDialogOpen, setIsAbsenceDialogOpen] = React.useState(false);
    const [editingAbsence, setEditingAbsence] = React.useState<Absence | null>(null);
    const [overwriteConfirmation, setOverwriteConfirmation] = React.useState<{ show: boolean, message: string, onConfirm: () => void }>({ show: false, message: '', onConfirm: () => {} });

    
    const visibleMembers = React.useMemo(() => {
        let members: User[];
        if (currentUser.role === 'Super Admin') {
            members = teamMembers.filter(m => m.id !== currentUser.id);
        } else { // Team Lead
            members = teamMembers.filter(m => m.reportsTo === currentUser.id);
        }
        
        if (selectedTeam !== 'all') {
            members = members.filter(m => m.teamId === selectedTeam);
        }

        return members.sort((a, b) => {
            let compareA, compareB;
            switch(sortColumn) {
                case 'email':
                    compareA = a.email;
                    compareB = b.email;
                    break;
                case 'team':
                    compareA = teams.find(t => t.id === a.teamId)?.name || '';
                    compareB = teams.find(t => t.id === b.teamId)?.name || '';
                    break;
                default: // name
                    compareA = a.name;
                    compareB = b.name;
                    break;
            }
            if (compareA < compareB) return sortDirection === 'asc' ? -1 : 1;
            if (compareA > compareB) return sortDirection === 'asc' ? 1 : -1;
            return 0;
        });

    }, [currentUser, teamMembers, selectedTeam, sortColumn, sortDirection, teams]);

    const handleSort = (column: SortableColumn) => {
        if (sortColumn === column) {
            setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortColumn(column);
            setSortDirection('asc');
        }
    };

    const renderSortArrow = (column: SortableColumn) => {
        if (sortColumn !== column) {
            return <ArrowUpDown className="ml-2 h-4 w-4 text-muted-foreground/50" />;
        }
        return sortDirection === 'asc' ? <ArrowUpDown className="ml-2 h-4 w-4" /> : <ArrowUpDown className="ml-2 h-4 w-4" />;
    };

    const handleAbsenceSave = async (from: Date, to: Date, type: AbsenceType, userId: string) => {
        const startDateStr = format(from, 'yyyy-MM-dd');
        const endDateStr = format(to, 'yyyy-MM-dd');
        
        if (type === 'Clear Absence') {
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
                    continue;
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

    const handleDayDoubleClick = (date: Date, userId: string) => {
        const dayStr = format(date, 'yyyy-MM-dd');
        const absenceOnDate = absences.find(a =>
            a.userId === userId &&
            dayStr >= a.startDate.split('T')[0] && dayStr <= a.endDate.split('T')[0]
        );

        if (absenceOnDate) {
            setEditingAbsence(absenceOnDate);
            setIsAbsenceDialogOpen(true);
        }
    };
    
    const handlePrevMonth = () => {
        setSelectedDate(prevDate => new Date(prevDate.getFullYear(), prevDate.getMonth() - 1, 1));
    };

    const handleNextMonth = () => {
        setSelectedDate(prevDate => new Date(prevDate.getFullYear(), prevDate.getMonth() + 1, 1));
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
                        onDayDoubleClick={(date) => handleDayDoubleClick(date, userId)}
                        formatters={{ formatWeekdayName: (day) => format(day, 'EEE') }}
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
                        weekStartsOn={1}
                        components={{ Day }}
                    />
                </div>
            </div>
        );
    };

    return (
        <>
            <Card>
                <CardHeader>
                    <div className="flex justify-between items-center">
                        <div>
                            <CardTitle>Team Roster</CardTitle>
                            <CardDescription>View your team's roster and mark absences.</CardDescription>
                        </div>
                        <div className="flex gap-2 items-center">
                            <Button onClick={() => { setEditingAbsence(null); setIsAbsenceDialogOpen(true); }}>Update Roster</Button>
                            <Select value={selectedTeam} onValueChange={setSelectedTeam}>
                                <SelectTrigger className="w-[180px]">
                                    <SelectValue placeholder="Filter by Team" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Teams</SelectItem>
                                    {teams.map(team => <SelectItem key={team.id} value={team.id}>{team.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                            <Select value={String(selectedDate.getMonth())} onValueChange={(v) => setSelectedDate(new Date(selectedDate.getFullYear(), parseInt(v), 1))}>
                                <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                                <SelectContent>{months.map(m => <SelectItem key={m.value} value={String(m.value)}>{m.label}</SelectItem>)}</SelectContent>
                            </Select>
                            <Select value={String(selectedDate.getFullYear())} onValueChange={(v) => setSelectedDate(new Date(parseInt(v), selectedDate.getMonth(), 1))}>
                                <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
                                <SelectContent>{years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="cursor-pointer" onClick={() => handleSort('name')}>
                                    <div className="flex items-center">Name {renderSortArrow('name')}</div>
                                </TableHead>
                                <TableHead className="cursor-pointer" onClick={() => handleSort('email')}>
                                    <div className="flex items-center">Email {renderSortArrow('email')}</div>
                                </TableHead>
                                <TableHead className="cursor-pointer" onClick={() => handleSort('team')}>
                                    <div className="flex items-center">Team {renderSortArrow('team')}</div>
                                </TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {visibleMembers.map(member => (
                                <React.Fragment key={member.id}>
                                    <TableRow onClick={() => setExpandedUser(expandedUser === member.id ? null : member.id)} className="cursor-pointer">
                                        <TableCell>
                                            <div className="flex items-center gap-3">
                                                <Avatar className="w-10 h-10">
                                                    <AvatarImage src={member.avatar} alt={member.name} data-ai-hint="person avatar"/>
                                                    <AvatarFallback>{member.name.split(' ').map(n => n[0]).join('')}</AvatarFallback>
                                                </Avatar>
                                                <span className="font-medium">{member.name}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell>{member.email}</TableCell>
                                        <TableCell>{teams.find(t => t.id === member.teamId)?.name || 'N/A'}</TableCell>
                                    </TableRow>
                                    {expandedUser === member.id && (
                                        <TableRow className="hover:bg-transparent">
                                            <TableCell colSpan={3}>
                                                <RosterCalendar userId={member.id} />
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </React.Fragment>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
            <MarkAbsenceDialog
                isOpen={isAbsenceDialogOpen}
                onOpenChange={setIsAbsenceDialogOpen}
                onSave={handleAbsenceSave}
                members={visibleMembers}
                isTeamView={true}
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
