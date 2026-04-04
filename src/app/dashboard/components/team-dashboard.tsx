
"use client";

import { useMemo } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { isSameDay, startOfMonth, getDay, addDays, endOfMonth, isWithinInterval, startOfYear, endOfYear, getYear, parseISO, isSameMonth } from "date-fns";
import { useTimeTracking } from "../contexts/TimeTrackingContext";
import { useMembers } from "../contexts/MembersContext";
import { useHolidays } from "../contexts/HolidaysContext";
import { useAuth } from "../contexts/AuthContext";
import { useLanguage } from "../contexts/LanguageContext";

export function TeamDashboard() {
  const { timeEntries } = useTimeTracking();
  const { teamMembers } = useMembers();
  const { publicHolidays, customHolidays, holidayRequests, annualLeaveAllowance } = useHolidays();
  const { currentUser } = useAuth();
  const { t } = useLanguage();

  const teamPerformance = useMemo(() => {
    const visibleMembers = teamMembers.filter(member => {
        if (currentUser.role === 'Super Admin') {
            return member.id !== currentUser.id;
        }
        if (currentUser.role === 'Team Lead') {
            return member.reportsTo === currentUser.id;
        }
        return false;
    });

    const today = new Date();
    const periodStart = startOfMonth(today);
    const selectedYear = getYear(today);

    const yearEndForLeave = endOfYear(new Date(selectedYear, 11, 31));
    const publicHolidaysInYear = publicHolidays.filter(h => getYear(parseISO(h.date)) === selectedYear);

    return visibleMembers.map(member => {
      const userHolidaysInYear = publicHolidaysInYear
        .concat(customHolidays.filter(h => {
            if (getYear(parseISO(h.date)) !== selectedYear) return false;
            const applies = (h.appliesTo === 'all-members') || (h.appliesTo === 'all-teams' && !!member.teamId) || (h.appliesTo === member.teamId);
            return applies;
        }));
      
      // Calculate Logged Hours for the month so far
      const userTimeEntries = timeEntries.filter(entry => {
        const entryDate = parseISO(entry.date);
        return entry.userId === member.id && isSameMonth(entryDate, today);
      });
      const loggedHours = userTimeEntries.reduce((acc, entry) => acc + entry.duration, 0);

      // Performance Calculation (Consumption Model)
      let totalAssignedSoFar = 0;
      let totalLeaveSoFar = 0;

      for (let d = new Date(periodStart); d <= today; d = addDays(d, 1)) {
          const dayOfWeek = getDay(d);
          if (dayOfWeek === 0 || dayOfWeek === 6) continue;
          
          const isHoliday = userHolidaysInYear.some(h => isSameDay(parseISO(h.date), d));
          if (isHoliday) continue;
          
          const activeContractsOnDay = member.contracts.filter(c => {
              const contractStart = parseISO(c.startDate);
              const contractEnd = c.endDate ? parseISO(c.endDate) : yearEndForLeave;
              return isWithinInterval(d, { start: contractStart, end: contractEnd });
          });

          if (activeContractsOnDay.length > 0) {
              const dailyHours = activeContractsOnDay.reduce((sum, c) => sum + c.weeklyHours, 0) / 5;
              totalAssignedSoFar += dailyHours;

              // Check for approved leave
              const hasApprovedLeave = holidayRequests.some(req => 
                  req.userId === member.id && 
                  req.status === 'Approved' &&
                  (req.type === 'Vacation' || req.type === 'Sick Leave') &&
                  isWithinInterval(d, { start: parseISO(req.startDate), end: parseISO(req.endDate) })
              );

              if (hasApprovedLeave) {
                  totalLeaveSoFar += dailyHours;
              }
          }
      }
      
      const expectedHoursSoFar = totalAssignedSoFar - totalLeaveSoFar;
      const performance = loggedHours - expectedHoursSoFar;

      return {
        ...member,
        totalHours: loggedHours,
        expectedHours: expectedHoursSoFar,
        performance,
      }
    });
  }, [timeEntries, teamMembers, publicHolidays, customHolidays, holidayRequests, currentUser, annualLeaveAllowance]);

  const usersWithOvertime = teamPerformance
    .filter(u => u.performance > 0)
    .sort((a, b) => b.performance - a.performance);
  
  const usersWithDeficit = teamPerformance
    .filter(u => u.performance < 0)
    .sort((a, b) => a.performance - b.performance);
  
  const totalTeamHours = teamPerformance.reduce((acc, member) => acc + member.totalHours, 0);
  const totalExpectedHours = teamPerformance.reduce((acc, member) => acc + member.expectedHours, 0);
  const totalPerformance = teamPerformance.reduce((acc, member) => acc + member.performance, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold font-headline">{t('teamDashboardTitle')}</h1>
        <p className="text-muted-foreground">{t('teamDashboardSubtitle')}</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
            <CardHeader>
                <CardTitle>{t('teamMembersTitle')}</CardTitle>
                <CardDescription>{t('teamMembersDesc')}</CardDescription>
            </CardHeader>
            <CardContent>
                <p className="text-3xl font-bold">{teamPerformance.length}</p>
            </CardContent>
        </Card>
        <Card>
            <CardHeader>
                <CardTitle>{t('totalHoursLoggedTitle')}</CardTitle>
                <CardDescription>{t('totalHoursLoggedDesc')}</CardDescription>
            </CardHeader>
            <CardContent>
                <p className="text-3xl font-bold">{totalTeamHours.toFixed(2)}h</p>
            </CardContent>
        </Card>
         <Card>
            <CardHeader>
                <CardTitle>{t('totalExpectedHoursTitle')}</CardTitle>
                <CardDescription>{t('totalExpectedHoursDesc')}</CardDescription>
            </CardHeader>
            <CardContent>
                <p className="text-3xl font-bold">{totalExpectedHours.toFixed(2)}h</p>
            </CardContent>
        </Card>
        <Card>
            <CardHeader>
                <CardTitle>{t('teamPerformanceTitle')}</CardTitle>
                <CardDescription>{t('teamPerformanceDesc')}</CardDescription>
            </CardHeader>
            <CardContent>
                <p className={`text-3xl font-bold ${totalPerformance < 0 ? 'text-destructive' : ''}`}>
                    { totalPerformance >= 0 ? '+' : '' }
                    {totalPerformance.toFixed(2)}h
                </p>
            </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ArrowUp className="w-5 h-5 text-green-600" /> {t('usersWithOvertimeTitle')}
            </CardTitle>
            <CardDescription>{t('usersWithOvertimeDesc')}</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>{t('member')}</TableHead>
                        <TableHead className="text-right">{t('overtime')}</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {usersWithOvertime.length > 0 ? usersWithOvertime.map(user => (
                        <TableRow key={user.id}>
                            <TableCell>
                                <div className="flex items-center gap-3">
                                    <Avatar className="w-9 h-9">
                                        <AvatarImage src={user.avatar} alt={user.name} data-ai-hint="person avatar"/>
                                        <AvatarFallback>{user.name.split(' ').map(n => n[0]).join('')}</AvatarFallback>
                                    </Avatar>
                                    <div>
                                        <p className="font-medium">{user.name}</p>
                                        <p className="text-xs text-muted-foreground">{user.email}</p>
                                    </div>
                                </div>
                            </TableCell>
                            <TableCell className="text-right font-mono text-green-600">+{user.performance.toFixed(2)}h</TableCell>
                        </TableRow>
                    )) : (
                        <TableRow>
                            <TableCell colSpan={2} className="h-24 text-center">{t('noUsersWithOvertime')}</TableCell>
                        </TableRow>
                    )}
                </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ArrowDown className="w-5 h-5 text-destructive" /> {t('usersWithDeficitTitle')}
            </CardTitle>
            <CardDescription>{t('usersWithDeficitDesc')}</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>{t('member')}</TableHead>
                        <TableHead className="text-right">{t('deficit')}</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {usersWithDeficit.length > 0 ? usersWithDeficit.map(user => (
                        <TableRow key={user.id}>
                            <TableCell>
                                <div className="flex items-center gap-3">
                                    <Avatar className="w-9 h-9">
                                        <AvatarImage src={user.avatar} alt={user.name} data-ai-hint="person avatar"/>
                                        <AvatarFallback>{user.name.split(' ').map(n => n[0]).join('')}</AvatarFallback>
                                    </Avatar>
                                    <div>
                                        <p className="font-medium">{user.name}</p>
                                        <p className="text-xs text-muted-foreground">{user.email}</p>
                                    </div>
                                </div>
                            </TableCell>
                            <TableCell className="text-right font-mono text-destructive">{user.performance.toFixed(2)}h</TableCell>
                        </TableRow>
                    )) : (
                        <TableRow>
                            <TableCell colSpan={2} className="h-24 text-center">{t('noUsersWithDeficit')}</TableCell>
                        </TableRow>
                    )}
                </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
